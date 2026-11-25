import type { Express, Request } from "express";
import type { FileStore } from "./storage.js";
import { HttpError, text } from "./errors.js";
import { publicItem } from "./items.js";
import {
  activeDelivery,
  canRead,
  isStationUser,
  normalizeRecord,
} from "./records.js";
import type { CurrentActor, LookupResult } from "../shared/identity.js";
import type { DeliveryRecord, ItemRecord } from "../shared/types.js";
export interface ClaimContext {
  store: FileStore;
  actorOf: (req: Request) => Promise<CurrentActor>;
  lookup: (userId: string) => Promise<LookupResult>;
  stationUserIds: string[];
}
function requireRecord(record: ItemRecord | null) {
  if (!record) throw new HttpError(404, "帖子不存在");
  return normalizeRecord(record);
}
function delivery(input: {
  claimantUserId: string;
  name: string;
  className: string;
  source: "self" | "admin";
  operatorUserId: string;
  note: string;
}): DeliveryRecord {
  return {
    ...input,
    at: new Date().toISOString(),
    active: true,
    closedAt: null,
    closeReason: null,
  };
}
async function resolveClaimant(
  ctx: ClaimContext,
  actor: CurrentActor,
  userId: string,
) {
  if (!userId) throw new HttpError(400, "请提供领取学生的平台用户 ID");
  if (isStationUser(userId, ctx.stationUserIds))
    throw new HttpError(400, "公共账号不能作为领取人");
  if (userId === actor.userId)
    throw new HttpError(400, "管理员不能把自己写成失主");
  const found = await ctx.lookup(userId);
  if (found.status === "unavailable")
    throw new HttpError(
      503,
      "学生名单检索尚未由平台提供，请转平台方确认，不能在本地新建学生账号",
    );
  if (found.status === "absent")
    throw new HttpError(404, "平台没有这名学生，不能只按自报姓名领取");
  return found.student;
}
export function registerClaimRoutes(app: Express, ctx: ClaimContext) {
  app.post("/api/items/:id/claim", async (req, res) => {
    const actor = await ctx.actorOf(req);
    if (actor.kind !== "student" || !actor.userId)
      throw new HttpError(403, "只有学生本人可以登记领取，公共终端不能领取");
    const record = await ctx.store.mutate(text(req.params.id), (current) => {
      const next = requireRecord(current);
      if (!canRead(next, actor)) throw new HttpError(404, "帖子不存在");
      const row = next.item;
      if (row.status !== "open" || activeDelivery(next))
        throw new HttpError(409, "该物品已有有效交付");
      if (row.high_value)
        throw new HttpError(403, "高价值物品只能由管理员核验并交付后确认");
      const entry = delivery({
        claimantUserId: actor.userId || "",
        name: actor.name || "",
        className: actor.className || "",
        source: "self",
        operatorUserId: actor.userId || "",
        note: "",
      });
      row.status = "claimed";
      row.claim_log = [...(row.claim_log || []), entry];
      row.claim = {
        claimantUserId: entry.claimantUserId,
        name: entry.name,
        className: entry.className,
        claimedAt: entry.at,
        source: "self",
        claimLabel: "本人登记",
        operatorUserId: entry.operatorUserId,
        note: "",
      };
      return next;
    });
    res.json({ item: publicItem(record as ItemRecord, actor) });
  });
  app.post("/api/items/:id/intent", async (req, res) => {
    const actor = await ctx.actorOf(req);
    if (actor.kind !== "student" || !actor.userId)
      throw new HttpError(403, "只有学生可以提出领取意向");
    const record = await ctx.store.mutate(text(req.params.id), (current) => {
      const next = requireRecord(current);
      if (!canRead(next, actor)) throw new HttpError(404, "帖子不存在");
      const row = next.item;
      if (row.status !== "open")
        throw new HttpError(409, "该物品已领取或已撤下");
      const intents = (row.intents || []).filter(
        (intent) => intent.userId !== actor.userId,
      );
      intents.unshift({
        userId: actor.userId || "",
        name: actor.name || "",
        className: actor.className || "",
        at: new Date().toISOString(),
      });
      row.intents = intents;
      return next;
    });
    res.json({ item: publicItem(record as ItemRecord, actor) });
  });
  app.post("/api/items/:id/deliver", async (req, res) => {
    const actor = await ctx.actorOf(req);
    if (actor.kind !== "admin" || !actor.userId)
      throw new HttpError(403, "需要管理员权限");
    const student = await resolveClaimant(
      ctx,
      actor,
      text(req.body?.claimantUserId),
    );
    const note = text(req.body?.note);
    const record = await ctx.store.mutate(text(req.params.id), (current) => {
      const next = requireRecord(current);
      const row = next.item;
      if (row.status !== "open" || activeDelivery(next))
        throw new HttpError(409, "该物品已有有效交付");
      if (row.high_value && row.custody?.heldBy !== "teacher")
        throw new HttpError(409, "高价值物品尚未交到老师处，不能完成交付");
      const entry = delivery({
        claimantUserId: student.userId,
        name: student.name,
        className: student.className,
        source: "admin",
        operatorUserId: actor.userId || "",
        note,
      });
      row.status = "claimed";
      row.claim_log = [...(row.claim_log || []), entry];
      row.claim = {
        claimantUserId: entry.claimantUserId,
        name: entry.name,
        className: entry.className,
        claimedAt: entry.at,
        source: "admin",
        claimLabel: "老师核验后交付",
        operatorUserId: entry.operatorUserId,
        note,
      };
      return next;
    });
    res.json({ item: publicItem(record as ItemRecord, actor) });
  });
  app.post("/api/items/:id/custody", async (req, res) => {
    const actor = await ctx.actorOf(req);
    if (actor.kind !== "admin" || !actor.userId)
      throw new HttpError(403, "需要管理员权限");
    const heldBy = text(req.body?.heldBy);
    if (heldBy !== "finder" && heldBy !== "station" && heldBy !== "teacher")
      throw new HttpError(400, "请说明实物当前由谁保管");
    const record = await ctx.store.mutate(text(req.params.id), (current) => {
      const next = requireRecord(current);
      const row = next.item;
      const location = text(req.body?.location) || row.custody?.location || row.office;
      row.custody = {
        heldBy,
        location,
        receivedAt: heldBy === "teacher" ? new Date().toISOString() : null,
        receivedByUserId: heldBy === "teacher" ? actor.userId || "" : null,
        note: text(req.body?.note),
      };
      return next;
    });
    res.json({ item: publicItem(record as ItemRecord, actor) });
  });
  app.post("/api/items/:id/claim/correct", async (req, res) => {
    const actor = await ctx.actorOf(req);
    if (actor.kind !== "admin" || !actor.userId)
      throw new HttpError(403, "需要管理员权限");
    const reason = text(req.body?.reason);
    if (!reason) throw new HttpError(400, "更正必须注明原因");
    const nextUserId = text(req.body?.claimantUserId);
    const student = nextUserId
      ? await resolveClaimant(ctx, actor, nextUserId)
      : null;
    const record = await ctx.store.mutate(text(req.params.id), (current) => {
      const next = requireRecord(current);
      const row = next.item;
      const active = (row.claim_log || []).find((entry) => entry.active);
      if (!active) throw new HttpError(400, "没有可更正的交付记录");
      if (student && row.high_value && row.custody?.heldBy !== "teacher")
        throw new HttpError(409, "高价值物品尚未交到老师处，不能完成交付");
      active.active = false;
      active.closedAt = new Date().toISOString();
      active.closeReason = reason;
      if (!student) {
        row.status = "open";
        row.claim = null;
        return next;
      }
      const entry = delivery({
        claimantUserId: student.userId,
        name: student.name,
        className: student.className,
        source: "admin",
        operatorUserId: actor.userId || "",
        note: reason,
      });
      row.claim_log = [...(row.claim_log || []), entry];
      row.status = "claimed";
      row.claim = {
        claimantUserId: entry.claimantUserId,
        name: entry.name,
        className: entry.className,
        claimedAt: entry.at,
        source: "admin",
        claimLabel: "老师核验后交付",
        operatorUserId: entry.operatorUserId,
        note: reason,
      };
      return next;
    });
    res.json({ item: publicItem(record as ItemRecord, actor) });
  });
  app.post("/api/items/:id/withdraw", async (req, res) => {
    const actor = await ctx.actorOf(req);
    if (actor.kind === "guest" || !actor.userId)
      throw new HttpError(403, "需要学校平台登录，当前尚未接入");
    const record = await ctx.store.mutate(text(req.params.id), (current) => {
      const next = requireRecord(current);
      if (!canRead(next, actor)) throw new HttpError(404, "帖子不存在");
      const row = next.item;
      const admin = actor.kind === "admin";
      if (!admin && actor.userId !== row.owner_id)
        throw new HttpError(403, "无权撤下");
      if (!admin && row.status !== "open")
        throw new HttpError(403, "已交付的物品只能由管理员撤下");
      if (row.status === "withdrawn") throw new HttpError(400, "该帖已撤下");
      row.status = "withdrawn";
      return next;
    });
    res.json({ item: publicItem(record as ItemRecord, actor) });
  });
  app.post("/api/items/:id/high-value", async (req, res) => {
    const actor = await ctx.actorOf(req);
    if (actor.kind !== "admin") throw new HttpError(403, "需要管理员权限");
    if (req.body?.highValue === false || req.body?.highValue === "false")
      throw new HttpError(403, "不能在这里取消高价值标记");
    const record = await ctx.store.mutate(text(req.params.id), (current) => {
      const next = requireRecord(current);
      next.item.high_value = true;
      return next;
    });
    res.json({ item: publicItem(record as ItemRecord, actor) });
  });
}
