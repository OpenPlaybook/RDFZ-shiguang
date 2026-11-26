import { AsyncLocalStorage } from "node:async_hooks";
import type { CurrentActor } from "../shared/identity.js";
import { HttpError } from "./errors.js";

export interface PlatformScope {
  requestId: string;
  actor: CurrentActor;
  schoolId: string;
  dataRoot: string;
  classIds: string[] | null;
  signal: AbortSignal;
}
export const platformScope = new AsyncLocalStorage<PlatformScope>();
export function visibleInScope(classId: string | undefined) {
  const scope = platformScope.getStore();
  return (
    !scope ||
    (!!classId && (scope.classIds === null || scope.classIds.includes(classId)))
  );
}
export function assertInScope(classId: string | undefined) {
  if (!visibleInScope(classId)) throw new HttpError(404, "记录不存在");
}
export function newRecordClass() {
  const scope = platformScope.getStore();
  if (!scope) return undefined;
  const id = scope.actor.classId;
  if (!id || (scope.classIds !== null && !scope.classIds.includes(id)))
    throw new HttpError(403, "当前身份没有班级使用权限");
  return id;
}
