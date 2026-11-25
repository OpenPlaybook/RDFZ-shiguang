import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import express from "express";
import { FileStore } from "../src/server/storage.js";
import { errorHandler } from "../src/server/app.js";
import { createLostMatching } from "../src/server/lost-matching/mount.js";
import { parseMatchResponse } from "../src/server/matching/ai.js";
import {
  pastBatchTime,
  beijingBatchInstant,
  beijingDate,
  beijingParts,
} from "../src/server/matching/time.js";
import { runDailyMatching } from "../src/server/matching/run.js";
import type { Config } from "../src/server/config.js";
import type { ItemRecord } from "../src/shared/types.js";
import { defaultIsApprovedVersion } from "../src/server/lost-matching/deps.js";

const sampleItem = (id: string, description: string): ItemRecord => ({
  item: {
    id,
    owner_id: "finder_1",
    description,
    office: "图书馆总服务台",
    place: "图书馆",
    contact: "拾主",
    contact_type: "电话",
    contact_value: "13800000000",
    image: "/uploads/x.png",
    created_at: "2026-11-20T08:00:00.000Z",
    status: "open",
    claim: null,
    verified: null,
  },
  viewLogs: [],
});

describe("matching time Beijing", () => {
  it("formats beijing date across UTC midnight", () => {
    const d = new Date("2026-11-24T16:30:00.000Z");
    expect(beijingDate(d)).toBe("2026-11-25");
  });

  it("treats 13:59 Beijing as before batch, 14:00 as past", () => {
    const before = beijingBatchInstant("2026-06-01", 13, 59);
    const at = beijingBatchInstant("2026-06-01", 14, 0);
    expect(pastBatchTime(before)).toBe(false);
    expect(pastBatchTime(at)).toBe(true);
    expect(beijingParts(at).hour).toBe(14);
    expect(beijingParts(at).minute).toBe(0);
  });
});

describe("parseMatchResponse", () => {
  it("drops unknown ids and vague reasons", () => {
    const allowed = new Set(["item_a", "item_b"]);
    const result = parseMatchResponse(
      JSON.stringify({
        candidates: [
          { itemId: "item_a", reason: "灰色保温杯外观接近" },
          { itemId: "item_fake", reason: "看起来像" },
          { itemId: "item_b", reason: "都一样" },
        ],
      }),
      allowed,
    );
    expect(result).toEqual([
      { itemId: "item_a", reason: "灰色保温杯外观接近" },
    ]);
  });
});

describe("lost posts and daily matching", () => {
  let root: string;
  let store: FileStore;
  let server: Server;
  let base: string;
  let config: Config;
  let handles: Awaited<ReturnType<typeof createLostMatching>>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "shiguang-b-"));
    store = await new FileStore(root).acquire();
    config = {
      root,
      dataDir: root,
      port: 0,
      adminPin: "",
      tokenSecret: "",
      aiKey: "",
      production: false,
      testActors: true,
      testReviewAllow: true,
      devActor: "",
    };
    handles = await createLostMatching({
      config,
      store,
      allowTestActor: true,
      allowTestModeration: true,
      matchAi: async () => [],
    });
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    handles.mountRoutes(app);
    app.use(errorHandler);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await handles.scheduler.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await store.close();
    await rm(root, { recursive: true, force: true });
  });

  const headers = {
    "content-type": "application/json",
    "x-publisher-id": "student_b1",
    "x-test-name": "StudentB",
    "x-test-class": "Class1",
  };

  it("publishes lost post without phone or photo", async () => {
    const res = await fetch(`${base}/api/lost-posts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ description: "银色钥匙扣" }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as {
      post: { ownerId: string; batchHint: string };
      notice: string;
    };
    expect(data.post.ownerId).toBe("student_b1");
    expect(data.post.batchHint).toBe("pending_batch");
    expect(data.notice).toContain("每日配对");
  });

  it("rejects moderation failures without creating public post", async () => {
    const blocked = await createLostMatching({
      config,
      store,
      allowTestActor: true,
      allowTestModeration: false,
      reviewSubmission: async () => ({
        status: "rejected",
        issues: [{ field: "description", message: "不合规" }],
      }),
      matchAi: async () => [],
    });
    const app = express();
    app.use(express.json({ limit: "2mb" }));
    blocked.mountRoutes(app);
    app.use(errorHandler);
    const srv = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => srv.once("listening", r));
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    const res = await fetch(`${url}/api/lost-posts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ description: "应被拒绝" }),
    });
    expect(res.status).toBe(422);
    expect(
      (await blocked.lost.list()).filter((p) => p.description === "应被拒绝"),
    ).toHaveLength(0);
    await blocked.scheduler.stop();
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("forbids guest write and other users' posts", async () => {
    const create = await fetch(`${base}/api/lost-posts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ description: "蓝色水杯" }),
    });
    const { post } = (await create.json()) as { post: { id: string } };
    const guest = await fetch(`${base}/api/lost-posts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-actor-kind": "guest",
      },
      body: JSON.stringify({ description: "访客" }),
    });
    expect(guest.status).toBe(401);
    const other = await fetch(`${base}/api/lost-posts/${post.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-publisher-id": "student_other",
      },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(other.status).toBe(403);
  });

  it("runs batch once and writes deduped messages", async () => {
    await store.mutate("item_cup", async () =>
      sampleItem("item_cup", "灰色保温杯 银盖"),
    );
    const created = await fetch(`${base}/api/lost-posts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ description: "灰银色保温杯" }),
    });
    const { post } = (await created.json()) as { post: { id: string } };

    const matchAi = async () => [
      { itemId: "item_cup", reason: "颜色与品类接近" },
    ];
    const deps = {
      store,
      lost: handles.lost,
      messages: handles.messages,
      batches: handles.batches,
      matchAi,
      isApprovedVersion: defaultIsApprovedVersion,
      now: () => new Date("2026-11-24T07:00:00.000Z"),
    };
    const batch1 = await runDailyMatching(deps, { forceDate: "2026-11-24" });
    expect(batch1?.status).toBe("completed");
    expect(batch1?.matchedPairs).toBe(1);

    const batch2 = await runDailyMatching(
      { ...deps, now: () => new Date("2026-11-24T08:00:00.000Z") },
      { forceDate: "2026-11-24" },
    );
    expect(batch2?.matchedPairs).toBe(1);
    expect(batch2?.status).toBe("completed");

    const msgs = await fetch(`${base}/api/messages`, { headers });
    const body = (await msgs.json()) as {
      messages: { id: string }[];
      unread: number;
    };
    expect(body.messages).toHaveLength(1);
    expect(body.unread).toBe(1);

    await fetch(`${base}/api/lost-posts/${post.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "closed" }),
    });
    const detail = await fetch(`${base}/api/messages/${body.messages[0].id}`, {
      headers,
    });
    const one = (await detail.json()) as { message: { stale: boolean } };
    expect(one.message.stale).toBe(true);
  });

  it("records AI failure differently from zero matches", async () => {
    await fetch(`${base}/api/lost-posts`, {
      method: "POST",
      headers,
      body: JSON.stringify({ description: "耳机" }),
    });
    const failed = await runDailyMatching(
      {
        store,
        lost: handles.lost,
        messages: handles.messages,
        batches: handles.batches,
        matchAi: async () => {
          throw new Error("模型不可用");
        },
        isApprovedVersion: defaultIsApprovedVersion,
        now: () => new Date("2026-11-24T07:00:00.000Z"),
      },
      { forceDate: "2026-11-25" },
    );
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toContain("模型不可用");
  });
});
