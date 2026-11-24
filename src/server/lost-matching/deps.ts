import type {
  CurrentActor,
  IsApprovedVersion,
  ResolveActor,
  ReviewSubmission,
} from "../../shared/b-contracts.js";

/**
 * 本地/测试身份：仅非生产启用。
 * 生产必须由 A 注入可信 resolveActor，禁止信任客户端自报 userId。
 */
export function createTestResolveActor(
  enabled: boolean,
  fallback?: CurrentActor,
): ResolveActor {
  return ({ header }) => {
    if (!enabled) {
      return fallback || { kind: "guest" };
    }
    const userId = header("x-test-user-id") || header("x-publisher-id") || "";
    const kind = (header("x-test-actor-kind") ||
      (userId ? "student" : "guest")) as CurrentActor["kind"];
    if (kind === "guest" || !userId) return { kind: "guest" };
    if (kind === "kiosk")
      return {
        kind: "kiosk",
        userId,
        stationId: header("x-test-station-id") || "station_test",
        name: header("x-test-name") || "公共终端",
      };
    return {
      kind: kind === "admin" ? "admin" : "student",
      userId,
      name: header("x-test-name") || "测试同学",
      className: header("x-test-class") || "测试班",
    };
  };
}

/**
 * 测试审核替身。生产不得默认 allowed——未注入时返回 unavailable。
 */
export function createReviewSubmission(
  mode: "unavailable" | "allowed" | ReviewSubmission,
): ReviewSubmission {
  if (typeof mode === "function") return mode;
  if (mode === "allowed")
    return async () => ({ status: "allowed", issues: [] });
  return async () => ({
    status: "unavailable",
    issues: [{ field: "moderation", message: "审核服务未接入" }],
  });
}

export const defaultIsApprovedVersion: IsApprovedVersion = (post) =>
  !!post.publication &&
  post.publication.approvedRevision === post.revision;
