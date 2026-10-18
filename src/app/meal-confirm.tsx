"use client";

import { useState } from "react";

export type ConfirmItem = { name: string; kcal: number; fraction: number };

export type ConfirmValues = {
  title: string;
  items: ConfirmItem[];
};

const FRACTIONS: [number, string][] = [
  [0.25, "1/4"],
  [0.5, "절반"],
  [0.75, "3/4"],
  [1, "다 먹음"],
];

// 식단을 올리기 전(또는 단축어로 올라온 초안을 확인할 때)에 AI가 읽은 내용을 보여주고, 맞는지 보고 고치는 창.
// 저장을 누르기 전에는 아무것도 올라가지 않는다.
export function MealConfirm({
  photoUrl,
  initial,
  aiRead,
  busy,
  onSave,
  onCancel,
}: {
  photoUrl: string;
  initial: ConfirmValues;
  // AI가 사진을 읽어서 채운 값인지 (false면 직접 적어야 한다)
  aiRead: boolean;
  busy?: boolean;
  onSave: (values: ConfirmValues) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [items, setItems] = useState(initial.items);
  // 먹은 양을 고르는 중인 음식 (그 음식 위에 토글이 펼쳐진다)
  const [pickIdx, setPickIdx] = useState<number | null>(null);

  const total = items.reduce((s, i) => s + (Number.isFinite(i.kcal) ? i.kcal : 0), 0);
  const eaten = items.reduce((s, i) => s + Math.round((Number.isFinite(i.kcal) ? i.kcal : 0) * i.fraction), 0);
  const canSave = title.trim().length > 0 && !busy;
  const label = (f: number) => FRACTIONS.find(([v]) => v === f)?.[1] ?? `${Math.round(f * 100)}%`;

  function setItem(idx: number, patch: Partial<ConfirmItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="max-h-[90vh] w-full max-w-[22rem] space-y-3 overflow-y-auto rounded-3xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="h-16 w-16 flex-none rounded-2xl border border-[#ffd6e8] object-cover" />
          <div className="min-w-0">
            <p className="text-base font-black text-[#4a2540]">식단 확인</p>
            <p className="text-xs text-[#b4779b]">
              {aiRead ? "AI가 이렇게 읽었어요. 틀린 곳은 고쳐 주세요" : "AI가 읽지 못했어요. 직접 적어 주세요"}
            </p>
          </div>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="음식 이름 (예: 제육덮밥)"
          maxLength={40}
          className="w-full rounded-xl border border-[#ffd6e8] bg-[#fff0f6] px-3 py-2 text-sm font-semibold text-[#4a2540]"
        />

        <div className="space-y-1.5">
          <p className="text-xs font-bold text-[#c2679c]">들어간 음식 · 눌러서 먹은 양 고르기</p>
          {items.map((it, idx) => (
            <div key={idx} className="space-y-1">
              {pickIdx === idx && (
                <div className="grid grid-cols-4 gap-1">
                  {FRACTIONS.map(([f, text]) => (
                    <button
                      key={f}
                      onClick={() => {
                        setItem(idx, { fraction: f });
                        setPickIdx(null);
                      }}
                      className={`rounded-full py-1 text-[11px] font-bold ${
                        it.fraction === f ? "bg-[#de73a5] text-white" : "bg-[#ffe1ee] text-[#b4356f]"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  value={it.name}
                  onChange={(e) => setItem(idx, { name: e.target.value })}
                  placeholder="음식"
                  maxLength={30}
                  className="min-w-0 flex-1 rounded-lg border border-[#ffd6e8] px-2.5 py-1.5 text-sm text-[#4a2540]"
                />
                <input
                  value={it.kcal || ""}
                  onChange={(e) => setItem(idx, { kcal: Math.min(5000, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                  inputMode="numeric"
                  placeholder="0"
                  className="w-14 rounded-lg border border-[#ffd6e8] px-2 py-1.5 text-right text-sm text-[#4a2540]"
                />
                <button
                  onClick={() => setPickIdx(pickIdx === idx ? null : idx)}
                  className={`w-[3.4rem] flex-none rounded-full py-1 text-[11px] font-bold ${
                    it.fraction < 1 ? "bg-[#de73a5] text-white" : "bg-[#ffe1ee] text-[#b4356f]"
                  }`}
                >
                  {it.fraction < 1 ? label(it.fraction) : "다 먹음"}
                </button>
                <button
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="이 음식 빼기"
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#ffeef5] text-xs text-[#c2679c]"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {items.length < 8 && (
            <button
              onClick={() => setItems((prev) => [...prev, { name: "", kcal: 0, fraction: 1 }])}
              className="w-full rounded-lg border border-dashed border-[#ffc2dc] py-1.5 text-xs font-semibold text-[#c2679c]"
            >
              + 음식 추가
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-[#fff0f6] px-3 py-2.5 text-center">
          <p className="text-xl font-black text-[#de73a5]">약 {eaten.toLocaleString()} kcal</p>
          {eaten !== total && <p className="text-[11px] text-[#b4779b]">전체 {total.toLocaleString()} kcal 중 먹은 만큼</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-xl bg-[#ffeef5] py-2.5 text-sm font-semibold text-[#c2679c]">
            취소
          </button>
          <button
            onClick={() => canSave && onSave({ title: title.trim(), items: items.filter((i) => i.name.trim()) })}
            disabled={!canSave}
            className="rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
