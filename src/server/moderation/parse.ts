import type { ReviewIssue, ReviewResult, ReviewStatus } from "../../shared/publication.js";

const STATUSES = new Set<ReviewStatus>([
  "allowed",
  "rejected",
  "uncertain",
  "unavailable",
]);

export function parseReviewModelOutput(raw: string): ReviewResult {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return {
      status: "unavailable",
      issues: [{ field: "general", message: "审核服务返回异常，请稍后重试" }],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return {
      status: "unavailable",
      issues: [{ field: "general", message: "审核服务返回异常，请稍后重试" }],
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      status: "unavailable",
      issues: [{ field: "general", message: "审核服务返回异常，请稍后重试" }],
    };
  }
  const obj = parsed as Record<string, unknown>;
  const status = obj.status;
  if (typeof status !== "string" || !STATUSES.has(status as ReviewStatus)) {
    return {
      status: "unavailable",
      issues: [{ field: "general", message: "审核服务返回异常，请稍后重试" }],
    };
  }
  // 模型不得自行声称 unavailable；异常走上面分支。模型给 unavailable 当 uncertain。
  const normalized: ReviewStatus =
    status === "unavailable" ? "uncertain" : (status as ReviewStatus);

  const issues: ReviewIssue[] = [];
  if (Array.isArray(obj.issues)) {
    for (const row of obj.issues) {
      if (!row || typeof row !== "object") continue;
      const field = String((row as ReviewIssue).field || "general").slice(0, 40);
      const message = String((row as ReviewIssue).message || "").trim().slice(0, 80);
      if (!message) continue;
      issues.push({ field, message });
    }
  }
  if (normalized !== "allowed" && issues.length === 0) {
    issues.push({
      field: "general",
      message:
        normalized === "rejected"
          ? "内容不适合发布，请修改后再试"
          : "信息不够明确，请补充或重拍后再试",
    });
  }
  if (normalized === "allowed") return { status: "allowed", issues: [] };
  return { status: normalized, issues };
}
