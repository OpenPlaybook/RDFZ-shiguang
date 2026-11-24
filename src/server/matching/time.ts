import {
  MATCHING_HOUR,
  MATCHING_MINUTE,
  MATCHING_TIME_ZONE,
} from "../../shared/matching.js";

/** 返回北京时间的 YYYY-MM-DD。 */
export function beijingDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MATCHING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 北京时间当日匹配时刻（返回对应 UTC Date）。 */
export function beijingBatchInstant(
  date = beijingDate(),
  hour = MATCHING_HOUR,
  minute = MATCHING_MINUTE,
): Date {
  // 用偏移探测构造：先假定 UTC，再校正到目标北京墙钟。
  const guess = new Date(`${date}T${pad(hour)}:${pad(minute)}:00.000Z`);
  const wall = beijingParts(guess);
  const desiredMinutes = hour * 60 + minute;
  const actualMinutes = wall.hour * 60 + wall.minute;
  const deltaMin =
    desiredMinutes -
    actualMinutes +
    (wall.date === date ? 0 : wall.date > date ? -24 * 60 : 24 * 60);
  return new Date(guess.getTime() + deltaMin * 60_000);
}

export function beijingParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MATCHING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** 当前是否已到达（含）当日北京时间 14:00。 */
export function pastBatchTime(now: Date = new Date()) {
  const { hour, minute } = beijingParts(now);
  return (
    hour > MATCHING_HOUR ||
    (hour === MATCHING_HOUR && minute >= MATCHING_MINUTE)
  );
}

/** 下一次应触发的 UTC 时刻：若已过今日 14:00 则返回明日 14:00。 */
export function nextBatchInstant(now: Date = new Date()) {
  const today = beijingDate(now);
  const todayAt = beijingBatchInstant(today);
  if (now.getTime() < todayAt.getTime()) return todayAt;
  const tomorrow = new Date(todayAt.getTime() + 36 * 3600_000);
  return beijingBatchInstant(beijingDate(tomorrow));
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
