import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import express from "express";
import { configFromEnv } from "./config.js";
import { FileStore } from "./storage.js";
import { createApp, errorHandler } from "./app.js";
import {
  createLostMatching,
  type LostMatchingHandles,
} from "./lost-matching/mount.js";
const config = configFromEnv();
const store = new FileStore(config.dataDir);
let storeReady: Promise<FileStore> | undefined;
let handoffB: LostMatchingHandles | undefined;
let handoffBReady: Promise<LostMatchingHandles> | undefined;
const acquireStore = () =>
  (storeReady ??= store.acquire().catch((error) => {
    storeReady = undefined;
    throw error;
  }));
try {
  const app = express();
  const routes = express.Router();
  const business = createApp(config, store);
  const ensureHandoffB = () =>
    (handoffBReady ??= (async () => {
      await acquireStore();
      if (!handoffB) {
        handoffB = await createLostMatching({ config, store });
        business.mountExtraApi((router) => handoffB!.mountRoutes(router));
        handoffB.scheduler.start();
      }
      return handoffB;
    })().catch((error) => {
      handoffBReady = undefined;
      throw error;
    }));
  // Candidate health checks must not acquire the previous release's data lease.
  routes.get("/api/health", (_req, res) => res.json({ ok: true }));
  routes.use(["/api", "/uploads"], async (_req, _res, next) => {
    try {
      await acquireStore();
      await ensureHandoffB();
      next();
    } catch (error) {
      next(error);
    }
  });
  routes.use(business);
  app.use(config.basePath || "/", routes);
  const server = createHttpServer(app);
  let closeFrontend = async () => {};
  if (config.production) {
    business.get(["/", "/intro", "/intro.html"], (_req, res) =>
      res.sendFile(path.join(config.publicDir!, "index.html")),
    );
    business.use(
      express.static(config.publicDir!, {
        index: false,
        dotfiles: "deny",
      }),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: config.root,
      server: { middlewareMode: true, hmr: { server } },
      appType: "custom",
    });
    closeFrontend = () => vite.close();
    // Vite serves client source in development, never private runtime/server files.
    business.use((req, res, next) => {
      let requestPath: string;
      try {
        requestPath = path.posix.normalize(decodeURIComponent(req.path));
      } catch {
        res.status(400).json({ error: "无效路径" });
        return;
      }
      const pages = ["/", "/index.html", "/intro", "/intro.html"];
      const prefixes = [
        "/src/client/",
        "/src/shared/",
        "/@vite/",
        "/@id/",
        "/node_modules/",
      ];
      if (
        pages.includes(requestPath) ||
        requestPath === "/@react-refresh" ||
        prefixes.some((prefix) => requestPath.startsWith(prefix))
      )
        next();
      else res.status(404).json({ error: "页面或文件不存在" });
    });
    business.use(vite.middlewares);
    business.get(["/", "/intro", "/intro.html"], async (req, res, next) => {
      try {
        const html = await readFile(
          path.join(config.root, "index.html"),
          "utf8",
        );
        res
          .type("html")
          .send(await vite.transformIndexHtml(req.originalUrl, html));
      } catch (err) {
        next(err);
      }
    });
  }
  app.use((_req, res) => res.status(404).json({ error: "页面或文件不存在" }));
  app.use(errorHandler);
  server.listen(
    config.port,
    config.production && !process.env.RDFZ_LESSON_ID ? "0.0.0.0" : "127.0.0.1",
    () =>
      console.log(
        `拾光已启动：http://localhost:${config.port}\n数据目录：${config.dataDir}\nAI：${config.aiKey ? "DeepSeek 已配置" : "未配置，支持手动填写"}\n管理功能：${config.adminPin ? "已配置" : "未配置"}`,
      ),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const drained = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    void (async () => {
      try {
        if (handoffB) await handoffB.scheduler.stop();
        await closeFrontend();
      } finally {
        await drained;
        if (storeReady) {
          await storeReady.catch(() => {});
          await store.close();
        }
      }
      process.exit(0);
    })().catch(() => {
      console.error("关闭服务失败，请检查数据目录锁状态");
      process.exit(1);
    });
  };
  server.on("error", async (err) => {
    console.error("启动失败：", err.message);
    if (handoffB) await handoffB.scheduler.stop().catch(() => {});
    await closeFrontend();
    if (storeReady) {
      await storeReady.catch(() => {});
      await store.close();
    }
    process.exit(1);
  });
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (err) {
  if (handoffB) await handoffB.scheduler.stop().catch(() => {});
  if (storeReady) {
    await storeReady.catch(() => {});
    await store.close();
  }
  throw err;
}
