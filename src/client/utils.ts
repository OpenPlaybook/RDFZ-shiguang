import type { Item } from "../shared/types";
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
export const formatContactWay = (item: Item) =>
  item.contactValue
    ? item.contactType
      ? `${item.contactType}：${item.contactValue}`
      : item.contactValue
    : "未填写";
const statusRank = { open: 0, claimed: 1, withdrawn: 2 };
export const sortItems = (items: Item[]) =>
  items
    .slice()
    .sort(
      (a, b) =>
        statusRank[a.status] - statusRank[b.status] ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
