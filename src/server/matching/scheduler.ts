import type { RunMatchingDeps } from "./run.js";
import { runDailyMatching } from "./run.js";
import { nextBatchInstant, pastBatchTime, beijingDate } from "./time.js";

export interface MatchingScheduler {
  start: () => void;
  stop: () => Promise<void>;
  /** 测试用：立即尝试跑当日批次（仍尊重已完成幂等）。 */
  runNow: (forceDate?: string) => Promise<unknown>;
}

/**
 * 随应用生命周期启停。不在健康检查阶段调用。
 * 激活时若已过北京时间 14:00 且当日未成功完成，则补跑一次。
 */
export function startMatchingScheduler(
  deps: RunMatchingDeps,
): MatchingScheduler {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let current: Promise<unknown> = Promise.resolve();

  const scheduleNext = () => {
    if (stopped) return;
    const now = deps.now?.() ?? new Date();
    const next = nextBatchInstant(now);
    const delay = Math.max(1000, next.getTime() - now.getTime());
    timer = setTimeout(() => {
      void enqueue(() => runDailyMatching(deps)).finally(scheduleNext);
    }, Math.min(delay, 2_147_000_000));
  };

  const enqueue = (fn: () => Promise<unknown>) => {
    current = current.catch(() => {}).then(fn);
    return current;
  };

  const start = () => {
    stopped = false;
    const now = deps.now?.() ?? new Date();
    if (pastBatchTime(now)) {
      void enqueue(async () => {
        const date = beijingDate(now);
        const existing = await deps.batches.read(date);
        if (existing?.status === "completed") return existing;
        return runDailyMatching(deps);
      });
    }
    scheduleNext();
  };

  const stop = async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    await current.catch(() => {});
    await Promise.all([
      deps.lost.drain(),
      deps.messages.drain(),
      deps.batches.drain(),
    ]);
  };

  return {
    start,
    stop,
    runNow: (forceDate) =>
      enqueue(() => runDailyMatching(deps, { forceDate })),
  };
}
