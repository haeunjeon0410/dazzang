"use client";

import { useEffect, useState, type ReactNode } from "react";
import { reactionOf } from "@/lib/reactions";
import { ReactionOverlay } from "./reaction-overlay";

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
  // 방금 내가 남긴 반응 (서버 응답을 기다렸다가 주간 기록을 다시 읽기 전에도 바로 보이게)
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, string>>({});
  // 사진을 누른 횟수 (반응 이모티콘을 다시 터뜨리는 데 쓴다)
  const [taps, setTaps] = useState(0);
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

  // 서버에 반응을 남기고, 남겨진 이모티콘을 돌려준다 (실패하면 null). 사진 위 연출은 ReactionOverlay가 한다
  async function react(checkin: CheckinItem, emoji: string): Promise<string | null> {
    if (reactionFor(checkin)) return null;
    const res = await fetch(`/api/checkins/${checkin.id}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const chosen: string = data.reaction ?? emoji;
    setReactionOverrides((prev) => ({ ...prev, [checkin.id]: chosen }));
    return chosen;
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
  }

  const todayIdx = todayDayIndex();
  const selectedReaction = selected ? reactionFor(selected) : null;

  return (
    <div className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-5">
      {header}
      <div className="grid grid-cols-8 gap-1.5 text-center text-xs text-[#b4779b] mb-2">
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
          <div key={p.userId} className="grid grid-cols-8 gap-1.5 items-center mb-1">
            <div className="text-xs text-[#b4779b] truncate font-semibold">{p.name}</div>
            {byDay.map((c, i) => (
              <button
                key={i}
                onClick={() => {
                  if (!c) return;
                  setTaps(0);
                  setSelected(c);
                }}
                className={`relative aspect-square rounded-md flex items-center justify-center text-[10px] overflow-hidden ${
                  c ? "bg-[#ff8fc0]" : "bg-[#ffe1ee] text-[#c2679c]"
                }`}
              >
                {c ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${c.photoUrl}?w=240`} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                    {reactionFor(c) && (
                      <span className="absolute right-0.5 top-0 text-[11px] leading-none [text-shadow:0_0_3px_rgba(0,0,0,0.45)]">{reactionFor(c)}</span>
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
          <div className="w-full max-w-[22rem] rounded-3xl bg-white p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            {/* 터지는 이모티콘이 사진 밖으로도 날아가도록 사진 바깥 틀은 자르지 않는다 */}
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selected.photoUrl} alt="인증샷" onClick={() => setTaps((n) => n + 1)} className="aspect-square w-full rounded-2xl border border-[#ffd6e8] object-cover" />
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
              <ReactionOverlay
                key={selected.id}
                mine={selected.userId === meId}
                reaction={selectedReaction}
                onPick={(emoji) => react(selected, emoji)}
                tap={taps}
              />
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
