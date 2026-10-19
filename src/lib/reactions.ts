// 인증샷에 상대방이 남기는 이모티콘 반응. 사진마다 한 번만 고를 수 있고(취소 불가), 이모티콘은 아무거나 고를 수 있다.
// 서버와 화면이 같은 검사를 쓴다.

// 화면에 바로 펼쳐 보여주는 이모티콘 (이 밖의 이모티콘은 폰의 이모티콘 키보드로 직접 입력한다)
export const REACTION_CHOICES = [
  "❤️", "🔥", "👏", "💪", "😂", "🥹",
  "😍", "🥰", "😎", "🤩", "😭", "🤣",
  "🙌", "👍", "🎉", "✨", "💯", "🏆",
  "🥇", "👑", "🌟", "💖", "🫶", "😋",
  "🤤", "🍕", "🍗", "🥗", "🍎", "🥑",
  "🏃", "🚴", "🏋️", "🧘", "😴", "🤔",
  "😅", "🥳", "💫", "🍀", "🌈", "⭐",
  "🐶", "🐱", "🐰", "🦄", "🐻", "🐥",
];

// 정규식 문법(\p{...})은 빌드 설정에 따라 막혀서 RegExp로 만든다
const EMOJI_RE = new RegExp(String.raw`\p{Extended_Pictographic}|\p{Regional_Indicator}`, "u");

// 이모티콘 한 개인지 (글자 하나로 보이는 묶음 하나이고 이모티콘을 포함). 사람이 쓴 긴 글이나 숫자, 일반 글자는 거절한다
export function isReaction(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0 || v.length > 24) return false;
  if (!EMOJI_RE.test(v)) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  return [...segmenter.segment(v)].length === 1;
}

// 입력칸에 들어온 글에서 마지막으로 들어온 이모티콘 하나를 꺼낸다 (이모티콘 키보드로 고르면 바로 쓰려고). 없으면 null
export function lastEmojiIn(text: string): string | null {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const parts = [...segmenter.segment(text)].map((s) => s.segment);
  for (let i = parts.length - 1; i >= 0; i--) if (isReaction(parts[i])) return parts[i];
  return null;
}

// 예전에는 하트(liked)만 있었다: 이모티콘 없이 liked만 true인 사진은 하트로 본다
export const reactionOf = (c: { reaction?: string | null; liked?: boolean }): string | null =>
  isReaction(c.reaction) ? c.reaction : c.liked ? "❤️" : null;
