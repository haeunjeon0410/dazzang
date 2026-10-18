"use client";

import { useEffect, useState, type ReactNode } from "react";

type Meal = {
  id: string;
  userId: string;
  name: string;
  photoUrl: string;
  analyzed: boolean;
  title: string | null;
  kcal: number | null;
  items: { name: string; kcal: number }[] | null;
  comment: string | null;
  createdAt: string;
};

type MealsData = {
  people: { id: string; name: string }[];
  week: { userId: string; day: number; kcal: number }[];
  day: number;
  meals: Meal[];
};

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
}

// 식단 보기. 운동 보기와 같은 주간 표 모양에 칸마다 그날 먹은 칼로리가 들어가고,
// 칸을 누르면 운동 인증샷처럼 창이 떠서 그날 식단(사진, 칼로리, 한마디)을 보여준다
export function MealView({
  meId,
  weekStart,
  refreshKey,
  corner,
}: {
  meId: string;
  weekStart: string;
  refreshKey: number;
  corner?: ReactNode;
}) {
  const [data, setData] = useState<MealsData | null>(null);
  // 창에 띄울 칸 (누가, 무슨 요일). 사진이 든 목록은 칸을 누를 때만 받아온다
  const [popup, setPopup] = useState<{ userId: string; day: number } | null>(null);
  const [dayMeals, setDayMeals] = useState<Meal[] | null>(null);
  const [reload, setReload] = useState(0);

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

  function openCell(userId: string, day: number) {
    setDayMeals(null);
    setPopup({ userId, day });
  }

  async function remove(id: string) {
    if (!confirm("이 식단을 지울까요?")) return;
    const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setReload((n) => n + 1);
    // 그날 마지막 식단이었다면 창도 닫는다
    if ((dayMeals ?? []).filter((m) => m.userId === popup?.userId).length <= 1) setPopup(null);
  }

  const start = new Date(new Date(weekStart).getTime() + KST_OFFSET_MS);
  const dayDates = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 24 * 60 * 60 * 1000).getUTCDate());
  const shown = (dayMeals ?? []).filter((m) => m.userId === popup?.userId);

  return (
    <div className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4">
      <div className="grid grid-cols-8 gap-1 text-center text-xs text-[#d9a9c4] mb-2">
        <div className="flex items-center">{corner}</div>
        {DAY_LABELS.map((label, i) => (
          <div key={label}>
            {label}
            <div className="text-[10px]">{dayDates[i]}</div>
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
                className={`aspect-square rounded-md flex items-center justify-center text-[10px] leading-tight ${
                  mine.length ? "bg-[#ff8fc0] text-white font-bold" : "bg-[#ffe1ee] text-[#c2679c]"
                }`}
              >
                {mine.length ? (kcal > 0 ? kcal.toLocaleString() : `${mine.length}끼`) : "-"}
              </button>
            );
          })}
        </div>
      ))}

      {popup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6" onClick={() => setPopup(null)}>
          <div className="max-w-sm w-full max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            {dayMeals === null && <p className="text-center text-sm text-white">불러오는 중...</p>}
            {shown.map((m) => (
              <div key={m.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.photoUrl} alt="식단" className="w-full rounded-xl" />
                <div className="mt-2 rounded-xl bg-white p-3 space-y-1">
                  <p className="text-[11px] text-[#d9a9c4]">
                    {m.userId === meId ? "나" : m.name} · {timeLabel(m.createdAt)}
                  </p>
                  <p className="text-sm font-bold text-[#4a2540]">{m.analyzed ? m.title : "분석하지 못했어요"}</p>
                  {m.analyzed && m.kcal != null && (
                    <p className="text-sm font-black text-[#ec4899]">약 {m.kcal.toLocaleString()} kcal</p>
                  )}
                  {m.items && m.items.length > 0 && (
                    <ul className="text-xs text-[#b4779b]">
                      {m.items.map((i, idx) => (
                        <li key={idx}>
                          {i.name} · {i.kcal} kcal
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.comment && <p className="text-xs text-[#b4779b]">&ldquo;{m.comment}&rdquo;</p>}
                  {m.userId === meId && (
                    <button onClick={() => remove(m.id)} className="text-[11px] text-[#d9a9c4] underline">
                      지우기
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
