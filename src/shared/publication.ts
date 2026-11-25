/**
 * C 拥有的发布 / 审核约定。
 * A 负责把招领基础记录接上 revision + publication 字段；B/C 共用判定。
 */

export type ReviewStatus =
  | "allowed"
  | "rejected"
  | "uncertain"
  | "unavailable";

export interface ReviewIssue {
  field: string;
  message: string;
}

export interface PublicationRecord {
  approvedRevision: number;
  reviewedAt: string;
}

export interface PublicationLike {
  revision: number;
  publication: PublicationRecord | null;
}

export interface ReviewCandidate {
  kind: "lost" | "found";
  revision: number;
  textFields: Record<string, string>;
  /** 私有暂存图片引用；寻物可空。 */
  imageRef?: string;
}

export interface ReviewResult {
  status: ReviewStatus;
  issues: ReviewIssue[];
}

export type ReviewSubmission = (
  candidate: ReviewCandidate,
) => Promise<ReviewResult>;

export type IsApprovedVersion = (post: PublicationLike) => boolean;

/** 仅当审核记录版本与内容版本一致时，才是可公开版本。 */
export const isApprovedVersion: IsApprovedVersion = (post) =>
  !!post.publication &&
  post.publication.approvedRevision === post.revision &&
  post.revision > 0;

export function asPublicationFields(
  row: Record<string, unknown> | null | undefined,
): PublicationLike {
  const revision =
    typeof row?.revision === "number" && row.revision > 0 ? row.revision : 0;
  const publication =
    row?.publication &&
    typeof row.publication === "object" &&
    typeof (row.publication as PublicationRecord).approvedRevision === "number"
      ? (row.publication as PublicationRecord)
      : null;
  return { revision, publication };
}
