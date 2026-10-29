import crypto from "crypto";
import type { NextRequest } from "next/server";

// 외부 앱(mypt, uh-money)이 부르는 읽기 전용 주소의 인증. EXTERNAL_TOKEN이 설정돼 있어야 열리고,
// 값 비교는 걸린 시간으로 추측할 수 없게 일정 시간 비교(timingSafeEqual)로 한다
export function isExternalAuthorized(req: NextRequest): boolean {
  const token = process.env.EXTERNAL_TOKEN;
  if (!token) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${token}`);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}
