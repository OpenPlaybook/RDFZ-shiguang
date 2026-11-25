import { Router } from "express";
import type { Config } from "../config.js";
import type { FileStore } from "../storage.js";
import { HttpError } from "../errors.js";
import { LostStore } from "../lost/store.js";
import { MessageStore } from "../messages/store.js";
import { BatchStore } from "../matching/batch-store.js";
import { lostRouter } from "../lost/routes.js";
import { messagesRouter } from "../messages/routes.js";
import { createDeepseekMatcher, type MatchAiFn } from "../matching/ai.js";
import {
  startMatchingScheduler,
  type MatchingScheduler,
} from "../matching/scheduler.js";
import type {
  IsApprovedVersion,
  ResolveActor,
  ReviewSubmission,
} from "../../shared/b-contracts.js";
import {
  createReviewSubmission,
  createTestResolveActor,
  defaultIsApprovedVersion,
} from "./deps.js";

export interface LostMatchingHandles {
  lost: LostStore;
  messages: MessageStore;
  batches: BatchStore;
  scheduler: MatchingScheduler;
  mountRoutes: (app: Router) => void;
}

export interface MountLostMatchingOptions {
  config: Config;
  store: FileStore;
  resolveActor?: ResolveActor;
  reviewSubmission?: ReviewSubmission;
  isApprovedVersion?: IsApprovedVersion;
  matchAi?: MatchAiFn;
  /** 允许本地用 X-Publisher-Id / X-Test-* 注入学生身份。生产应为 false。 */
  allowTestActor?: boolean;
  /** 本地联调：临时允许审核通过。生产必须 false / 不传。 */
  allowTestModeration?: boolean;
  now?: () => Date;
}

/**
 * B 交付给 A 的装配入口：初始化存储、挂路由、返回可启停调度器。
 * A 应在拿到数据目录租约后调用 start；关闭时先 stop 再放锁。
 */
export async function createLostMatching(
  options: MountLostMatchingOptions,
): Promise<LostMatchingHandles> {
  const allowTestActor =
    options.allowTestActor ?? !options.config.production;
  // 非生产默认放开测试审核，便于本地联调；生产必须由 C 注入，绝不默认 allowed。
  const allowTestModeration =
    options.allowTestModeration ?? !options.config.production;

  const lost = await new LostStore(options.config.dataDir).init();
  const messages = await new MessageStore(options.config.dataDir).init();
  const batches = await new BatchStore(options.config.dataDir).init();

  const resolveActor =
    options.resolveActor || createTestResolveActor(allowTestActor);
  const reviewSubmission =
    options.reviewSubmission ||
    createReviewSubmission(allowTestModeration ? "allowed" : "unavailable");
  const isApprovedVersion =
    options.isApprovedVersion || defaultIsApprovedVersion;
  const matchAi =
    options.matchAi ||
    createDeepseekMatcher(options.config.aiKey);

  const scheduler = startMatchingScheduler({
    store: options.store,
    lost,
    messages,
    batches,
    matchAi,
    isApprovedVersion,
    now: options.now,
  });

  const mountRoutes = (app: Router) => {
    const api = Router();
    api.use(
      lostRouter({
        lost,
        resolveActor,
        reviewSubmission,
        isApprovedVersion,
      }),
    );
    api.use(
      messagesRouter({
        messages,
        lost,
        store: options.store,
        resolveActor,
        isApprovedVersion,
      }),
    );
    api.post("/matching/run", async (req, res) => {
      const actor = await resolveActor({
        header: (name) => {
          const v = req.header(name);
          return v === undefined ? undefined : String(v);
        },
        body: req.body,
      });
      if (actor.kind !== "admin")
        throw new HttpError(403, "需要管理员才能手动开启配对");
      const batch = await scheduler.runNow({ force: true });
      res.json({
        batch,
        notice: "已手动开启配对",
      });
    });
    app.use("/api", api);
  };

  return { lost, messages, batches, scheduler, mountRoutes };
}
