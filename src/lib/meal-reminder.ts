// 식사 알림 시간 계산. 시간은 모두 한국 시간(KST) "HH:mm" 글자로 다룬다.
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// 스케줄러(GitHub Actions)는 15분마다 부르고 가끔 10분 넘게 늦어지기도 해서 정한 시간부터 이 시간 안에 부르면 알림을 보낸다
export const REMINDER_WINDOW_MIN = 45;

export function kstNow(now: Date = new Date()): { day: string; minutes: number } {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { day: k.toISOString().slice(0, 10), minutes: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// 지금(하루 중 분)이 정한 시간부터 알림 창 안인가
export function isDue(nowMinutes: number, time: string): boolean {
  const d = nowMinutes - toMinutes(time);
  return d >= 0 && d < REMINDER_WINDOW_MIN;
}
