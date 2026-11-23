import express from "express";
import type { ErrorRequestHandler, Request } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Config } from "./config.js";
import { FileStore } from "./storage.js";
import { HttpError, text } from "./errors.js";
import { adminRequest, publisherId, signAdminToken } from "./auth.js";
import { publicItem } from "./items.js";
import { aiRouter } from "./ai.js";
import { commitImage, cleanupUpload, uploadMiddleware } from "./uploads.js";
import type { ItemRecord, ItemRow, Profile } from "../shared/types.js";
function requireRecord(record: ItemRecord | null) {
  if (!record) throw new HttpError(404, "帖子不存在");
  return record;
}
function requireAdmin(req: Request, config: Config) {
  if (!adminRequest(req, config)) throw new HttpError(403, "需要管理员权限");
}
function profile(body: Record<string, unknown>, admin = false): Profile {
  const result = {
    identity: text(body.identity) || (admin ? "管理员标记" : ""),
    className: text(body.className),
    name: text(body.name) || (admin ? "管理人员" : ""),
    idNo: text(body.idNo) || (admin ? "admin" : ""),
    contact: text(body.contact) || (admin ? "—" : ""),
  };
  if (!result.name || !result.idNo || !result.contact)
    throw new HttpError(400, "请填写姓名、学号/工号和联系方式");
  return result;
}
export function createApp(
  config: Config,
  store: FileStore,
  upstream: typeof fetch = fetch,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/uploads",
    express.static(path.join(config.dataDir, "uploads"), {
      dotfiles: "deny",
      index: false,
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, time: new Date().toISOString() }),
  );
  app.use("/api/ai", aiRouter(config, upstream));
  app.post("/api/admin/login", (req, res) => {
    if (!config.adminPin || !config.tokenSecret)
      throw new HttpError(503, "管理功能尚未配置，请设置管理员口令和签名密钥");
    if (text(req.body?.pin) !== config.adminPin)
      throw new HttpError(401, "管理员口令错误");
    res.json({ token: signAdminToken(config.tokenSecret), expiresInDays: 7 });
  });
  app.post("/api/feedback", async (req, res) => {
    const message = text(req.body?.message).slice(0, 1000);
    if (!message) throw new HttpError(400, "请填写反馈内容");
    await store.addFeedback({
      id: randomUUID(),
      name: text(req.body?.name).slice(0, 40),
      contact: text(req.body?.contact).slice(0, 80),
      message,
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  });
  app.get("/api/items", async (req, res) => {
    const admin = adminRequest(req, config),
      viewer = publisherId(req);
    const items = (await store.list())
      .map((record) => publicItem(record, admin, viewer))
      .sort(
        (a, b) =>
          Number(!!a.verified) - Number(!!b.verified) ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
    res.json({ items });
  });
  app.get("/api/items/:id", async (req, res) =>
    res.json({
      item: publicItem(
        requireRecord(await store.read(text(req.params.id))),
        adminRequest(req, config),
        publisherId(req),
      ),
    }),
  );
  const upload = uploadMiddleware(config.dataDir);
  app.post("/api/items", upload, async (req, res) => {
    let image = "";
    let saved = false;
    try {
      const owner = text(req.body?.ownerId) || publisherId(req);
      if (!owner) throw new HttpError(400, "缺少发布者身份");
      if (!text(req.body?.description))
        throw new HttpError(400, "请填写物品描述");
      if (!text(req.body?.office)) throw new HttpError(400, "请选择失物招领处");
      if (!text(req.body?.place)) throw new HttpError(400, "请填写捡到场所");
      if (!req.file) throw new HttpError(400, "请上传物品照片");
      image = await commitImage(config.dataDir, req.file);
      const row: ItemRow = {
        id: "item_" + randomUUID().replaceAll("-", "").slice(0, 16),
        owner_id: owner,
        description: text(req.body.description),
        office: text(req.body.office),
        place: text(req.body.place),
        contact: text(req.body.contact),
        contact_type: text(req.body.contactType),
        contact_value: text(req.body.contactValue),
        image,
        created_at: new Date().toISOString(),
        status: "open",
        claim: null,
        verified: null,
      };
      const record = await store.mutate(row.id, (current) => {
        if (current) throw new HttpError(409, "帖子 ID 已存在");
        return { item: row, viewLogs: [] };
      });
      saved = true;
      res
        .status(201)
        .json({ item: publicItem(requireRecord(record), false, owner) });
    } finally {
      await cleanupUpload(req.file);
      if (image && !saved) await store.removeImage(image);
    }
  });
  app.patch("/api/items/:id", upload, async (req, res) => {
    let image = "",
      oldImage = "",
      saved = false;
    try {
      const admin = adminRequest(req, config),
        viewer = publisherId(req);
      const record = await store.mutate(
        text(req.params.id),
        async (current) => {
          const record = requireRecord(current),
            row = record.item;
          if (!admin && viewer !== row.owner_id)
            throw new HttpError(403, "无权修改该帖");
          if (row.verified && !admin)
            throw new HttpError(403, "管理员已核对锁定，无法修改");
          if (row.status === "claimed" && !admin)
            throw new HttpError(403, "帖子已找回锁定，无法修改");
          for (const [source, target] of [
            ["description", "description"],
            ["office", "office"],
            ["place", "place"],
            ["contact", "contact"],
            ["contactType", "contact_type"],
            ["contactValue", "contact_value"],
          ] as const)
            if (req.body[source] !== undefined)
              row[target] = text(req.body[source]);
          if (req.file) {
            image = await commitImage(config.dataDir, req.file);
            oldImage = row.image;
            row.image = image;
          }
          return record;
        },
      );
      saved = true;
      if (oldImage) await store.removeImage(oldImage);
      res.json({ item: publicItem(requireRecord(record), admin, viewer) });
    } finally {
      await cleanupUpload(req.file);
      if (image && !saved) await store.removeImage(image);
    }
  });
  app.post("/api/items/:id/unlock", async (req, res) => {
    const viewer = text(req.body?.viewerId) || publisherId(req);
    if (!viewer) throw new HttpError(400, "缺少查看者身份");
    const p = profile(req.body || {});
    const record = await store.mutate(text(req.params.id), (current) => {
      const record = requireRecord(current);
      const entry = {
        id: randomUUID(),
        item_id: record.item.id,
        viewer_id: viewer,
        identity: p.identity,
        class_name: p.className,
        name: p.name,
        id_no: p.idNo,
        contact: p.contact,
        unlocked_at: new Date().toISOString(),
      };
      const index = record.viewLogs.findIndex(
        (log) => log.viewer_id === viewer,
      );
      if (index >= 0) record.viewLogs[index] = entry;
      else record.viewLogs.unshift(entry);
      return record;
    });
    res.json({
      item: publicItem(
        requireRecord(record),
        adminRequest(req, config),
        viewer,
      ),
    });
  });
  app.post("/api/items/:id/claim", async (req, res) => {
    const admin = adminRequest(req, config),
      viewer = text(req.body?.viewerId) || publisherId(req);
    const record = await store.mutate(text(req.params.id), (current) => {
      const record = requireRecord(current),
        row = record.item;
      if (row.verified) throw new HttpError(403, "管理员已核对锁定");
      if (row.status === "claimed")
        throw new HttpError(400, "该帖已被登记找回");
      if (
        !admin &&
        (!viewer || !record.viewLogs.some((log) => log.viewer_id === viewer))
      )
        throw new HttpError(403, "请先填写个人信息查看联系方式，再登记已找回");
      row.claim = {
        ...profile(req.body || {}, admin),
        claimedAt: new Date().toISOString(),
        byAdmin: admin,
      };
      row.status = "claimed";
      return record;
    });
    res.json({
      item: publicItem(requireRecord(record), admin, publisherId(req)),
    });
  });
  for (const action of ["claim/cancel", "verify", "unverify"] as const) {
    app.post(`/api/items/:id/${action}`, async (req, res) => {
      requireAdmin(req, config);
      const record = await store.mutate(text(req.params.id), (current) => {
        const record = requireRecord(current),
          row = record.item;
        if (action === "claim/cancel") {
          if (row.verified)
            throw new HttpError(403, "已核对锁定，请先取消核对");
          row.claim = null;
          row.status = "open";
        } else if (action === "verify") {
          if (row.verified) throw new HttpError(400, "该帖已锁定");
          row.verified = {
            verifiedAt: new Date().toISOString(),
            note: text(req.body?.note),
            by: "admin",
          };
        } else row.verified = null;
        return record;
      });
      res.json({
        item: publicItem(requireRecord(record), true, publisherId(req)),
      });
    });
  }
  app.delete("/api/items/:id", async (req, res) => {
    let image = "";
    await store.mutate(text(req.params.id), (current) => {
      const row = requireRecord(current).item,
        admin = adminRequest(req, config),
        viewer = publisherId(req);
      if (!admin && viewer !== row.owner_id)
        throw new HttpError(403, "无权删除");
      if (!admin && row.verified)
        throw new HttpError(403, "管理员已核对锁定，发布者无法删除");
      image = row.image;
      return null;
    });
    await store.removeImage(image);
    res.json({ ok: true });
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  return app;
}
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status =
    err instanceof HttpError
      ? err.status
      : err?.type === "entity.too.large"
        ? 413
        : err?.name === "MulterError"
          ? 400
          : err?.name === "TimeoutError" || err?.name === "AbortError"
            ? 504
            : err instanceof SyntaxError
              ? 400
              : 500;
  if (status >= 500)
    console.error(
      "请求处理失败:",
      err instanceof HttpError ? err.message : err?.name || "Error",
    );
  res.status(status).json({
    error:
      err instanceof HttpError
        ? err.message
        : status === 413
          ? "上传内容过大"
          : status === 504
            ? "AI 请求超时，请稍后重试"
            : status === 400
              ? "请求格式或上传图片不正确"
              : "保存或读取失败，请检查服务器数据目录",
  });
};
