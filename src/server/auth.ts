import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { Config } from "./config.js";
export function signAdminToken(secret: string) {
  const payload = `admin:${Date.now()}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}
export function verifyAdminToken(token: string, secret: string) {
  if (!token || !secret) return false;
  try {
    const [payload, sig] = Buffer.from(token, "base64url")
      .toString("utf8")
      .split(".");
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const ts = Number(payload.split(":")[1]);
    return (
      /^admin:\d+$/.test(payload) &&
      sig?.length === expected.length &&
      timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) &&
      ts > 0 &&
      ts <= Date.now() &&
      Date.now() - ts <= 7 * 86400000
    );
  } catch {
    return false;
  }
}
export const publisherId = (req: Request) =>
  String(req.header("X-Publisher-Id") || req.body?.ownerId || "").trim();
export const adminRequest = (req: Request, config: Config) =>
  verifyAdminToken(req.header("X-Admin-Token") || "", config.tokenSecret);
