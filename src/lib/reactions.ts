// 인증샷에 상대방이 남기는 이모티콘 반응. 사진마다 한 번만 고를 수 있고(취소 불가), 화면에는 다섯 개를 펼쳐 보여주고, 서버는 이모티콘 하나이면 받는다.
// 서버와 화면이 같은 검사를 쓴다.

// 사진 오른쪽 위에 펼쳐 보여주는 이모티콘 다섯 개
export const REACTIONS = ["❤️", "🔥", "👏", "🤔", "❓"];

// 정규식 문법(\p{...})은 빌드 설정에 따라 막혀서 RegExp로 만든다
const EMOJI_RE = new RegExp(String.raw`\p{Extended_Pictographic}|\p{Regional_Indicator}`, "u");

// 이모티콘 한 개인지 (글자 하나로 보이는 묶음 하나이고 이모티콘을 포함). 사람이 쓴 긴 글이나 숫자, 일반 글자는 거절한다
export function isReaction(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 24) return false;
  if (!EMOJI_RE.test(v)) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(v)].length === 1;
}

// 예전에는 하트(liked)만 있었다: 이모티콘 없이 liked만 true인 사진은 하트로 본다
export const reactionOf = (c: { reaction?: string | null; liked?: boolean }): string | null =>
  isReaction(c.reaction) ? c.reaction : c.liked ? "❤️" : null;
