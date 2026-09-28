// 모든 주는 KST(UTC+9) 기준 "월요일 00:00 ~ 일요일 23:59:59"로 정의한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS);
}

function fromKst(kstDate: Date): Date {
  return new Date(kstDate.getTime() - KST_OFFSET_MS);
}

// 주어진 시각이 속한 주의 시작(월요일 00:00 KST)을 UTC Date로 반환
export function getWeekStart(date: Date = new Date()): Date {
  const kst = toKst(date);
  const day = kst.getUTCDay(); // 0=일 1=월 ... 6=토
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - diffToMonday, 0, 0, 0, 0),
  );
  return fromKst(monday);
}

// 해당 주의 마감 시각(일요일 23:59:59.999 KST)을 UTC Date로 반환
export function getWeekDeadline(weekStart: Date): Date {
  return new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

export function isWeekFinalized(weekStart: Date, now: Date = new Date()): boolean {
  return now.getTime() > getWeekDeadline(weekStart).getTime();
}

// 주어진 시각이 속한 "하루"의 시작/끝(KST 자정 기준)을 UTC Date 범위로 반환. 하루 1장 제한에 사용
export function getDayRange(date: Date = new Date()): { start: Date; end: Date } {
  const kst = toKst(date);
  const start = fromKst(new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 0, 0, 0, 0)));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

// 오늘부터 이번 주 일요일까지 남은 일수 (오늘 포함). 월=7 ... 일=1
export function getDaysLeftInWeek(date: Date = new Date()): number {
  const kst = toKst(date);
  const day = kst.getUTCDay(); // 0=일 1=월 ... 6=토
  const isoDay = day === 0 ? 7 : day; // 1=월 ... 7=일
  return 8 - isoDay;
}

export function formatWeekLabel(weekStart: Date): string {
  const kst = toKst(weekStart);
  const end = new Date(kst.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${fmt(kst)} ~ ${fmt(end)}`;
}

export const REQUIRED_COUNT = 3;
export const FINE_PER_MISS = 5000;
