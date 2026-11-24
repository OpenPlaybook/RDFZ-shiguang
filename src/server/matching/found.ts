import { createHash } from "node:crypto";
import type { ItemRow } from "../../shared/types.js";
import type { IsApprovedVersion } from "../../shared/b-contracts.js";

/** C 落地前：用公开内容字段派生稳定 revision，实质改内容才变。 */
export function foundContentRevision(item: ItemRow): number {
  if (
    "revision" in item &&
    typeof (item as ItemRow & { revision?: number }).revision === "number"
  )
    return (item as ItemRow & { revision: number }).revision;
  const digest = createHash("sha1")
    .update(
      [
        item.description,
        item.office,
        item.place,
        item.image,
        item.contact_type,
        item.contact_value,
      ].join("\0"),
    )
    .digest();
  return digest.readUInt32BE(0) || 1;
}

export function asPublicationLike(item: ItemRow) {
  const revision = foundContentRevision(item);
  const pub = (item as ItemRow & { publication?: { approvedRevision: number } | null })
    .publication;
  return {
    revision,
    publication:
      pub === undefined
        ? // C 未接入时：开放招领默认视为已审版本（仅读侧；写侧仍走 C 审核）。
          { approvedRevision: revision }
        : pub,
  };
}

export function isOpenFoundItem(
  item: ItemRow,
  isApproved: IsApprovedVersion,
): boolean {
  if (item.status !== "open") return false;
  return isApproved(asPublicationLike(item));
}

/** 粗筛：共享物品类型词或颜色近义词即可进入模型，不全等关键词硬排除。 */
const COLOR_GROUPS = [
  ["灰", "银", "灰白", "银灰", "浅灰", "深灰"],
  ["黑", "深色"],
  ["白", "米白", "乳白"],
  ["蓝", "浅蓝", "深蓝", "藏青"],
  ["红", "粉", "玫红", "酒红"],
  ["绿", "青绿", "墨绿"],
  ["黄", "金", "橙"],
];

const TYPE_WORDS = [
  "水杯",
  "杯子",
  "瓶",
  "饭卡",
  "校园卡",
  "一卡通",
  "钥匙",
  "耳机",
  "充电",
  "线",
  "伞",
  "书包",
  "包",
  "笔",
  "本",
  "眼镜",
  "手表",
  "手机",
  "平板",
  "电脑",
  "衣",
  "帽",
  "鞋",
  "卡",
  "证件",
  "U盘",
  "优盘",
];

function tokens(text: string) {
  return text.toLowerCase();
}

function colorCompatible(a: string, b: string) {
  for (const group of COLOR_GROUPS) {
    const inA = group.some((c) => a.includes(c));
    const inB = group.some((c) => b.includes(c));
    if (inA && inB) return true;
  }
  return false;
}

function typeOverlap(a: string, b: string) {
  return TYPE_WORDS.some((w) => a.includes(w) && b.includes(w));
}

export function prefilterFound(
  lostDescription: string,
  items: ItemRow[],
  limit = 40,
): ItemRow[] {
  const lost = tokens(lostDescription);
  const scored = items
    .map((item) => {
      const found = tokens(item.description + " " + item.place);
      let score = 0;
      if (typeOverlap(lost, found)) score += 3;
      if (colorCompatible(lost, found)) score += 2;
      // 共享汉字片段（长度≥2）弱加分，避免只靠完全相同关键词。
      for (let i = 0; i < lost.length - 1; i++) {
        const bi = lost.slice(i, i + 2);
        if (/[\u4e00-\u9fff]{2}/.test(bi) && found.includes(bi)) score += 1;
      }
      // 无任何信号仍保留少量进入模型，由模型判断缺失信息。
      if (score === 0) score = 0.1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
