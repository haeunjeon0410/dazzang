"use client";

import { useState } from "react";
import { CaptionBubble, CharacterSprite, CharPose, CharRow } from "./sprite";

// 새 소식 팝업. 업데이트가 있을 때마다 UPDATE_ID를 바꾸면, 앱을 처음 여는 순간 한 번만 보여준다.
// 어느 소식을 이 기기에서 이미 봤는지는 localStorage에 기억한다 (못 쓰면 열 때마다 뜨는 정도)
const UPDATE_ID = "2026-10-19";
const SEEN_KEY = "dajjang_seen_update";

type Slide = {
  emoji: string;
  title: string;
  lines: string[];
  row: (typeof CharRow)[keyof typeof CharRow];
  pose: (typeof CharPose)[keyof typeof CharPose];
  // 식단 인증(실험실)을 켠 사람에게만 해당하는 소식
  mealOnly?: boolean;
  // 식단 인증을 아직 안 켠 사람에게만 보여줄 소식
  noMealOnly?: boolean;
};

const SLIDES: Slide[] = [
  {
    emoji: "📸",
    title: "식단, 알아서 기록돼요!",
    lines: ["사진만 올리면 AI가 음식과 칼로리를 바로 적어줘요", "아이폰 동작 버튼으로 찍어도 확인 없이 기록돼요"],
    row: CharRow.A,
    pose: CharPose.WIN,
    mealOnly: true,
  },
  {
    emoji: "✏️",
    title: "틀렸으면 고치면 돼요",
    lines: ["식단 창에서 [수정]을 누르면", "음식 이름도, 먹은 양(1/4 · 절반 · 3/4)도 바꿀 수 있어요"],
    row: CharRow.B,
    pose: CharPose.NEUTRAL,
    mealOnly: true,
  },
  {
    emoji: "🔔",
    title: "밥 먹기 전에 콕!",
    lines: ["내 정보 → 실험실에서 식사 알림을 켜면", "점심 · 저녁 시간에 식단 올리라고 알려줘요"],
    row: CharRow.A,
    pose: CharPose.NEUTRAL,
    mealOnly: true,
  },
  {
    emoji: "🧪",
    title: "실험실이 생겼어요",
    lines: ["내 정보 → 실험실에서 식단 인증을 켜 보세요", "AI가 칼로리를 알려줘요 (벌금과는 상관없어요)"],
    row: CharRow.A,
    pose: CharPose.WIN,
    noMealOnly: true,
  },
  {
    emoji: "🗑️",
    title: "인증샷 지울 수 있어요",
    lines: ["내가 올린 사진을 누르면 오른쪽 위에 ✕가 떠요", "잘못 올렸다면 지우고 다시 올려 주세요"],
    row: CharRow.B,
    pose: CharPose.SAD,
  },
];

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === UPDATE_ID;
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, UPDATE_ID);
  } catch {
    // localStorage 접근 불가하면 무시 (다음에도 한 번 더 뜨는 정도)
  }
}

export function WhatsNew({ ready, labMeal }: { ready: boolean; labMeal: boolean }) {
  // 로그인 정보가 오기 전(ready=false)에는 아무것도 그리지 않으므로, 서버 렌더와 어긋날 일이 없다
  const [show, setShow] = useState(() => !alreadySeen());
  const [page, setPage] = useState(0);

  if (!ready || !show) return null;

  const slides = SLIDES.filter((s) => (s.mealOnly ? labMeal : s.noMealOnly ? !labMeal : true));
  // 0쪽은 인사, 그다음부터 소식 한 장씩
  const last = slides.length;
  const slide = page > 0 ? slides[page - 1] : null;

  function close() {
    markSeen();
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <div className="celebrate-pop relative w-full max-w-[19.5rem] overflow-hidden rounded-3xl border-2 border-[#ffc2dc] bg-white p-5 text-center shadow-xl">
        {/* 반짝이 장식 */}
        <span className="pointer-events-none absolute left-4 top-4 animate-pulse text-sm text-[#ffc72c]">✦</span>
        <span className="pointer-events-none absolute right-12 top-7 animate-pulse text-xs text-[#f472b6] [animation-delay:400ms]">✦</span>
        <span className="pointer-events-none absolute left-7 top-24 animate-pulse text-xs text-[#f9a8d4] [animation-delay:800ms]">✦</span>

        <button
          onClick={close}
          aria-label="닫기"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#ffeef5] text-sm text-[#c2679c]"
        >
          ✕
        </button>

        <div key={page} className="celebrate-pop space-y-3">
          {slide === null ? (
            <>
              <div className="flex items-end justify-center gap-1 pt-2">
                <CharacterSprite row={CharRow.A} pose={CharPose.WIN} height={104} className="celebrate-hop" />
                <CharacterSprite row={CharRow.B} pose={CharPose.WIN} height={104} className="celebrate-hop [animation-delay:250ms]" />
              </div>
              <CaptionBubble row={CharRow.A} text="새 소식이 왔어요!" height={52} />
              <p className="text-sm font-semibold text-[#4a2540]">다짱이 이만큼 좋아졌어요 ✨</p>
              <p className="text-xs text-[#b4779b]">넘겨 보면서 뭐가 달라졌는지 확인해 보세요</p>
            </>
          ) : (
            <>
              <div className="pt-2">
                <CharacterSprite row={slide.row} pose={slide.pose} height={92} className="mx-auto" />
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#ffc2dc] bg-[#fff0f6] px-3 py-1 text-base font-black text-[#b4356f]">
                <span>{slide.emoji}</span>
                <span className="text-sm">{slide.title}</span>
              </div>
              <div className="space-y-1.5 rounded-2xl bg-[#fff0f6] px-3 py-3">
                {slide.lines.map((l) => (
                  <p key={l} className="break-keep text-[13px] font-semibold leading-snug text-[#4a2540]">
                    {l}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {Array.from({ length: last + 1 }, (_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === page ? "w-4 bg-[#de73a5]" : "w-1.5 bg-[#ffd6e8]"}`} />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
          {page > 0 ? (
            <button onClick={() => setPage((p) => p - 1)} className="rounded-xl bg-[#ffeef5] px-4 py-3 text-sm font-semibold text-[#c2679c]">
              이전
            </button>
          ) : (
            <span />
          )}
          {page < last ? (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="col-start-2 rounded-xl bg-[#de73a5] py-3 text-sm font-bold text-white"
            >
              {page === 0 ? "구경하기" : "다음"}
            </button>
          ) : (
            <button onClick={close} className="col-start-2 rounded-xl bg-[#de73a5] py-3 text-sm font-bold text-white">
              알겠어요! 💗
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
