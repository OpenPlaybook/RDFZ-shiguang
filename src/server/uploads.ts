import multer from "multer";
import { open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
export function uploadMiddleware(root: string) {
  return multer({
    dest: path.join(root, "tmp"),
    limits: {
      fileSize: 8 * 1024 * 1024,
      files: 1,
      fields: 12,
      fieldSize: 16000,
    },
    fileFilter: (_req, file, cb) =>
      cb(null, file.mimetype.startsWith("image/")),
  }).single("image");
}
export async function commitImage(root: string, file: Express.Multer.File) {
  const handle = await open(file.path, "r");
  const bytes = Buffer.alloc(12);
  try {
    await handle.read(bytes, 0, 12, 0);
  } finally {
    await handle.close();
  }
  let ext = "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ext = ".jpg";
  else if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    ext = ".png";
  else if (/^GIF8[79]a/.test(bytes.toString("ascii", 0, 6))) ext = ".gif";
  else if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    ext = ".webp";
  if (!ext) throw new HttpError(400, "请上传 JPEG、PNG、GIF 或 WebP 图片");
  const name = `${Date.now()}_${randomUUID()}${ext}`;
  await rename(file.path, path.join(root, "uploads", name));
  return `/uploads/${name}`;
}
export async function cleanupUpload(file?: Express.Multer.File) {
  if (file) await rm(file.path, { force: true });
}
