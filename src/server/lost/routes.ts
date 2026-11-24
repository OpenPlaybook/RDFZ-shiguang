import { Router } from "express";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { HttpError, text } from "../errors.js";
import type { LostStore } from "./store.js";
import type {
  CurrentActor,
  IsApprovedVersion,
  ResolveActor,
  ReviewSubmission,
} from "../../shared/b-contracts.js";
import type { LostPost, LostPostInput } from "../../shared/lost.js";

function requireStudent(actor: CurrentActor) {
  if (actor.kind === "guest" || !actor.userId)
    throw new HttpError(401, "需要登录的学生身份才能发布或管理寻物");
  if (actor.kind === "kiosk")
    throw new HttpError(403, "公共账号不能发布寻物或查看私人消息");
  return actor as CurrentActor & { userId: string };
}

function parseInput(body: Record<string, unknown>): LostPostInput {
  const description = text(body.description).slice(0, 2000);
  if (!description) throw new HttpError(400, "请填写寻物描述");
  const lostFrom = text(body.lostFrom) || null;
  const lostTo = text(body.lostTo) || null;
  if (lostFrom && Number.isNaN(Date.parse(lostFrom)))
    throw new HttpError(400, "丢失开始时间无效");
  if (lostTo && Number.isNaN(Date.parse(lostTo)))
    throw new HttpError(400, "丢失结束时间无效");
  if (lostFrom && lostTo && Date.parse(lostFrom) > Date.parse(lostTo))
    throw new HttpError(400, "丢失时间范围无效");
  return {
    description,
    image: text(body.image).slice(0, 200),
    place: text(body.place).slice(0, 200),
    lostFrom,
    lostTo,
  };
}

export function lostRouter(deps: {
  lost: LostStore;
  resolveActor: ResolveActor;
  reviewSubmission: ReviewSubmission;
  isApprovedVersion: IsApprovedVersion;
}) {
  const router = Router();

  const actorOf = async (req: Request) =>
    deps.resolveActor({
      header: (name) => {
        const v = req.header(name);
        return v === undefined ? undefined : String(v);
      },
      body: req.body,
    });

  router.get("/lost-posts", async (req, res) => {
    const actor = await actorOf(req);
    const mine = text(req.query.mine) === "1";
    const all = await deps.lost.list();
    const posts = all
      .filter((p) => {
        if (mine) {
          if (!actor.userId || p.ownerId !== actor.userId) return false;
          return true;
        }
        return deps.isApprovedVersion({
          revision: p.revision,
          publication: p.publication,
        });
      })
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    res.json({ posts: posts.map(publicLost) });
  });

  router.get("/lost-posts/:id", async (req, res) => {
    const actor = await actorOf(req);
    const post = await deps.lost.read(text(req.params.id));
    if (!post) throw new HttpError(404, "寻物不存在");
    const approved = deps.isApprovedVersion({
      revision: post.revision,
      publication: post.publication,
    });
    if (!approved && post.ownerId !== actor.userId)
      throw new HttpError(404, "寻物不存在");
    res.json({ post: publicLost(post) });
  });

  router.post("/lost-posts", async (req, res) => {
    const actor = requireStudent(await actorOf(req));
    const input = parseInput(req.body || {});
    const now = new Date().toISOString();
    const revision = 1;
    const review = await deps.reviewSubmission({
      kind: "lost",
      revision,
      textFields: {
        description: input.description,
        place: input.place || "",
        lostFrom: input.lostFrom || "",
        lostTo: input.lostTo || "",
      },
      imageRef: input.image || undefined,
    });
    if (review.status !== "allowed") {
      res.status(review.status === "unavailable" ? 503 : 422).json({
        error:
          review.status === "rejected"
            ? "寻物内容未通过审核"
            : review.status === "uncertain"
              ? "寻物内容待人工确认，暂未公开"
              : "审核服务暂不可用",
        issues: review.issues,
      });
      return;
    }
    const id = "lost_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const post: LostPost = {
      id,
      ownerId: actor.userId,
      ownerName: text(actor.name).slice(0, 40) || "同学",
      ownerClassName: text(actor.className).slice(0, 40),
      description: input.description!,
      image: input.image || "",
      place: input.place || "",
      lostFrom: input.lostFrom ?? null,
      lostTo: input.lostTo ?? null,
      status: "open",
      foundViaItemId: null,
      revision,
      publication: { approvedRevision: revision },
      createdAt: now,
      updatedAt: now,
      batchHint: "pending_batch",
    };
    await deps.lost.mutate(id, (cur) => {
      if (cur) throw new HttpError(409, "寻物 ID 已存在");
      return post;
    });
    res.status(201).json({
      post: publicLost(post),
      notice: "已发布，将在每日配对后提醒",
    });
  });

  router.patch("/lost-posts/:id", async (req, res) => {
    const actor = requireStudent(await actorOf(req));
    const id = text(req.params.id);
    const body = (req.body || {}) as Record<string, unknown>;
    const status = text(body.status) as LostPost["status"] | "";
    const contentTouched =
      body.description !== undefined ||
      body.image !== undefined ||
      body.place !== undefined ||
      body.lostFrom !== undefined ||
      body.lostTo !== undefined;

    const updated = await deps.lost.mutate(id, async (cur) => {
      if (!cur) throw new HttpError(404, "寻物不存在");
      if (cur.ownerId !== actor.userId)
        throw new HttpError(403, "不能修改他人寻物");
      let next: LostPost = { ...cur, updatedAt: new Date().toISOString() };

      if (status) {
        if (!["open", "found", "closed"].includes(status))
          throw new HttpError(400, "无效状态");
        next.status = status;
        if (status === "found")
          next.foundViaItemId = text(body.foundViaItemId) || null;
        if (status === "closed" || status === "found") next.batchHint = null;
      }

      if (contentTouched) {
        const input = parseInput({
          description:
            body.description !== undefined
              ? body.description
              : cur.description,
          image: body.image !== undefined ? body.image : cur.image,
          place: body.place !== undefined ? body.place : cur.place,
          lostFrom:
            body.lostFrom !== undefined ? body.lostFrom : cur.lostFrom,
          lostTo: body.lostTo !== undefined ? body.lostTo : cur.lostTo,
        });
        const revision = cur.revision + 1;
        const review = await deps.reviewSubmission({
          kind: "lost",
          revision,
          textFields: {
            description: input.description,
            place: input.place || "",
            lostFrom: input.lostFrom || "",
            lostTo: input.lostTo || "",
          },
          imageRef: input.image || undefined,
        });
        if (review.status !== "allowed") {
          throw new HttpError(
            review.status === "unavailable" ? 503 : 422,
            review.status === "rejected"
              ? "修改未通过审核，已保留原合规版本"
              : review.status === "uncertain"
                ? "修改待确认，已保留原合规版本"
                : "审核服务暂不可用，已保留原合规版本",
          );
        }
        next = {
          ...next,
          description: input.description!,
          image: input.image || "",
          place: input.place || "",
          lostFrom: input.lostFrom ?? null,
          lostTo: input.lostTo ?? null,
          revision,
          publication: { approvedRevision: revision },
          batchHint: next.status === "open" ? "pending_batch" : next.batchHint,
        };
      }
      return next;
    });
    res.json({ post: publicLost(updated!) });
  });

  return router;
}

function publicLost(post: LostPost) {
  return post;
}
