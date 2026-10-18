"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { todayDayIndex } from "./calendar";
import { MealConfirm, type ConfirmValues } from "./meal-confirm";

type Meal = {
  id: string;
  userId: string;
  name: string;
  photoUrl: string;
  analyzed: boolean;
  title: string | null;
  kcal: number | null;
  items: { name: string; kcal: number; fraction?: number }[] | null;
  fraction?: number;
  createdAt: string;
};

type MealsData = {
  people: { id: string; name: string }[];
  week: { userId: string; day: number; kcal: number }[];
  day: number;
  pendingCount?: number;
  meals: Meal[];
};

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

// 하루에 먹은 칼로리가 많을수록 진해지는 칸 색 (히트맵). 2500kcal 이상이면 가장 진하다
// 하루 칼로리를 세 단계 색으로만 나눈다 (적게 / 보통 / 많이). 글자색은 늘 같다
function heatClass(kcal: number): string {
  if (kcal >= 2000) return "bg-[#eba0c0]";
  if (kcal >= 1200) return "bg-[#f6c3d8]";
  return "bg-[#fde3ee]";
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
}

// 식단 보기. 운동 보기와 같은 주간 표 모양에 칸마다 그날 먹은 칼로리가 들어가고,
// 칸을 누르면 운동 인증샷처럼 창이 떠서 그날 식단을 슬라이드로 넘겨 볼 수 있다 (아침, 점심, 저녁 순)
export function MealView({
  meId,
  refreshKey,
  header,
  onSaved,
  onChanged,
}: {
  meId: string;
  refreshKey: number;
  header?: ReactNode;
  // 확인 창에서 저장했을 때 알림 문구를 띄우는 곳 (홈 화면 아래 토스트)
  onSaved?: (text: string) => void;
  // 확인 대기 수가 바뀌었을 때(저장하거나 취소해서 지웠을 때) 홈 화면의 숫자를 다시 읽게 한다
  onChanged?: () => void;
}) {
  const [data, setData] = useState<MealsData | null>(null);
  // 창에 띄울 칸 (누가, 무슨 요일). 사진이 든 목록은 칸을 누를 때만 받아온다
  const [popup, setPopup] = useState<{ userId: string; day: number } | null>(null);
  const [dayMeals, setDayMeals] = useState<Meal[] | null>(null);
  const [slide, setSlide] = useState(0);
  const [reload, setReload] = useState(0);
  // 단축어로 올라와 아직 확인하지 않은 내 식단 (확인 창에 하나씩 띄운다)
  const [draft, setDraft] = useState<Meal | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  // 마우스로 끌어 넘기는 중인지 (터치는 브라우저가 알아서 스와이프를 처리한다)
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/meals?day=none")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => alive && d && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshKey, reload]);

  useEffect(() => {
    if (!popup) return;
    let alive = true;
    fetch(`/api/meals?day=${popup.day}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => alive && d && setDayMeals(d.meals))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [popup, reload]);

  async function openDraft() {
    const res = await fetch("/api/meals?pending=1");
    if (!res.ok) return;
    const d = (await res.json()).drafts as Meal[];
    if (d.length > 0) setDraft(d[0]);
  }

  async function saveDraft(values: ConfirmValues) {
    if (!draft) return;
    setDraftBusy(true);
    try {
      const res = await fetch(`/api/meals/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        alert((await res.json().catch(() => null))?.error || "저장하지 못했어요");
        return;
      }
      const saved = await res.json().catch(() => null);
      setDraft(null);
      setReload((n) => n + 1);
      onSaved?.(`저장했어요 · 약 ${(saved?.kcal ?? 0).toLocaleString()} kcal`);
      onChanged?.();
    } finally {
      setDraftBusy(false);
    }
  }

  // 취소: 아이폰으로 올린 초안은 등록을 그만두는 것이라 사진도 지운다 (안 지우면 "확인 대기 1건"이 계속 남는다)
  async function cancelDraft() {
    const id = draft?.id;
    setDraft(null);
    if (!id) return;
    await fetch(`/api/meals/${id}`, { method: "DELETE" }).catch(() => {});
    setReload((n) => n + 1);
    onChanged?.();
  }

  function openCell(userId: string, day: number) {
    setDayMeals(null);
    setSlide(0);
    setPopup({ userId, day });
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  // 컴퓨터에서는 마우스로 사진을 끌어 넘길 수 있게 한다. 놓으면 가까운 장으로 맞춘다
  function startMouseDrag(e: React.MouseEvent<HTMLDivElement>) {
    const el = trackRef.current;
    if (!el || e.button !== 0) return;
    const startX = e.clientX;
    const startLeft = el.scrollLeft;
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) > 4) {
        moved = true;
        setDragging(true);
      }
      if (moved) el.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDragging(false);
      if (moved) {
        const last = Math.max(0, Math.round(el.scrollWidth / el.clientWidth) - 1);
        goTo(Math.min(last, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function remove(id: string) {
    if (!confirm("이 식단을 지울까요?")) return;
    const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setReload((n) => n + 1);
    // 그날 마지막 식단이었다면 창도 닫는다
    if (shown.length <= 1) setPopup(null);
    else setSlide((n) => Math.min(n, shown.length - 2));
  }

  const todayIdx = todayDayIndex();
  // 먹은 순서(아침 → 저녁)로 넘긴다
  const shown = (dayMeals ?? [])
    .filter((m) => m.userId === popup?.userId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4">
      {header}
      {(data?.pendingCount ?? 0) > 0 && (
        <button
          onClick={openDraft}
          className="mb-3 flex w-full items-center justify-between rounded-xl bg-[#fff0f6] border border-[#ffc2dc] px-3 py-2 text-xs font-bold text-[#b4356f]"
        >
          <span>아이폰으로 올린 식단 {data?.pendingCount}건 확인하기</span>
          <span className="text-base leading-none">›</span>
        </button>
      )}
      <div className="grid grid-cols-8 gap-1 text-center text-xs text-[#b4779b] mb-2">
        <div />
        {DAY_LABELS.map((label, i) => (
          <div key={label} className={i === todayIdx ? "font-black text-[#de73a5]" : ""}>
            {label}
          </div>
        ))}
      </div>

      {(data?.people ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-8 gap-1 items-center mb-1">
          <div className="text-xs text-[#b4779b] truncate font-semibold">{p.id === meId ? "나" : p.name}</div>
          {DAY_LABELS.map((_, i) => {
            const mine = data!.week.filter((w) => w.userId === p.id && w.day === i);
            const kcal = mine.reduce((s, w) => s + w.kcal, 0);
            return (
              <button
                key={i}
                onClick={() => mine.length && openCell(p.id, i)}
                className={`aspect-square rounded-md flex items-center justify-center text-xs leading-tight ${
                  mine.length ? `font-semibold text-[#7a2a50] ${kcal > 0 ? heatClass(kcal) : "bg-[#fde3ee]"}` : "bg-[#fff0f6] text-[#d9a9c4]"
                }`}
              >
                {mine.length ? (kcal > 0 ? kcal.toLocaleString() : `${mine.length}끼`) : "-"}
              </button>
            );
          })}
        </div>
      ))}

      {draft && (
        <MealConfirm
          photoUrl={draft.photoUrl}
          initial={{
            title: draft.title ?? "",
            items:
              draft.items && draft.items.length
                ? draft.items.map((i) => ({ name: i.name, kcal: i.kcal, fraction: i.fraction ?? 1 }))
                : [{ name: "", kcal: 0, fraction: 1 }],
          }}
          aiRead={draft.analyzed}
          busy={draftBusy}
          onSave={saveDraft}
          onCancel={cancelDraft}
        />
      )}

      {popup && (
        // 앱의 다른 창(내 정보, 통산전적)과 같은 흰 카드. 바깥을 누르면 닫힌다
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setPopup(null)}>
          <div
            className="w-full max-w-[19rem] rounded-3xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {dayMeals === null && <p className="py-10 text-center text-sm text-[#b4779b]">불러오는 중...</p>}
            {shown.length > 0 && (
              <>
                <div
                  ref={trackRef}
                  className={`flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                    dragging ? "cursor-grabbing select-none" : "snap-x snap-mandatory"
                  }`}
                  onMouseDown={startMouseDrag}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    setSlide(Math.round(el.scrollLeft / el.clientWidth));
                  }}
                >
                  {shown.map((m, idx) => (
                    <div key={m.id} className="w-full flex-none snap-center space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-[#c2679c]">
                          {m.userId === meId ? "나" : m.name} · {timeLabel(m.createdAt)}
                        </p>
                        <p className="truncate text-lg font-black text-[#4a2540]">{m.title ?? "이름 없음"}</p>
                      </div>

                      <div className="relative overflow-hidden rounded-2xl border border-[#ffd6e8]">
                        {m.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photoUrl} alt="식단" draggable={false} className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center bg-[#fff0f6] px-6 text-center text-xs text-[#b4779b]">
                            사진은 30일이 지나 지웠어요
                          </div>
                        )}
                        {m.kcal != null && (
                          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-[#de73a5] px-3 py-1 text-sm font-black text-white shadow-md">
                            약 {m.kcal.toLocaleString()} kcal
                          </span>
                        )}
                        {idx > 0 && (
                          <button
                            onClick={() => goTo(idx - 1)}
                            aria-label="이전 식단"
                            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lg leading-none text-[#de73a5] shadow"
                          >
                            ‹
                          </button>
                        )}
                        {idx < shown.length - 1 && (
                          <button
                            onClick={() => goTo(idx + 1)}
                            aria-label="다음 식단"
                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lg leading-none text-[#de73a5] shadow"
                          >
                            ›
                          </button>
                        )}
                        {m.userId === meId && (
                          // 눈에 띄지 않게 사진 구석에 둔 지우기 버튼
                          <button
                            onClick={() => remove(m.id)}
                            aria-label="식단 지우기"
                            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-xs text-white/80"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {m.items && m.items.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.items.map((i, k) => {
                            // 음식마다 먹은 양이 다르다 (예전 기록은 식단 전체 비율을 따른다)
                            const f = i.fraction ?? m.fraction ?? 1;
                            const word = f === 0.75 ? "3/4" : f === 0.5 ? "절반" : f === 0.25 ? "1/4" : `${Math.round(f * 100)}%`;
                            return (
                              <span key={k} className="rounded-full bg-[#ffe1ee] px-2.5 py-1 text-xs font-semibold text-[#b4356f]">
                                {i.name} {Math.round(i.kcal * f)}
                                {f < 1 ? ` (${word})` : ""}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {shown.length > 1 && (
                  <div className="mt-3 flex justify-center gap-1.5">
                    {shown.map((m, i) => (
                      <span key={m.id} className={`h-1.5 w-1.5 rounded-full ${i === slide ? "bg-[#de73a5]" : "bg-[#ffd6e8]"}`} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
