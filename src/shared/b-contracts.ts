/**
 * B 对 A/C 的依赖契约（应用内约定，非学校平台接口）。
 * A 拥有正式 identity 模块；C 拥有正式 publication/moderation。
 * 此处类型供 B 模块注入，避免 B 改写中央身份实现。
 */

export type ActorKind = "guest" | "student" | "kiosk" | "admin";

export interface CurrentActor {
  kind: ActorKind;
  userId?: string;
  name?: string;
  className?: string;
  stationId?: string;
}

export type ReviewStatus =
  | "allowed"
  | "rejected"
  | "uncertain"
  | "unavailable";

export interface ReviewIssue {
  field: string;
  message: string;
}

export interface ReviewCandidate {
  kind: "lost" | "found";
  revision: number;
  textFields: Record<string, string>;
  /** 私有暂存图片引用；无图可空。 */
  imageRef?: string;
}

export interface ReviewResult {
  status: ReviewStatus;
  issues: ReviewIssue[];
}

export interface PublicationLike {
  revision: number;
  publication: { approvedRevision: number } | null;
}

export type ResolveActor = (req: {
  header: (name: string) => string | undefined;
  body?: unknown;
}) => CurrentActor | Promise<CurrentActor>;

export type ReviewSubmission = (
  candidate: ReviewCandidate,
) => Promise<ReviewResult>;

export type IsApprovedVersion = (post: PublicationLike) => boolean;
