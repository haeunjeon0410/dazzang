"use client";

import { useState } from "react";

type CheckinItem = { id: string; photoUrl: string; createdAt: string };
type PersonSummary = { userId: string; name: string; checkins: CheckinItem[] };

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDayIndex(dateStr: string): number {
  const kst = new Date(new Date(dateStr).getTime() + KST_OFFSET_MS);
  const day = kst.getUTCDay(); // 0=일 ... 6=토
  return day === 0 ? 6 : day - 1; // 0=월 ... 6=일
}

export function WeekCalendar({ weekStart, people }: { weekStart: string; people: PersonSummary[] }) {
  const [selected, setSelected] = useState<CheckinItem | null>(null);

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
                className={`aspect-square rounded-md flex items-center justify-center text-[10px] overflow-hidden ${
                  c ? "bg-[#ff8fc0]" : "bg-[#ffe1ee] text-[#c2679c]"
                }`}
              >
                {c ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.photoUrl} alt="" className="w-full h-full object-cover" />
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
          <div className="max-w-sm w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.photoUrl} alt="인증샷" className="w-full rounded-xl" />
            <p className="text-center text-white text-sm mt-2">
              {new Date(selected.createdAt).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
