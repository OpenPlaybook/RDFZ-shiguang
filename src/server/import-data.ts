import {
  readFile,
  readdir,
  mkdir,
  copyFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import lockfile from "proper-lockfile";
import { atomicWrite, validId } from "./storage.js";
import type { ItemRow, ViewLogRow, Feedback } from "../shared/types.js";
export async function importData(source: string, target: string) {
  source = path.resolve(source);
  target = path.resolve(target);
  if (
    source === target ||
    target.startsWith(source + path.sep) ||
    source.startsWith(target + path.sep)
  )
    throw new Error("来源和目标目录不可重叠");
  const stage = target + ".import-" + randomUUID();
  await mkdir(path.dirname(target), { recursive: true });
  const release = await lockfile.lock(target, { realpath: false, retries: 0 });
  try {
    try {
      if ((await readdir(target)).length)
        throw new Error("目标目录已有内容，拒绝覆盖");
      await rm(target, { recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const data = JSON.parse(
      await readFile(path.join(source, "data/store.json"), "utf8"),
    ) as { items: ItemRow[]; viewLogs: ViewLogRow[] };
    if (!Array.isArray(data.items) || !Array.isArray(data.viewLogs))
      throw new Error("旧数据格式不正确");
    if (new Set(data.items.map((i) => i.id)).size !== data.items.length)
      throw new Error("旧数据含重复帖子 ID");
    if (data.viewLogs.some((l) => !data.items.some((i) => i.id === l.item_id)))
      throw new Error("存在无对应帖子的查看记录");
    for (const d of ["items", "uploads", "feedback", "tmp"])
      await mkdir(path.join(stage, d), { recursive: true });
    let images = 0;
    for (const item of data.items) {
      if (!validId(item.id) || !/^\/uploads\/[A-Za-z0-9_.-]+$/.test(item.image))
        throw new Error("旧数据 ID 或图片路径不正确");
      await atomicWrite(path.join(stage, "items", item.id + ".json"), {
        item,
        viewLogs: data.viewLogs.filter((l) => l.item_id === item.id),
      });
      const src = path.join(source, item.image.slice(1)),
        dst = path.join(stage, "uploads", path.basename(item.image));
      await copyFile(src, dst);
      if (
        createHash("sha256")
          .update(await readFile(src))
          .digest("hex") !==
        createHash("sha256")
          .update(await readFile(dst))
          .digest("hex")
      )
        throw new Error("图片校验失败");
      images++;
    }
    let feedback: Feedback[] = [];
    try {
      feedback = JSON.parse(
        await readFile(path.join(source, "data/feedback.json"), "utf8"),
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (!Array.isArray(feedback)) throw new Error("旧反馈格式不正确");
    for (const entry of feedback) {
      if (!validId(entry.id)) throw new Error("反馈 ID 不正确");
      await atomicWrite(
        path.join(stage, "feedback", entry.id + ".json"),
        entry,
      );
    }
    await rename(stage, target);
    return {
      items: data.items.length,
      viewLogs: data.viewLogs.length,
      images,
      feedback: feedback.length,
    };
  } finally {
    await rm(stage, { recursive: true, force: true });
    await release();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [source, target] = process.argv.slice(2);
  if (!source || !target)
    throw new Error(
      "用法：pnpm import:data <旧项目目录> <新数据目录>；先停止旧服务，目标须为空",
    );
  console.log("导入完成：", await importData(source, target));
}
