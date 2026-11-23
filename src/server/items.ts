import type { Item, ItemRecord } from "../shared/types.js";
export function publicItem(
  record: ItemRecord,
  admin: boolean,
  viewerId: string,
): Item {
  const row = record.item;
  const logs = record.viewLogs
    .slice()
    .sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at))
    .map((l) => ({
      viewerId: l.viewer_id,
      identity: l.identity || "",
      className: l.class_name || "",
      name: l.name || "",
      idNo: l.id_no || "",
      contact: l.contact || "",
      unlockedAt: l.unlocked_at,
      viewedFields: ["失物招领处", "联系人", "联系方式"],
    }));
  const isOwner = !!viewerId && viewerId === row.owner_id;
  const unlocked =
    admin || (!!viewerId && logs.some((l) => l.viewerId === viewerId));
  const sensitive = admin || unlocked || isOwner;
  return {
    id: row.id,
    ownerId: row.owner_id,
    description: row.description,
    place: row.place,
    image: row.image,
    createdAt: row.created_at,
    status: row.status,
    verified: row.verified,
    viewLogs: admin ? logs : [],
    unlocked,
    isOwner,
    office: sensitive ? row.office : "",
    contact: sensitive ? row.contact : "",
    contactType: sensitive ? row.contact_type : "",
    contactValue: sensitive ? row.contact_value : "",
    claim: sensitive ? row.claim : null,
  };
}
