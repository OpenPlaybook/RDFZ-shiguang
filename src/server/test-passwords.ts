import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { FIXTURE_ACTORS } from "./auth.js";

/** 本地试用默认密码；修改后写入 data/test-passwords.json。 */
export const DEFAULT_TEST_PASSWORDS: Record<string, string> = {
  xiaoli: "456",
  xiaotang: "123",
};

export type TrialAccount = {
  key: string;
  name: string;
  className: string;
};

export function trialAccounts(): TrialAccount[] {
  return Object.keys(DEFAULT_TEST_PASSWORDS).flatMap((key) => {
    const actor = FIXTURE_ACTORS[key];
    if (!actor || actor.kind !== "student" || !actor.name || !actor.className)
      return [];
    return [{ key, name: actor.name, className: actor.className }];
  });
}

function storePath(dataDir: string) {
  return path.join(dataDir, "test-passwords.json");
}

export async function loadTestPasswords(
  dataDir: string,
): Promise<Record<string, string>> {
  const next = { ...DEFAULT_TEST_PASSWORDS };
  try {
    const raw = await readFile(storePath(dataDir), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_TEST_PASSWORDS)) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) next[key] = value.trim();
    }
  } catch {
    // 无文件时用默认密码
  }
  return next;
}

export async function saveTestPasswords(
  dataDir: string,
  passwords: Record<string, string>,
) {
  await mkdir(dataDir, { recursive: true });
  const out: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_TEST_PASSWORDS)) {
    out[key] = passwords[key] || DEFAULT_TEST_PASSWORDS[key];
  }
  await writeFile(storePath(dataDir), JSON.stringify(out, null, 2) + "\n", "utf8");
}

export function findTrialByProfile(
  name: string,
  className: string,
): TrialAccount | null {
  const n = name.trim();
  const c = className.trim();
  return (
    trialAccounts().find((row) => row.name === n && row.className === c) ||
    null
  );
}
