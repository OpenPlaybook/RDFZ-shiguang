import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { FileStore } from "../src/server/storage.js";
import { createApp, errorHandler } from "../src/server/app.js";
import { createModerationPublication } from "../src/server/moderation-publication/mount.js";
import {
  createHeuristicReviewer,
  createUnavailableReviewer,
  reviewHttpStatus,
} from "../src/server/moderation/review.js";
import { parseReviewModelOutput } from "../src/server/moderation/parse.js";
import { isApprovedVersion } from "../src/shared/publication.js";
import type { Config } from "../src/server/config.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);

describe("moderation parse / heuristic", () => {
  it("parses allowed and rejects model unavailable as uncertain", () => {
    expect(parseReviewModelOutput('{"status":"allowed","issues":[]}')).toEqual({
      status: "allowed",
      issues: [],
    });
    const uncertain = parseReviewModelOutput(
      '{"status":"unavailable","issues":[{"field":"general","message":"不明"}]}',
    );
    expect(uncertain.status).toBe("uncertain");
    expect(reviewHttpStatus(uncertain)).toBe(422);
  });

  it("heuristic rejects ads and marks dangerous items uncertain", async () => {
    const review = createHeuristicReviewer();
    const rejected = await review({
      kind: "found",
      revision: 1,
      textFields: { description: "代考刷单招生代理" },
      imageRef: "staging_abcdefghij",
    });
    expect(rejected.status).toBe("rejected");
    const uncertain = await review({
      kind: "found",
      revision: 1,
      textFields: { description: "捡到疑似爆炸物请处理" },
      imageRef: "staging_abcdefghij",
    });
    expect(uncertain.status).toBe("uncertain");
  });
});

describe("found-posts publication flow", () => {
  let root: string;
  let store: FileStore;
  let server: Server;
  let base: string;
  let config: Config;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "shiguang-c-"));
    store = await new FileStore(root).acquire();
    config = {
      root,
      dataDir: root,
      port: 0,
      adminPin: "",
      tokenSecret: "",
      aiKey: "",
      production: false,
    };
    const handles = await createModerationPublication({
      config,
      store,
      reviewSubmission: createHeuristicReviewer(),
    });
    const app = createApp(config, store);
    app.mountExtraApi((r) => handles.mountRoutes(r));
    app.use(errorHandler);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await store.close();
    await rm(root, { recursive: true, force: true });
  });

  const headers = {
    "x-publisher-id": "student_c1",
    "x-test-name": "StudentC",
  };

  async function stageImage() {
    const body = new FormData();
    body.append("image", new Blob([png], { type: "image/png" }), "item.png");
    const res = await fetch(`${base}/api/found-posts/staging`, {
      method: "POST",
      headers,
      body,
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { imageRef: string; previewUrl: string };
  }

  it("stages privately then publishes only after allow", async () => {
    const staged = await stageImage();
    expect(staged.imageRef).toMatch(/^staging_/);
    expect(staged.previewUrl).toContain("/api/media/staging/");

    const guestPreview = await fetch(`${base}${staged.previewUrl}`);
    expect(guestPreview.status).toBe(401);

    const ownerPreview = await fetch(`${base}${staged.previewUrl}`, {
      headers,
    });
    expect(ownerPreview.status).toBe(200);

    const created = await fetch(`${base}/api/found-posts`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        description: "粉色保温杯",
        place: "图书馆二楼",
        office: "图书馆总服务台",
        imageRef: staged.imageRef,
      }),
    });
    expect(created.status).toBe(201);
    const data = (await created.json()) as {
      item: {
        id: string;
        image: string;
        revision: number;
        publication: { approvedRevision: number };
      };
    };
    expect(data.item.revision).toBe(1);
    expect(data.item.publication.approvedRevision).toBe(1);
    expect(isApprovedVersion(data.item)).toBe(true);

    const name = path.basename(data.item.image);
    const media = await fetch(`${base}/api/media/uploads/${name}`);
    expect(media.status).toBe(200);
  });

  it("keeps rejected content unpublished and staging owned", async () => {
    const staged = await stageImage();
    const res = await fetch(`${base}/api/found-posts`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        description: "加微信买代考刷单",
        place: "食堂",
        office: "图书馆总服务台",
        imageRef: staged.imageRef,
      }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      status: string;
      issues: { field: string }[];
    };
    expect(body.status).toBe("rejected");
    expect(body.issues.length).toBeGreaterThan(0);
    expect(await store.list()).toHaveLength(0);

    const still = await fetch(`${base}/api/media/staging/${staged.imageRef}`, {
      headers,
    });
    expect(still.status).toBe(200);
  });

  it("returns 503 for unavailable reviewer without publishing", async () => {
    const blocked = await createModerationPublication({
      config,
      store,
      reviewSubmission: createUnavailableReviewer(),
    });
    const app = createApp(config, store);
    app.mountExtraApi((r) => blocked.mountRoutes(r));
    app.use(errorHandler);
    const srv = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => srv.once("listening", r));
    const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;

    const body = new FormData();
    body.append("image", new Blob([png], { type: "image/png" }), "item.png");
    const staged = await fetch(`${url}/api/found-posts/staging`, {
      method: "POST",
      headers,
      body,
    });
    const { imageRef } = (await staged.json()) as { imageRef: string };
    const res = await fetch(`${url}/api/found-posts`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        description: "黑色雨伞",
        place: "体育馆",
        office: "图书馆总服务台",
        imageRef,
      }),
    });
    expect(res.status).toBe(503);
    expect(await store.list()).toHaveLength(0);
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it("hides unapproved upload via controlled media route", async () => {
    const name = `${Date.now()}_secret.jpg`;
    const file = path.join(root, "uploads", name);
    await writeFile(file, png);
    await store.mutate("item_secret", () => ({
      item: {
        id: "item_secret",
        owner_id: "student_c1",
        description: "未审",
        office: "图书馆总服务台",
        place: "走廊",
        contact: "同学",
        contact_type: "",
        contact_value: "",
        image: `/uploads/${name}`,
        created_at: new Date().toISOString(),
        status: "open" as const,
        claim: null,
        verified: null,
        revision: 1,
        publication: null,
      },
      viewLogs: [],
    }));
    const res = await fetch(`${base}/api/media/uploads/${name}`);
    expect(res.status).toBe(404);
    await access(file);
  });
});
