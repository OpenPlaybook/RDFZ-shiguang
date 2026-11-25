import { appUrl } from "./paths";
import type { ReviewIssue, ReviewStatus } from "../shared/publication";

const TEST_ACTOR_KEY = "shiguang_test_actor_v1";

/** 发布者身份由服务端会话决定。保留空实现，避免发布模块继续写入匿名 ID。 */
export function getPublisherId() {
  return "";
}

/** 本地试用：空字符串表示游客；键对应服务端 FIXTURE_ACTORS。 */
export function getTestActor() {
  return sessionStorage.getItem(TEST_ACTOR_KEY) || "";
}

export function setTestActor(key: string) {
  if (!key) sessionStorage.removeItem(TEST_ACTOR_KEY);
  else sessionStorage.setItem(TEST_ACTOR_KEY, key);
}

export class ApiError extends Error {
  status: number;
  issues: ReviewIssue[];
  reviewStatus?: ReviewStatus;
  constructor(
    text: string,
    status: number,
    issues: ReviewIssue[] = [],
    reviewStatus?: ReviewStatus,
  ) {
    super(text);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
    this.reviewStatus = reviewStatus;
  }
}

export async function api<T>(
  url: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...init } = options;
  const headers = new Headers(init.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const testActor = getTestActor();
  if (testActor) headers.set("X-Test-Actor", testActor);
  let response: Response;
  try {
    response = await fetch(appUrl(url), {
      ...init,
      headers,
      body: json !== undefined ? JSON.stringify(json) : init.body,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("连不上服务器，请确认拾光服务已启动", { cause: err });
  }
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    status?: ReviewStatus;
    issues?: ReviewIssue[];
  };
  if (!response.ok) {
    const reviewStatus =
      data.status ||
      (response.status === 503
        ? "unavailable"
        : response.status === 422
          ? "rejected"
          : undefined);
    throw new ApiError(
      data.error || `请求失败 (${response.status})`,
      response.status,
      Array.isArray(data.issues) ? data.issues : [],
      reviewStatus,
    );
  }
  return data;
}
export const message = (err: unknown) =>
  err instanceof Error ? err.message : "操作失败，请稍后重试";
