import { appUrl } from "./paths";
import { PUBLISHER_KEY } from "../shared/constants";
import type { ReviewIssue, ReviewStatus } from "../shared/publication";

const TEST_ACTOR_KEY = "shiguang_test_actor_v1";

/** 浏览器侧发布者标识；学校平台登录接入前用于区分同学。 */
export function getPublisherId() {
  let id = localStorage.getItem(PUBLISHER_KEY);
  if (!id) {
    id =
      "pub_" + Date.now().toString(36) + "_" + crypto.randomUUID().slice(0, 8);
    localStorage.setItem(PUBLISHER_KEY, id);
  }
  return id;
}

/** 本地试用夹具键；空表示不使用测试夹具。 */
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
  headers.set("X-Publisher-Id", getPublisherId());
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
