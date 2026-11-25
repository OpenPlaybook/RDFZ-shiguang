import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import sharp from "sharp";
import { HttpError } from "../errors.js";
import { validId } from "../storage.js";

const REF_RE = /^staging_[A-Za-z0-9]{8,40}$/;

export function isStagingRef(ref: string) {
  return REF_RE.test(ref);
}

export function stagingRoot(dataDir: string) {
  return path.join(dataDir, "staging");
}

export function stagingPath(dataDir: string, ref: string) {
  if (!isStagingRef(ref)) throw new HttpError(400, "无效的暂存图片引用");
  return path.join(stagingRoot(dataDir), `${ref}.jpg`);
}

export async function ensureStagingDir(dataDir: string) {
  await mkdir(stagingRoot(dataDir), { recursive: true });
}

/** 将上传文件转为私有暂存 JPEG，返回 staging_ 引用（非公开 URL）。 */
export async function saveStagingImage(
  dataDir: string,
  file: Express.Multer.File,
  ownerKey: string,
): Promise<{ ref: string; ownerKey: string }> {
  await ensureStagingDir(dataDir);
  const ref = "staging_" + randomUUID().replaceAll("-", "").slice(0, 20);
  const dest = stagingPath(dataDir, ref);
  const tmp = `${dest}.${randomUUID()}.tmp`;
  try {
    await sharp(file.path, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(tmp);
    await rename(tmp, dest);
    await writeFile(
      `${dest}.meta.json`,
      JSON.stringify({
        ownerKey,
        createdAt: new Date().toISOString(),
      }),
      "utf8",
    );
  } catch {
    await rm(tmp, { force: true }).catch(() => {});
    throw new HttpError(400, "无法处理上传图片，请换一张再试");
  } finally {
    await rm(file.path, { force: true }).catch(() => {});
  }
  return { ref, ownerKey };
}

export async function readStagingMeta(dataDir: string, ref: string) {
  const raw = await readFile(`${stagingPath(dataDir, ref)}.meta.json`, "utf8");
  return JSON.parse(raw) as { ownerKey: string; createdAt: string };
}

export async function assertStagingOwner(
  dataDir: string,
  ref: string,
  ownerKey: string,
) {
  try {
    const meta = await readStagingMeta(dataDir, ref);
    if (meta.ownerKey !== ownerKey)
      throw new HttpError(403, "无权使用该暂存图片");
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(404, "暂存图片不存在或已过期");
  }
}

/** 审核通过后把暂存图提升为公开 uploads，返回 /uploads/... */
export async function promoteStagingToUploads(
  dataDir: string,
  ref: string,
): Promise<string> {
  const src = stagingPath(dataDir, ref);
  const name = `${Date.now()}_${randomUUID()}.jpg`;
  const dest = path.join(dataDir, "uploads", name);
  await mkdir(path.join(dataDir, "uploads"), { recursive: true });
  // 复制而非直接 rename，便于失败时仍可回收 staging
  const buf = await readFile(src);
  const handle = await open(dest, "wx", 0o644);
  try {
    await handle.writeFile(buf);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return `/uploads/${name}`;
}

export async function removeStaging(dataDir: string, ref: string) {
  if (!isStagingRef(ref)) return;
  await rm(stagingPath(dataDir, ref), { force: true }).catch(() => {});
  await rm(`${stagingPath(dataDir, ref)}.meta.json`, { force: true }).catch(
    () => {},
  );
}

export async function removeUploadUrl(dataDir: string, imageUrl: string) {
  if (!/^\/uploads\/[A-Za-z0-9_.-]+$/.test(imageUrl)) return;
  const base = path.basename(imageUrl);
  if (!validId(base.replace(/\.[^.]+$/, "")) && !/^[A-Za-z0-9_.-]+$/.test(base))
    return;
  await rm(path.join(dataDir, "uploads", base), { force: true }).catch(() => {});
}
