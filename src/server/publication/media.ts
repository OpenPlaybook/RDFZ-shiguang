import { Router } from "express";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import type { FileStore } from "../storage.js";
import { HttpError, text } from "../errors.js";
import { assertStagingOwner, stagingPath } from "./staging.js";
import {
  asPublicationFields,
  isApprovedVersion,
} from "../../shared/publication.js";
import type { ResolveActor } from "../../shared/b-contracts.js";

async function sendApprovedUpload(
  deps: { dataDir: string; store: FileStore },
  name: string,
  res: import("express").Response,
) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name))
    throw new HttpError(400, "无效图片名");
  const url = `/uploads/${name}`;
  const items = await deps.store.list();
  const allowed = items.some((record) => {
    const row = record.item as typeof record.item & Record<string, unknown>;
    if (row.image !== url) return false;
    return isApprovedVersion(asPublicationFields(row));
  });
  if (!allowed) throw new HttpError(404, "图片不存在或未公开");
  const file = path.join(deps.dataDir, "uploads", name);
  try {
    await access(file);
  } catch {
    throw new HttpError(404, "图片不存在或未公开");
  }
  res.type("image/jpeg");
  createReadStream(file).pipe(res);
}

/**
 * 受控读图：待审暂存仅本人可读；公开图仅当存在已审核招领引用。
 * A 应移除对 /uploads 的无条件 express.static，改挂本路由。
 */
export function mediaRouter(deps: {
  dataDir: string;
  store: FileStore;
  resolveActor: ResolveActor;
}) {
  const router = Router();

  router.get("/media/staging/:ref", async (req, res) => {
    const ref = text(req.params.ref);
    const actor = await deps.resolveActor({
      header: (name) => {
        const v = req.header(name);
        return v === undefined ? undefined : String(v);
      },
    });
    const ownerKey = actor.userId || "";
    if (!ownerKey) throw new HttpError(401, "需要登录后才能查看暂存图片");
    await assertStagingOwner(deps.dataDir, ref, ownerKey);
    const file = stagingPath(deps.dataDir, ref);
    try {
      await access(file);
    } catch {
      throw new HttpError(404, "暂存图片不存在或已过期");
    }
    res.type("image/jpeg");
    createReadStream(file).pipe(res);
  });

  router.get("/media/uploads/:name", async (req, res) => {
    await sendApprovedUpload(deps, text(req.params.name), res);
  });

  router.get("/uploads/:name", async (req, res) => {
    await sendApprovedUpload(deps, text(req.params.name), res);
  });

  return router;
}
