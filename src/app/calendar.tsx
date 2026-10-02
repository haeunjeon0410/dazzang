"use client";

import { useEffect, useState } from "react";

type CheckinItem = { id: string; photoUrl: string; createdAt: string; userId: string; liked: boolean };
type PersonSummary = { userId: string; name: string; checkins: CheckinItem[] };

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 하루는 오전 6시에 바뀐다 (lib/week.ts와 동일). 새벽 2시 인증은 전날 칸
const DAY_RESET_MS = 6 * 60 * 60 * 1000;
const SEEN_LIKES_KEY = "dajjang_seen_likes";

function kstDayIndex(dateStr: string): number {
  const kst = new Date(new Date(dateStr).getTime() + KST_OFFSET_MS - DAY_RESET_MS);
  const day = kst.getUTCDay(); // 0=일 ... 6=토
  return day === 0 ? 6 : day - 1; // 0=월 ... 6=일
}

function getSeenLikes(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_LIKES_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markLikesSeen(ids: string[]) {
  try {
    const seen = getSeenLikes();
    ids.forEach((id) => seen.add(id));
    localStorage.setItem(SEEN_LIKES_KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage 접근 불가하면 그냥 무시 (애니메이션이 다시 뜨는 정도)
  }
}

// 사진 위로 하트가 떠오르며 사라지는 연출. "누가 이거 좋아요 눌렀네" 알아채는 용도
function FloatingHeart({ delay, onDone }: { delay: number; onDone: () => void }) {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setGo(true), 20 + delay);
    const t2 = setTimeout(onDone, 1300 + delay);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span
      className="absolute left-1/2 top-1/2 text-base pointer-events-none text-[#ec4899]"
      style={{
        transform: go ? "translate(-50%, -46px) scale(1.3)" : "translate(-50%, -50%) scale(0.6)",
        opacity: go ? 0 : 1,
        transition: "transform 1.1s ease-out, opacity 1.1s ease-out",
      }}
    >
      ♥
    </span>
  );
}

export function WeekCalendar({ weekStart, people, meId }: { weekStart: string; people: PersonSummary[]; meId: string }) {
  const [selected, setSelected] = useState<CheckinItem | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeOverrides, setLikeOverrides] = useState<Record<string, boolean>>({});
  const [animating, setAnimating] = useState<Set<string>>(new Set());

  function isLiked(c: CheckinItem) {
    return likeOverrides[c.id] ?? c.liked;
  }

  useEffect(() => {
    const seen = getSeenLikes();
    const newlyLiked = people
      .filter((p) => p.userId === meId)
      .flatMap((p) => p.checkins)
      .filter((c) => c.liked && !seen.has(c.id));
    if (newlyLiked.length === 0) return;
    setAnimating(new Set(newlyLiked.map((c) => c.id)));
    markLikesSeen(newlyLiked.map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  async function likeCheckin(checkin: CheckinItem) {
    if (isLiked(checkin)) return;
    setLikeBusy(true);
    try {
      const res = await fetch(`/api/checkins/${checkin.id}/like`, { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();
      setLikeOverrides((prev) => ({ ...prev, [checkin.id]: data.liked }));
    } finally {
      setLikeBusy(false);
    }
  }

  const start = new Date(new Date(weekStart).getTime() + KST_OFFSET_MS);
  const dayDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    return d.getUTCDate();
  });

  return (
    <div className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4">
      <div className="grid grid-cols-8 gap-1 text-center text-xs text-[#d9a9c4] mb-2">
        <div />
        {DAY_LABELS.map((label, i) => (
          <div key={label}>
            {label}
            <div className="text-[10px]">{dayDates[i]}</div>
          </div>
        ))}
      </div>

      {people.map((p) => {
        const byDay: (CheckinItem | undefined)[] = Array(7).fill(undefined);
        for (const c of p.checkins) {
          const idx = kstDayIndex(c.createdAt);
          if (!byDay[idx]) byDay[idx] = c;
        }
        return (
          <div key={p.userId} className="grid grid-cols-8 gap-1 items-center mb-1">
            <div className="text-xs text-[#b4779b] truncate font-semibold">{p.name}</div>
            {byDay.map((c, i) => (
              <button
                key={i}
                onClick={() => c && setSelected(c)}
                className={`relative aspect-square rounded-md flex items-center justify-center text-[10px] overflow-hidden ${
                  c ? "bg-[#ff8fc0]" : "bg-[#ffe1ee] text-[#c2679c]"
                }`}
              >
                {c ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.photoUrl} alt="" className="w-full h-full object-cover" />
                    {isLiked(c) && (
                      <span className="absolute top-0 right-0 text-[10px] leading-none bg-white/90 rounded-bl px-0.5 text-[#ec4899]">
                        ♥
                      </span>
                    )}
                    {animating.has(c.id) && (
                      <FloatingHeart
                        delay={0}
                        onDone={() =>
                          setAnimating((prev) => {
                            const next = new Set(prev);
                            next.delete(c.id);
                            return next;
                          })
                        }
                      />
                    )}
                  </>
                ) : (
                  "-"
                )}
              </button>
            ))}
          </div>
        );
      })}

      {selected && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6"
          onClick={() => setSelected(null)}
        >
          <div className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.photoUrl} alt="인증샷" className="w-full rounded-xl" />
            <p className="text-center text-white text-sm mt-2">
              {new Date(selected.createdAt).toLocaleString("ko-KR")} 촬영
            </p>
            {selected.userId !== meId && (
              <button
                disabled={likeBusy || isLiked(selected)}
                onClick={() => likeCheckin(selected)}
                className={`mt-3 w-full rounded-xl py-2.5 text-sm font-bold ${
                  isLiked(selected) ? "bg-white text-[#ec4899]" : "bg-[#ec4899] text-white"
                } disabled:opacity-100`}
              >
                {isLiked(selected) ? "♥ 좋아요 눌렀어요" : "♡ 좋아요 누르기"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
