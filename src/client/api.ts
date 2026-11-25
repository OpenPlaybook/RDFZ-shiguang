import { appUrl } from "./paths";
import { ADMIN_TOKEN_KEY, PUBLISHER_KEY } from "../shared/constants";
import type { ReviewIssue, ReviewStatus } from "../shared/publication";

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

export function getPublisherId() {
  let id = localStorage.getItem(PUBLISHER_KEY);
  if (!id) {
    id =
      "pub_" + Date.now().toString(36) + "_" + crypto.randomUUID().slice(0, 8);
    localStorage.setItem(PUBLISHER_KEY, id);
  }
  return id;
}
export async function api<T>(
  url: string,
  options: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("X-Publisher-Id", getPublisherId());
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) headers.set("X-Admin-Token", token);
  if (json !== undefined) headers.set("Content-Type", "application/json");
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
  if (!response.ok)
    throw new ApiError(
      data.error || `请求失败 (${response.status})`,
      response.status,
      Array.isArray(data.issues) ? data.issues : [],
      data.status,
    );
  return data;
}
export const message = (err: unknown) =>
  err instanceof Error ? err.message : "操作失败，请稍后重试";
