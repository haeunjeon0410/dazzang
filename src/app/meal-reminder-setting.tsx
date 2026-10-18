"use client";

import { useState } from "react";
import { subscribeToPush } from "./push-setup";

// 설정의 식사 알림: 켜고 끄기, 점심/저녁 시간 정하기. 켤 때 이 기기의 알림 권한도 같이 받는다
export function MealReminderSetting({
  enabled,
  lunch,
  dinner,
  onChanged,
}: {
  enabled: boolean;
  lunch: string;
  dinner: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function save(body: { mealReminder?: boolean; lunchTime?: string; dinnerTime?: string }) {
    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) alert("저장하지 못했어요");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(next: boolean) {
    if (next) {
      // 알림을 받으려면 이 기기가 푸시를 구독해야 한다
      const r = await subscribeToPush();
      if (!r.ok) {
        alert(r.reason || "알림을 켜지 못했어요");
        return;
      }
    }
    await save({ mealReminder: next });
  }

  const time = "rounded-lg border border-[#ffd6e8] bg-white px-2 py-1 text-sm text-[#4a2540] disabled:opacity-50";

  return (
    <div className="space-y-2 border-t border-[#ffd6e8] pt-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[#4a2540]">식사 알림</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          className="h-6 w-6 flex-none accent-[#de73a5]"
        />
      </label>
      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between gap-2 text-xs text-[#b4779b]">
            점심
            <input type="time" value={lunch} disabled={busy} onChange={(e) => e.target.value && save({ lunchTime: e.target.value })} className={time} />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-[#b4779b]">
            저녁
            <input type="time" value={dinner} disabled={busy} onChange={(e) => e.target.value && save({ dinnerTime: e.target.value })} className={time} />
          </label>
        </div>
      )}
    </div>
  );
}
