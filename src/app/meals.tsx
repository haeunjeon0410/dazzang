"use client";

import { useEffect, useState } from "react";

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
// 칸을 누르면 같은 카드 안에서 그날 식단이 펼쳐진다 (한 번 더 누르면 접힌다)
export function MealView({ meId, weekStart, refreshKey }: { meId: string; weekStart: string; refreshKey: number }) {
  const [data, setData] = useState<MealsData | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(`/api/meals?day=${open === null ? "none" : open}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => alive && d && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, refreshKey, reload]);

  async function remove(id: string) {
    if (!confirm("이 식단을 지울까요?")) return;
    const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
    if (res.ok) setReload((n) => n + 1);
  }

  const start = new Date(new Date(weekStart).getTime() + KST_OFFSET_MS);
  const dayDates = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 24 * 60 * 60 * 1000).getUTCDate());

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

      {(data?.people ?? []).map((p) => (
        <div key={p.id} className="grid grid-cols-8 gap-1 items-center mb-1">
          <div className="text-xs text-[#b4779b] truncate font-semibold">{p.id === meId ? "나" : p.name}</div>
          {DAY_LABELS.map((_, i) => {
            const mine = data!.week.filter((w) => w.userId === p.id && w.day === i);
            const kcal = mine.reduce((s, w) => s + w.kcal, 0);
            return (
              <button
                key={i}
                onClick={() => setOpen(open === i ? null : i)}
                className={`aspect-square rounded-md flex items-center justify-center text-[10px] leading-tight ${
                  mine.length ? "bg-[#ff8fc0] text-white font-bold" : "bg-[#ffe1ee] text-[#c2679c]"
                } ${open === i ? "ring-2 ring-[#ec4899]" : ""}`}
              >
                {mine.length ? (kcal > 0 ? kcal.toLocaleString() : `${mine.length}끼`) : "-"}
              </button>
            );
          })}
        </div>
      ))}

      {open !== null && data && (
        <div className="mt-3 pt-3 border-t border-[#ffd6e8] space-y-3">
          {data.meals.length === 0 && <p className="text-xs text-[#d9a9c4] text-center">이 날은 올라온 식단이 없어요</p>}
          {data.meals.map((m) => (
            <div key={m.id} className="flex gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.photoUrl} alt="" className="h-16 w-16 flex-none rounded-xl object-cover border border-[#ffd6e8]" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-[11px] text-[#d9a9c4]">
                  {m.userId === meId ? "나" : m.name} · {timeLabel(m.createdAt)}
                </p>
                <p className="truncate text-sm font-bold text-[#4a2540]">{m.analyzed ? m.title : "분석하지 못했어요"}</p>
                {m.analyzed && m.kcal != null && (
                  <button onClick={() => setOpenId(openId === m.id ? null : m.id)} className="text-sm font-black text-[#ec4899]">
                    약 {m.kcal.toLocaleString()} kcal {m.items?.length ? (openId === m.id ? "︿" : "﹀") : ""}
                  </button>
                )}
                {openId === m.id && m.items && (
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
      )}
    </div>
  );
}
