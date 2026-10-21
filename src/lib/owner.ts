import crypto from "crypto";

// 관리자(내 방 목록) 코드. 환경변수 OWNER_CODE에 길고 추측하기 어려운 값을 넣어야 쓸 수 있다.
// 설정이 없으면 관리자 화면은 닫혀 있다 (예전 기본 코드는 누구나 찍어볼 수 있어서 없앴다). 이 값은 서버에서만 확인하고 화면 코드에는 넣지 않는다.
export function isOwnerCode(code: unknown): boolean {
  const configured = process.env.OWNER_CODE;
  if (!configured || typeof code !== "string") return false;
  const expected = Buffer.from(configured);
  const given = Buffer.from(code);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
