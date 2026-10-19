// AI 사진 분석이 왜 안 됐는지를 사람이 읽는 말로 바꾼다. 서버 로그를 못 보는 상태에서도 화면과 알림만 보고 원인을 짐작할 수 있게 한다.
// reason은 analyzeMealPhotoDetailed가 돌려주는 값 (no-key | gateway-<코드> | timeout | network | unreadable)
export function aiFailureText(reason: unknown): string {
  const r = typeof reason === "string" ? reason : "";
  if (r === "no-key") return "서버에 AI 키가 설정되지 않았어요";
  if (r === "gateway-401" || r === "gateway-403") return "AI 키가 거절됐어요 (키를 확인해 주세요)";
  if (r === "gateway-429") return "AI 요청이 너무 많아요";
  if (r.startsWith("gateway-")) return `AI 서버 오류예요 (${r.slice(8)})`;
  if (r === "timeout") return "AI 응답이 너무 늦어요";
  if (r === "unreadable") return "AI 답을 읽지 못했어요";
  if (r === "network") return "AI 서버에 연결하지 못했어요";
  return "";
}
