import { randomUUID } from "node:crypto";
import type { FileStore } from "../storage.js";
import type { LostStore } from "../lost/store.js";
import type { MessageStore } from "../messages/store.js";
import type { BatchStore } from "./batch-store.js";
import type { MatchAiFn } from "./ai.js";
import type { IsApprovedVersion } from "../../shared/b-contracts.js";
import type { MatchingBatch } from "../../shared/matching.js";
import { MATCHING_MAX_ATTEMPTS } from "../../shared/matching.js";
import type { MatchMessage } from "../../shared/messages.js";
import {
  foundContentRevision,
  isOpenFoundItem,
  prefilterFound,
} from "./found.js";
import { beijingDate } from "./time.js";

export interface RunMatchingDeps {
  store: FileStore;
  lost: LostStore;
  messages: MessageStore;
  batches: BatchStore;
  matchAi: MatchAiFn;
  isApprovedVersion: IsApprovedVersion;
  now?: () => Date;
  maxAttempts?: number;
}

export async function runDailyMatching(
  deps: RunMatchingDeps,
  options: { forceDate?: string } = {},
): Promise<MatchingBatch | null> {
  const now = deps.now?.() ?? new Date();
  const date = options.forceDate || beijingDate(now);
  const existing = await deps.batches.read(date);
  if (existing?.status === "completed") return existing;
  if (existing?.status === "running") return existing;

  const attempt = (existing?.attempt || 0) + 1;
  const maxAttempts = deps.maxAttempts ?? MATCHING_MAX_ATTEMPTS;
  if (existing?.status === "failed" && attempt > maxAttempts) return existing;

  const batch: MatchingBatch = {
    date,
    status: "running",
    startedAt: now.toISOString(),
    finishedAt: null,
    attempt,
    error: null,
    matchedPairs: existing?.matchedPairs || 0,
    scannedLost: 0,
    scannedItems: 0,
  };
  await deps.batches.write(batch);

  try {
    const isApproved = deps.isApprovedVersion;
    const lostPosts = (await deps.lost.list()).filter(
      (p) =>
        p.status === "open" &&
        isApproved({ revision: p.revision, publication: p.publication }),
    );
    const items = (await deps.store.list())
      .map((r) => r.item)
      .filter((item) => isOpenFoundItem(item, isApproved));
    batch.scannedLost = lostPosts.length;
    batch.scannedItems = items.length;

    let matchedPairs = batch.matchedPairs;
    for (const lost of lostPosts) {
      // 批次中途关闭：重读状态
      const freshLost = await deps.lost.read(lost.id);
      if (
        !freshLost ||
        freshLost.status !== "open" ||
        !isApproved({
          revision: freshLost.revision,
          publication: freshLost.publication,
        })
      )
        continue;

      const filtered = prefilterFound(freshLost.description, items);
      const results = await deps.matchAi(freshLost, filtered);
      let wrote = false;

      for (const hit of results) {
        const record = await deps.store.read(hit.itemId);
        if (!record || !isOpenFoundItem(record.item, isApproved)) continue;
        const itemRev = foundContentRevision(record.item);
        const existingMsg = await deps.messages.findPair(
          freshLost.id,
          hit.itemId,
        );
        if (
          existingMsg &&
          existingMsg.lostRevision === freshLost.revision &&
          existingMsg.itemRevision === itemRev
        ) {
          // 相同版本：不新增未读；若曾 dismissed 则保持抑制
          continue;
        }
        if (
          existingMsg?.dismissed &&
          existingMsg.lostRevision === freshLost.revision &&
          existingMsg.itemRevision === itemRev
        )
          continue;

        const nowIso = (deps.now?.() ?? new Date()).toISOString();
        if (existingMsg) {
          // 内容实质变化：允许重新判断，重置已读/dismissed
          await deps.messages.mutate(existingMsg.id, (cur) => {
            if (!cur) return null;
            const next: MatchMessage = {
              ...cur,
              lostRevision: freshLost.revision,
              itemRevision: itemRev,
              batchId: date,
              reason: hit.reason,
              read: false,
              dismissed: false,
              updatedAt: nowIso,
            };
            return next;
          });
        } else {
          const id =
            "msg_" + randomUUID().replaceAll("-", "").slice(0, 16);
          const msg: MatchMessage = {
            id,
            lostPostId: freshLost.id,
            itemId: hit.itemId,
            recipientUserId: freshLost.ownerId,
            lostRevision: freshLost.revision,
            itemRevision: itemRev,
            batchId: date,
            reason: hit.reason,
            read: false,
            dismissed: false,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          await deps.messages.mutate(id, () => msg);
        }
        matchedPairs += 1;
        wrote = true;
      }

      await deps.lost.mutate(freshLost.id, (cur) => {
        if (!cur) return null;
        return {
          ...cur,
          batchHint: wrote ? null : "no_candidates",
          updatedAt: (deps.now?.() ?? new Date()).toISOString(),
        };
      });
    }

    const done: MatchingBatch = {
      ...batch,
      status: "completed",
      finishedAt: (deps.now?.() ?? new Date()).toISOString(),
      matchedPairs,
      error: null,
    };
    await deps.batches.write(done);
    return done;
  } catch (err) {
    const failed: MatchingBatch = {
      ...batch,
      status: "failed",
      finishedAt: (deps.now?.() ?? new Date()).toISOString(),
      error: err instanceof Error ? err.message : "配对失败",
    };
    await deps.batches.write(failed);
    return failed;
  }
}
