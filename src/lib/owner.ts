import crypto from "crypto";

// 관리자(내 방 목록) 코드. 운영에서는 환경변수 OWNER_CODE로 길고 추측하기 어려운 값을 쓴다.
// 설정이 없으면 예전 코드로 동작한다(기존 사용에 영향 없도록). 이 값은 서버에서만 확인하고 화면 코드에는 넣지 않는다.
const FALLBACK_OWNER_CODE = "000000";

export function isOwnerCode(code: unknown): boolean {
  if (typeof code !== "string") return false;
  const expected = Buffer.from(process.env.OWNER_CODE || FALLBACK_OWNER_CODE);
  const given = Buffer.from(code);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
