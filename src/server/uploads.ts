import multer from "multer";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { HttpError } from "./errors.js";

export function uploadMiddleware(root: string) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) =>
        callback(null, path.join(root, "tmp")),
    }),
    limits: {
      fileSize: 20 * 1024 * 1024,
      files: 1,
      fields: 12,
      fieldSize: 16000,
    },
    // 格式由 commitImage + sharp 统一转成 JPEG，这里尽量放行
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || "").toLowerCase();
      const name = file.originalname || "";
      const ok =
        mime.startsWith("image/") ||
        mime === "application/octet-stream" ||
        mime === "application/heic" ||
        mime === "application/heif" ||
        mime === "" ||
        /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif{1,2}|avif|jfif)$/i.test(name);
      cb(null, ok);
    },
  }).single("image");
}

/**
 * 任意常见图片格式一律转成 JPEG 落盘。
 * 客户端也会先尽量转成 JPEG；这里用 sharp 做最终兜底。
 */
export async function commitImage(root: string, file: Express.Multer.File) {
  const name = `${Date.now()}_${randomUUID()}.jpg`;
  const dest = path.join(root, "uploads", name);
  const converted = `${file.path}.${randomUUID()}.jpg`;
  try {
    await sharp(file.path, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(converted);
    await rename(converted, dest);
  } catch {
    await rm(converted, { force: true }).catch(() => {});
    await rm(file.path, { force: true }).catch(() => {});
    throw new HttpError(400, "无法解析该图片。请换一张照片后再试");
  }
  await rm(file.path, { force: true }).catch(() => {});
  return `/uploads/${name}`;
}

export async function cleanupUpload(file?: Express.Multer.File) {
  if (file) await rm(file.path, { force: true });
}
