export interface Profile {
  identity: string;
  className: string;
  name: string;
  idNo: string;
  contact: string;
}
export interface Claim extends Profile {
  claimedAt: string;
  byAdmin: boolean;
}
export interface Verification {
  verifiedAt: string;
  note: string;
  by: string;
}
export interface ViewLog extends Profile {
  viewerId: string;
  unlockedAt: string;
  viewedFields: string[];
}
export interface PublicationInfo {
  approvedRevision: number;
  reviewedAt: string;
}
export interface Item {
  id: string;
  ownerId: string;
  description: string;
  office: string;
  place: string;
  contact: string;
  contactType: string;
  contactValue: string;
  image: string;
  createdAt: string;
  status: "open" | "claimed";
  claim: Claim | null;
  verified: Verification | null;
  viewLogs: ViewLog[];
  unlocked: boolean;
  isOwner: boolean;
  /** C：内容版本；缺省表示历史未接入审核。 */
  revision?: number;
  publication?: PublicationInfo | null;
}
export interface ItemRow {
  id: string;
  owner_id: string;
  description: string;
  office: string;
  place: string;
  contact: string;
  contact_type: string;
  contact_value: string;
  image: string;
  created_at: string;
  status: "open" | "claimed";
  claim: Claim | null;
  verified: Verification | null;
  revision?: number;
  publication?: PublicationInfo | null;
}
export interface ViewLogRow {
  id: string;
  item_id: string;
  viewer_id: string;
  identity: string;
  class_name: string;
  name: string;
  id_no: string;
  contact: string;
  unlocked_at: string;
}
export interface ItemRecord {
  item: ItemRow;
  viewLogs: ViewLogRow[];
}
export interface FillFields {
  place: string;
  office: string;
  contact: string;
  contactType: string;
  contactValue: string;
}
export interface AiStatus {
  configured: boolean;
  model: string;
}
export interface Feedback {
  id: string;
  name: string;
  contact: string;
  message: string;
  createdAt: string;
}
