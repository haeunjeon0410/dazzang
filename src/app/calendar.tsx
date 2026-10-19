"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { REACTION_CHOICES, lastEmojiIn, reactionOf } from "@/lib/reactions";

type CheckinItem = { id: string; photoUrl: string; createdAt: string; userId: string; liked: boolean; reaction?: string | null };
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

// 오늘이 이번 주 몇 번째 칸인지 (0=월 ... 6=일). 표에서 오늘 열을 강조하는 데 쓴다
export function todayDayIndex(): number {
  return kstDayIndex(new Date().toISOString());
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

// 사진 위로 이모티콘이 떠오르며 사라지는 연출. "누가 이거에 반응을 남겼네" 알아채는 용도
function FloatingReaction({ emoji, delay, onDone }: { emoji: string; delay: number; onDone: () => void }) {
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
      className="absolute left-1/2 top-1/2 text-base pointer-events-none"
      style={{
        transform: go ? "translate(-50%, -46px) scale(1.3)" : "translate(-50%, -50%) scale(0.6)",
        opacity: go ? 0 : 1,
        transition: "transform 1.1s ease-out, opacity 1.1s ease-out",
      }}
    >
      {emoji}
    </span>
  );
}

// 이모티콘을 고른 순간 사진 오른쪽 위에서 같은 이모티콘이 사방으로 팡 터진다 (항상 같은 모양이라 매번 똑같이 터진다)
function ReactionBurst({ emoji }: { emoji: string }) {
  const parts = Array.from({ length: 10 }, (_, i) => {
    const angle = (i / 10) * Math.PI * 2 + (i % 2) * 0.3;
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

export function WeekCalendar({
  people,
  meId,
  header,
  onDeleted,
}: {
  people: PersonSummary[];
  meId: string;
  header?: ReactNode;
  // 내 인증샷을 지운 뒤 주간 기록을 다시 읽게 한다
  onDeleted?: () => void;
}) {
  const [selected, setSelected] = useState<CheckinItem | null>(null);
  const [reactBusy, setReactBusy] = useState(false);
  // 방금 내가 남긴 반응 (서버 응답을 기다렸다가 주간 기록을 다시 읽기 전에도 바로 보이게)
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, string>>({});
  const [trayOpen, setTrayOpen] = useState(false);
  const [burst, setBurst] = useState<{ id: string; emoji: string } | null>(null);
  const [animating, setAnimating] = useState<Set<string>>(new Set());

  function reactionFor(c: CheckinItem): string | null {
    return reactionOverrides[c.id] ?? reactionOf(c);
  }

  useEffect(() => {
    const seen = getSeenLikes();
    const newlyReacted = people
      .filter((p) => p.userId === meId)
      .flatMap((p) => p.checkins)
      .filter((c) => reactionOf(c) && !seen.has(c.id));
    if (newlyReacted.length === 0) return;
    setAnimating(new Set(newlyReacted.map((c) => c.id)));
    markLikesSeen(newlyReacted.map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people]);

  async function react(checkin: CheckinItem, emoji: string) {
    if (reactionFor(checkin)) return;
    setReactBusy(true);
    try {
      const res = await fetch(`/api/checkins/${checkin.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const chosen: string = data.reaction ?? emoji;
      setReactionOverrides((prev) => ({ ...prev, [checkin.id]: chosen }));
      setTrayOpen(false);
      // 내가 고른 이모티콘이 팡 터진다
      setBurst({ id: checkin.id, emoji: chosen });
      setTimeout(() => setBurst((b) => (b && b.id === checkin.id ? null : b)), 1000);
    } finally {
      setReactBusy(false);
    }
  }

  async function deleteCheckin(checkin: CheckinItem) {
    if (!confirm("이 인증샷을 지울까요?")) return;
    const res = await fetch(`/api/checkins/${checkin.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json().catch(() => null))?.error || "지우지 못했어요");
      return;
    }
    setSelected(null);
    onDeleted?.();
  }

  function closePopup() {
    setSelected(null);
    setTrayOpen(false);
  }

  const todayIdx = todayDayIndex();
  const selectedReaction = selected ? reactionFor(selected) : null;

  return (
    <div className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4">
      {header}
      <div className="grid grid-cols-8 gap-1 text-center text-xs text-[#b4779b] mb-2">
        <div />
        {DAY_LABELS.map((label, i) => (
          <div key={label} className={i === todayIdx ? "font-black text-[#de73a5]" : ""}>
            {label}
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
                    <img src={`${c.photoUrl}?w=240`} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    {reactionFor(c) && (
                      <span className="absolute top-0 right-0 text-[10px] leading-none bg-white/90 rounded-bl px-0.5">{reactionFor(c)}</span>
                    )}
                    {animating.has(c.id) && (
                      <FloatingReaction
                        emoji={reactionFor(c) ?? "❤️"}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closePopup}>
          <div className="w-full max-w-[19rem] rounded-3xl bg-white p-4 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            {/* 터지는 이모티콘이 사진 밖으로도 날아가도록 사진 바깥 틀은 자르지 않는다 */}
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.photoUrl} alt="인증샷" className="aspect-square w-full rounded-2xl border border-[#ffd6e8] object-cover" />
              {selected.userId === meId && (
                // 식단 사진과 같은, 눈에 띄지 않게 구석에 둔 반투명 지우기 버튼 (오른쪽 위는 친구가 남긴 반응 자리라 왼쪽 위에 둔다)
                <button
                  onClick={() => deleteCheckin(selected)}
                  aria-label="인증샷 지우기"
                  className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-xs text-white/80"
                >
                  ✕
                </button>
              )}

              {/* 오른쪽 위: 반응이 있으면 그 이모티콘, 없으면 친구 사진에서만 이모티콘을 고르는 버튼 */}
              {selectedReaction ? (
                <span
                  key={selectedReaction}
                  className="reaction-pop absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-xl shadow"
                  aria-label={`${selectedReaction} 반응`}
                >
                  {selectedReaction}
                </span>
              ) : selected.userId !== meId ? (
                trayOpen ? (
                  <div className="absolute right-2 top-2 w-60 rounded-2xl bg-white/95 p-2 shadow-lg" role="menu">
                    {/* 이모티콘을 눌러 고르거나, 아래 칸에서 폰의 이모티콘 키보드로 아무거나 고른다. 고르는 순간 팡 터진다 */}
                    <div className="grid max-h-40 grid-cols-6 gap-0.5 overflow-y-auto overscroll-contain">
                      {REACTION_CHOICES.map((e) => (
                        <button
                          key={e}
                          disabled={reactBusy}
                          onClick={() => react(selected, e)}
                          aria-label={`${e} 반응 남기기`}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-110 active:scale-125 disabled:opacity-60"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                    <input
                      value=""
                      onChange={(e) => {
                        const picked = lastEmojiIn(e.target.value);
                        if (picked) react(selected, picked);
                      }}
                      placeholder="다른 이모티콘 직접 입력"
                      aria-label="이모티콘 직접 입력"
                      className="mt-1.5 w-full rounded-full border border-[#ffd6e8] bg-[#fff0f6] px-3 py-1.5 text-center text-sm text-[#4a2540] placeholder:text-[#c2679c]"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setTrayOpen(true)}
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
              {burst && burst.id === selected.id && <ReactionBurst emoji={burst.emoji} />}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#c2679c]">
                {new Date(selected.createdAt).toLocaleString("ko-KR", {
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
