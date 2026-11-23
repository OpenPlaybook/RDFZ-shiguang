import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  mkdir,
  writeFile,
  copyFile,
} from "node:fs/promises";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { FileStore } from "../src/server/storage.js";
import { createApp, errorHandler } from "../src/server/app.js";
import { importData } from "../src/server/import-data.js";
import type { Config } from "../src/server/config.js";
import type { ItemRecord } from "../src/shared/types.js";
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const sample = (id = "item_test"): ItemRecord => ({
  item: {
    id,
    owner_id: "pub_fixture",
    description: "蓝色水杯",
    office: "图书馆总服务台",
    place: "图书馆二楼",
    contact: "测试联系人",
    contact_type: "电话",
    contact_value: "13800000000",
    image: "/uploads/fixture.png",
    created_at: "2026-11-20T08:00:00.000Z",
    status: "open",
    claim: null,
    verified: null,
  },
  viewLogs: [],
});
const person = {
  identity: "学生",
  className: "测试班级",
  name: "测试同学",
  idNo: "fixture-001",
  contact: "fixture@example.test",
};
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
let root: string,
  store: FileStore,
  server: Server,
  base: string,
  config: Config;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "shiguang-test-"));
  store = await new FileStore(root).acquire();
  config = {
    root,
    dataDir: root,
    port: 0,
    adminPin: "test-pin",
    tokenSecret: "test-signing-secret-32-characters-long",
    aiKey: "",
    production: false,
  };
  const app = createApp(config, store);
  app.use((_req, res) => res.status(404).json({ error: "不存在" }));
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await store.close();
  await rm(root, { recursive: true, force: true });
});
const request = (
  url: string,
  body?: unknown,
  viewer = "pub_fixture",
  method = body === undefined ? "GET" : "POST",
  token = "",
) =>
  fetch(base + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Publisher-Id": viewer,
      "X-Admin-Token": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function adminToken() {
  return (await (await request("/api/admin/login", { pin: "test-pin" })).json())
    .token as string;
}
async function seed() {
  await store.mutate("item_test", () => sample());
  await writeFile(path.join(root, "uploads/fixture.png"), image);
}
describe("file concurrency and failure recovery", () => {
  it("serializes the full read-modify-write operation without losing logs", async () => {
    await seed();
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        request("/api/items/item_test/unlock", {
          ...person,
          viewerId: `viewer_${i}`,
        }),
      ),
    );
    expect((await store.read("item_test"))!.viewLogs).toHaveLength(30);
  });
  it("allows only one competing claim and preserves claim state", async () => {
    await seed();
    await request("/api/items/item_test/unlock", person);
    const result = await Promise.all([
      request("/api/items/item_test/claim", person),
      request("/api/items/item_test/claim", person),
    ]);
    expect(result.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await store.read("item_test"))!.item.status).toBe("claimed");
  });
  it("does not resurrect a deleted item when an edit follows", async () => {
    await seed();
    await Promise.all([
      store.mutate("item_test", async () => {
        await new Promise((r) => setTimeout(r, 10));
        return null;
      }),
      store
        .mutate("item_test", (current) => {
          if (!current) throw new Error("missing");
          return current;
        })
        .catch(() => null),
    ]);
    expect(await store.read("item_test")).toBeNull();
  });
  it("keeps old bytes and cleans temp files on a failed atomic replacement", async () => {
    await seed();
    const before = await readFile(store.itemPath("item_test"), "utf8");
    vi.mocked(fs.rename).mockRejectedValueOnce(
      Object.assign(new Error("disk unavailable"), { code: "ENOSPC" }),
    );
    await expect(
      store.mutate("item_test", (current) => {
        current!.item.description = "new";
        return current;
      }),
    ).rejects.toThrow();
    expect(await readFile(store.itemPath("item_test"), "utf8")).toBe(before);
    expect(
      (await readdir(path.join(root, "items"))).filter((n) =>
        n.endsWith(".tmp"),
      ),
    ).toEqual([]);
    await store.mutate("item_test", (c) => {
      c!.item.description = "recovered";
      return c;
    });
    expect((await store.read("item_test"))!.item.description).toBe("recovered");
  });
  it("rejects a second writer and permits restart after release", async () => {
    await expect(new FileStore(root).acquire()).rejects.toMatchObject({
      code: "ELOCKED",
    });
  });
  it("does not silently replace a corrupt record with empty data", async () => {
    await seed();
    await writeFile(store.itemPath("item_test"), "{broken");
    expect((await request("/api/items/item_test")).status).toBe(500);
    await expect(store.mutate("item_test", () => sample())).rejects.toThrow();
    expect(await readFile(store.itemPath("item_test"), "utf8")).toBe("{broken");
  });
  it("maintains separate records for concurrent creates", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.mutate(`item_${i}`, () => sample(`item_${i}`)),
      ),
    );
    expect(await store.list()).toHaveLength(20);
  });
});
describe("API behavior and file boundaries", () => {
  it("hides contacts until unlock and limits logs to administrators", async () => {
    await seed();
    const before = await (
      await request("/api/items/item_test", undefined, "outsider")
    ).json();
    expect(before.item.contactValue).toBe("");
    expect(before.item.viewLogs).toEqual([]);
    const unlock = await request(
      "/api/items/item_test/unlock",
      person,
      "outsider",
    );
    expect(unlock.status).toBe(200);
    expect((await unlock.json()).item.contactValue).toBe("13800000000");
    const admin = await (
      await request(
        "/api/items/item_test",
        undefined,
        "admin",
        "GET",
        await adminToken(),
      )
    ).json();
    expect(admin.item.viewLogs).toHaveLength(1);
  });
  it("enforces claim and verification transitions and admin checks", async () => {
    await seed();
    expect(
      (await request("/api/items/item_test/claim", person, "other")).status,
    ).toBe(403);
    expect((await request("/api/items/item_test/verify", {})).status).toBe(403);
    const token = await adminToken();
    expect(
      (
        await request(
          "/api/items/item_test/verify",
          { note: "checked" },
          "admin",
          "POST",
          token,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/api/items/item_test", {}, "pub_fixture", "PATCH"))
        .status,
    ).toBe(403);
    expect(
      (
        await request(
          "/api/items/item_test/claim",
          person,
          "admin",
          "POST",
          token,
        )
      ).status,
    ).toBe(403);
    await request("/api/items/item_test/unverify", {}, "admin", "POST", token);
    await request("/api/items/item_test/claim", {}, "admin", "POST", token);
    await request(
      "/api/items/item_test/claim/cancel",
      {},
      "admin",
      "POST",
      token,
    );
    expect((await store.read("item_test"))!.item.status).toBe("open");
  });
  it("serves uploaded images but not private state, source or removed AI routes", async () => {
    await seed();
    for (const url of [
      "/data/items/item_test.json",
      "/src/server/config.ts",
      "/data/ai-config.json",
      "/.env",
      "/data/certs/key.pem",
    ])
      expect((await fetch(base + url)).status).toBe(404);
    expect((await fetch(base + "/uploads/fixture.png")).status).toBe(200);
    expect((await request("/api/ai/config", {})).status).toBe(404);
  });
  it("creates, edits and deletes an image-backed post; rejects an impostor edit", async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      ownerId: "pub_fixture",
      description: "测试物品",
      office: "图书馆总服务台",
      place: "图书馆",
    }))
      fd.set(k, v);
    fd.set("image", new Blob([image], { type: "image/png" }), "image.png");
    const response = await fetch(base + "/api/items", {
      method: "POST",
      body: fd,
      headers: { "X-Publisher-Id": "pub_fixture" },
    });
    expect(response.status).toBe(201);
    const { item } = await response.json();
    expect(
      (
        await request(
          "/api/items/" + item.id,
          { description: "bad" },
          "other",
          "PATCH",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/api/items/" + item.id,
          { description: "updated" },
          "pub_fixture",
          "PATCH",
        )
      ).status,
    ).toBe(200);
    await request("/api/items/" + item.id, undefined, "pub_fixture", "DELETE");
    expect((await fetch(base + item.image)).status).toBe(404);
  });
  it("cleans rejected uploads and keeps an old picture after save failure", async () => {
    await seed();
    const before = await readFile(path.join(root, "uploads/fixture.png"));
    const fd = new FormData();
    fd.set("description", "new");
    fd.set("image", new Blob([image], { type: "image/png" }), "new.png");
    vi.mocked(fs.rename)
      .mockImplementationOnce(async (a, b) => {
        const original =
          await vi.importActual<typeof import("node:fs/promises")>(
            "node:fs/promises",
          );
        return original.rename(a, b);
      })
      .mockRejectedValueOnce(new Error("failed metadata"));
    const response = await fetch(base + "/api/items/item_test", {
      method: "PATCH",
      body: fd,
      headers: { "X-Publisher-Id": "pub_fixture" },
    });
    expect(response.status).toBe(500);
    expect(await readFile(path.join(root, "uploads/fixture.png"))).toEqual(
      before,
    );
    expect(await readdir(path.join(root, "uploads"))).toEqual(["fixture.png"]);
    expect(await readdir(path.join(root, "tmp"))).toEqual([]);
  });
  it("stores independent feedback and leaves posting usable without AI", async () => {
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        request("/api/feedback", { message: `feedback ${i}` }),
      ),
    );
    expect(await readdir(path.join(root, "feedback"))).toHaveLength(5);
    expect((await (await request("/api/ai/status")).json()).configured).toBe(
      false,
    );
    expect(
      (await request("/api/ai/extract", { transcript: "图书馆" })).status,
    ).toBe(503);
  });
});
describe("DeepSeek protocol", () => {
  it("uses one provider for vision and extracts only string fields", async () => {
    const calls: RequestInit[] = [];
    const upstream: typeof fetch = async (_url, init) => {
      calls.push(init!);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  calls.length === 1
                    ? "蓝色水杯"
                    : '{"place":"图书馆","office":"图书馆总服务台","contact":123}',
              },
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    };
    const app = createApp({ ...config, aiKey: "test-key" }, store, upstream);
    app.use(errorHandler);
    const aiServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => aiServer.once("listening", r));
    const url = `http://127.0.0.1:${(aiServer.address() as { port: number }).port}`;
    try {
      const vision = await fetch(url + "/api/ai/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: "data:image/png;base64," + image.toString("base64"),
        }),
      });
      expect((await vision.json()).text).toBe("蓝色水杯");
      const extract = await fetch(url + "/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: "图书馆捡的" }),
      });
      expect((await extract.json()).contact).toBe("");
      expect(JSON.parse(String(calls[0].body)).model).toBe("deepseek-flash");
      expect(calls[0].headers).toMatchObject({
        Authorization: "Bearer test-key",
      });
    } finally {
      await new Promise<void>((r) => aiServer.close(() => r()));
    }
  });
  it("does not expose provider errors or secret values", async () => {
    const app = createApp(
      { ...config, aiKey: "secret-test-key" },
      store,
      async () =>
        new Response("secret-test-key provider failure", { status: 401 }),
    );
    app.use(errorHandler);
    const aiServer = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => aiServer.once("listening", r));
    try {
      const response = await fetch(
        `http://127.0.0.1:${(aiServer.address() as { port: number }).port}/api/ai/extract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"transcript":"test"}',
        },
      );
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain("secret-test-key");
    } finally {
      await new Promise<void>((r) => aiServer.close(() => r()));
    }
  });
});
describe("one-time data import", () => {
  it("preserves records and images, excludes keys and certificates, refuses overwrite", async () => {
    const source = path.join(root, "legacy"),
      target = path.join(root, "imported");
    await mkdir(path.join(source, "data"), { recursive: true });
    await mkdir(path.join(source, "uploads"));
    await writeFile(
      path.join(source, "data/store.json"),
      JSON.stringify({ items: [sample().item], viewLogs: [] }),
    );
    await writeFile(
      path.join(source, "data/ai-config.json"),
      '{"apiKey":"do-not-copy"}',
    );
    await copyFile(
      path.join(root, "uploads/fixture.png"),
      path.join(source, "uploads/fixture.png"),
    ).catch(() => writeFile(path.join(source, "uploads/fixture.png"), image));
    expect(await importData(source, target)).toEqual({
      items: 1,
      viewLogs: 0,
      images: 1,
      feedback: 0,
    });
    const imported = JSON.parse(
      await readFile(path.join(target, "items/item_test.json"), "utf8"),
    );
    expect(imported).toEqual(sample());
    expect(await readFile(path.join(target, "uploads/fixture.png"))).toEqual(
      image,
    );
    expect(await readdir(target)).toEqual([
      "feedback",
      "items",
      "tmp",
      "uploads",
    ]);
    await expect(importData(source, target)).rejects.toThrow("已有内容");
  });
});
