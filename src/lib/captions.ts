// 대결 카드 말풍선 멘트. 인덱스 0~3 = 인증 0회/1회/2회/3회 이상
export const DEFAULT_CAPTIONS = ["아직이야~", "1개 완료!", "2개! 조금만 더", "다 했다 최고!"];
// 말풍선이 한 줄 중심으로 보이도록 새 멘트는 최대 10자까지 허용한다.
export const CAPTION_MAX_LEN = 15;

// 사용자가 직접 정한 멘트가 있으면 그걸 쓰고, 빈 칸이면 기본 멘트
export function savedCaption(custom?: string[]): string {
  return custom?.find((caption) => caption.trim())?.trim() ?? "";
}

export function countCaption(count: number, custom?: string[]): string {
  const common = savedCaption(custom);
  if (common) return common;

  const idx = Math.min(3, Math.max(0, count));
  return DEFAULT_CAPTIONS[idx];
}
