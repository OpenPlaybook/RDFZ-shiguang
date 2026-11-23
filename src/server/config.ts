import path from "node:path";
export interface Config {
  root: string;
  dataDir: string;
  port: number;
  adminPin: string;
  tokenSecret: string;
  aiKey: string;
  production: boolean;
}
export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
export const DEEPSEEK_MODEL = "deepseek-flash";
export function configFromEnv(): Config {
  const root = path.resolve(import.meta.dirname, "../..");
  const port = Number(process.env.PORT || 3080);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 必须是有效端口");
  const adminPin = process.env.ADMIN_PIN?.trim() || "";
  const tokenSecret = process.env.ADMIN_TOKEN_SECRET?.trim() || "";
  if ((adminPin || tokenSecret) && (!adminPin || tokenSecret.length < 32))
    throw new Error(
      "启用管理功能需同时配置 ADMIN_PIN 和至少 32 字符的 ADMIN_TOKEN_SECRET",
    );
  return {
    root,
    dataDir: path.resolve(root, process.env.DATA_DIR || "data"),
    port,
    adminPin,
    tokenSecret,
    aiKey: process.env.DEEPSEEK_API_KEY?.trim() || "",
    production: process.argv.includes("--production"),
  };
}
