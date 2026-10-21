"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { REACTIONS } from "@/lib/reactions";

// 사진 상세 창의 오른쪽 위에 얹는 이모티콘 반응 (운동 사진과 식단 사진이 같이 쓴다).
// - 반응이 있으면 그 이모티콘이 튀어나오듯 나타난다 (reaction-pop)
// - 반응이 없고 친구 사진이면 버튼 -> 이모티콘 다섯 개 -> 고르는 순간 같은 이모티콘이 팡 터진다
// - 내 사진이고 반응이 없으면 아무것도 보이지 않는다
// onPick은 서버에 반응을 남기고, 남겨진 이모티콘(실패하면 null)을 돌려준다. 고르면 위쪽(부모)이 reaction을 채워 준다.
// tap: 부모가 사진을 누를 때마다 올리는 숫자. 반응이 있으면 사진을 누를 때마다 그 이모티콘이 다시 터진다
// inward: 사진을 자르는 틀 안에서 쓸 때 조각들이 틀 안쪽(왼쪽 아래)으로만 터지게 한다
export function ReactionOverlay({
  mine,
  reaction,
  onPick,
  inward = false,
  tap = 0,
}: {
  mine: boolean;
  reaction: string | null;
  onPick: (emoji: string) => Promise<string | null>;
  inward?: boolean;
  tap?: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState<string | null>(null);
  // 터짐 연출을 처음부터 다시 시작시키는 번호
  const [burstId, setBurstId] = useState(0);
  const [lastTap, setLastTap] = useState(tap);
  if (tap !== lastTap) {
    setLastTap(tap);
    if (reaction) {
      setBurst(reaction);
      setBurstId((n) => n + 1);
    }
  }

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(null), 1000);
    return () => clearTimeout(t);
  }, [burst, burstId]);

  async function pick(emoji: string) {
    setBusy(true);
    try {
      const chosen = await onPick(emoji);
      if (chosen) {
        setOpen(false);
        setBurst(chosen);
        setBurstId((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {reaction ? (
        <span
          key={reaction}
          className="reaction-pop absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-xl shadow"
          aria-label={`${reaction} 반응`}
        >
          {reaction}
        </span>
      ) : !mine ? (
        open ? (
          <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-white/95 px-1.5 py-1 shadow-lg" role="menu">
            {REACTIONS.map((e) => (
              <button
                key={e}
                disabled={busy}
                onClick={() => pick(e)}
                aria-label={`${e} 반응 남기기`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-xl transition-transform hover:scale-110 active:scale-125 disabled:opacity-60"
              >
                {e}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            aria-label="이모티콘 반응 남기기"
            className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-[#de73a5] shadow"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="12" r="8" />
              <path d="M8 14a4 4 0 0 0 6 0" />
              <path d="M9 10h.01M13 10h.01" />
              <path d="M19 3v4M17 5h4" />
            </svg>
          </button>
        )
      ) : null}
      {burst && <ReactionBurst key={burstId} emoji={burst} inward={inward} />}
    </>
  );
}

// 고른 이모티콘 조각들이 오른쪽 위에서 사방으로 터진다 (항상 같은 모양이라 매번 똑같이 터진다)
function ReactionBurst({ emoji, inward }: { emoji: string; inward: boolean }) {
  const parts = Array.from({ length: 10 }, (_, i) => {
    // 안쪽 모드: 90도(아래) ~ 180도(왼쪽) 사이로만 날아간다
    const angle = inward ? Math.PI / 2 + (i / 9) * (Math.PI / 2) : (i / 10) * Math.PI * 2 + (i % 2) * 0.3;
    const dist = 54 + (i % 3) * 16;
    return {
      bx: Math.round(Math.cos(angle) * dist),
      by: Math.round(Math.sin(angle) * dist),
      br: (i % 2 ? 1 : -1) * (30 + i * 12),
      size: i % 3 === 0 ? 20 : 15,
    };
  });
  return (
    <span className="pointer-events-none absolute right-2 top-2 h-9 w-9" aria-hidden>
      {parts.map((p, i) => (
        <span
          key={i}
          className="reaction-particle absolute left-1/2 top-1/2"
          style={{ "--bx": `${p.bx}px`, "--by": `${p.by}px`, "--br": `${p.br}deg`, fontSize: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 } as CSSProperties}
        >
          {emoji}
        </span>
      ))}
    </span>
  );
}
