import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../storage.js";
import type { MatchingBatch } from "../../shared/matching.js";

export class BatchStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly root: string) {}

  async init() {
    await mkdir(path.join(this.root, "matching"), { recursive: true });
    return this;
  }

  private file(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error(`无效批次日期: ${date}`);
    return path.join(this.root, "matching", `${date}.json`);
  }

  async read(date: string): Promise<MatchingBatch | null> {
    let raw: string;
    try {
      raw = await readFile(this.file(date), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    return JSON.parse(raw) as MatchingBatch;
  }

  async write(batch: MatchingBatch) {
    const previous = this.queue;
    this.queue = previous.catch(() => {}).then(async () => {
      await atomicWrite(this.file(batch.date), batch);
    });
    await this.queue;
  }

  async drain() {
    await this.queue.catch(() => {});
  }
}
