// 하루/한 주는 KST(UTC+9) 오전 6시에 바뀐다. 자기 전 새벽에 운동해도 "그날" 인증으로 치기 위해서다.
// - 하루: 오전 6:00 ~ 다음 날 오전 5:59:59
// - 한 주: 월요일 오전 6:00 ~ 다음 주 월요일 오전 5:59:59 (마감)
// DB에 저장되는 weekStart 키는 예전과 같은 "월요일 00:00 KST"를 그대로 쓴다 (기존 기록과 호환).
// 실제 주가 시작되는 시각은 weekStart + 6시간이다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_RESET_HOUR = 6;
const RESET_OFFSET_MS = DAY_RESET_HOUR * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 리셋 시각만큼 당겨서 KST 달력 날짜로 본다 (예: 화요일 새벽 2시 → 월요일)
function toResetKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS - RESET_OFFSET_MS);
}

function fromKst(kstDate: Date): Date {
  return new Date(kstDate.getTime() - KST_OFFSET_MS);
}

// 주어진 시각이 속한 주의 키(월요일 00:00 KST)를 UTC Date로 반환
export function getWeekStart(date: Date = new Date()): Date {
  const kst = toResetKst(date);
  const day = kst.getUTCDay(); // 0=일 1=월 ... 6=토
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() - diffToMonday, 0, 0, 0, 0),
  );
  return fromKst(monday);
}

// 해당 주의 마감 시각(다음 주 월요일 05:59:59.999 KST)을 UTC Date로 반환
export function getWeekDeadline(weekStart: Date): Date {
  return new Date(weekStart.getTime() + 7 * DAY_MS + RESET_OFFSET_MS - 1);
}

export function isWeekFinalized(weekStart: Date, now: Date = new Date()): boolean {
  return now.getTime() > getWeekDeadline(weekStart).getTime();
}

// 주어진 시각이 속한 "하루"(오전 6시 기준)의 시작/끝을 UTC Date 범위로 반환. 하루 1장 제한에 사용
export function getDayRange(date: Date = new Date()): { start: Date; end: Date } {
  const kst = toResetKst(date);
  const midnight = fromKst(new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 0, 0, 0, 0)));
  const start = new Date(midnight.getTime() + RESET_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS - 1) };
}

// 오늘부터 이번 주 마지막 날(일요일)까지 남은 일수 (오늘 포함). 월=7 ... 일=1
export function getDaysLeftInWeek(date: Date = new Date()): number {
  const day = toResetKst(date).getUTCDay(); // 0=일 1=월 ... 6=토
  const isoDay = day === 0 ? 7 : day; // 1=월 ... 7=일
  return 8 - isoDay;
}

export function formatWeekLabel(weekStart: Date): string {
  const kst = new Date(weekStart.getTime() + KST_OFFSET_MS);
  const end = new Date(kst.getTime() + 6 * DAY_MS);
  const fmt = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${fmt(kst)} ~ ${fmt(end)}`;
}

export const REQUIRED_COUNT = 3;
export const FINE_PER_MISS = 5000;
