/** B 每日配对批次与调度配置。时区固定北京时间（IANA：Asia/Shanghai），默认 14:00。 */

export const MATCHING_TIME_ZONE = "Asia/Shanghai";
export const MATCHING_HOUR = 14;
export const MATCHING_MINUTE = 0;
export const MATCHING_MAX_ATTEMPTS = 3;

export type BatchStatus = "running" | "completed" | "failed";

export interface MatchingBatch {
  /** 业务日，格式 YYYY-MM-DD（北京时间）。 */
  date: string;
  status: BatchStatus;
  startedAt: string;
  finishedAt: string | null;
  attempt: number;
  error: string | null;
  matchedPairs: number;
  scannedLost: number;
  scannedItems: number;
}

export interface MatchCandidateResult {
  itemId: string;
  reason: string;
}

export interface MatchModelResponse {
  candidates: MatchCandidateResult[];
}
