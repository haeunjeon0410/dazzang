// 대결 카드 말풍선 기본 멘트. 인덱스 0~3 = 인증 0회/1회/2회/3회 이상
export const DEFAULT_CAPTIONS = ["아직이야~", "1개 완료!", "2개! 조금만 더", "다 했다 최고!"];
// 말풍선에 한 줄로 들어가는 길이 ("10월부터 달라집니다" 기준)
export const CAPTION_MAX_LEN = 11;

// 직접 정한 멘트가 있으면 그걸 쓰고, 없으면 인증 횟수별 기본 멘트
export function countCaption(count: number, custom?: string): string {
  return custom || DEFAULT_CAPTIONS[Math.min(3, Math.max(0, count))];
}
