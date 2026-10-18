"use client";

import { useEffect, useRef, useState } from "react";

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

// 칼로리는 AI가 계산하는 영역이라 사람이 숫자를 적지 않는다.
// 사람은 음식 이름과 먹은 양만 고치고, 이름을 고치거나 새로 넣으면 그 음식의 칼로리를 AI가 다시 계산한다.
type Row = ConfirmItem & { est: string; kcalKnown: boolean };

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
  const [rows, setRows] = useState<Row[]>(() =>
    initial.items.map((i) => ({ ...i, est: i.name.trim(), kcalKnown: i.name.trim() !== "" && i.kcal > 0 })),
  );
  // 먹은 양을 고르는 중인 음식 (그 음식 위에 토글이 펼쳐진다)
  const [pickIdx, setPickIdx] = useState<number | null>(null);
  const [calcFailed, setCalcFailed] = useState(false);
  const alive = useRef(true);

  // 이름이 바뀌었는데 아직 칼로리를 계산하지 않은 음식
  const stale = (r: Row) => r.name.trim() !== "" && r.name.trim() !== r.est;
  const pending = rows.some(stale);
  const staleKey = rows.map((r) => (stale(r) ? r.name.trim() : "")).join("|");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 이름 입력이 잠깐 멈추면 바뀐 음식들의 칼로리를 AI에게 다시 물어본다
  useEffect(() => {
    const names = staleKey.split("|");
    if (!names.some(Boolean)) return;
    const t = setTimeout(async () => {
      const asked = names.map((n, i) => ({ n, i })).filter((x) => x.n);
      let kcals: number[] | null = null;
      try {
        const res = await fetch("/api/meals/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: asked.map((x) => x.n) }),
        });
        if (res.ok) kcals = (await res.json()).kcals;
      } catch {
        kcals = null;
      }
      if (!alive.current) return;
      setCalcFailed(kcals === null);
      setRows((prev) =>
        prev.map((r, idx) => {
          const k = asked.findIndex((x) => x.i === idx && x.n === r.name.trim());
          return k < 0 ? r : { ...r, kcal: kcals ? kcals[k] : 0, est: r.name.trim(), kcalKnown: !!kcals };
        }),
      );
    }, 700);
    return () => clearTimeout(t);
  }, [staleKey]);

  const eaten = rows.reduce((s, r) => s + Math.round((r.kcalKnown ? r.kcal : 0) * r.fraction), 0);
  const canSave = title.trim().length > 0 && !pending && !busy;
  const label = (f: number) => FRACTIONS.find(([v]) => v === f)?.[1] ?? `${Math.round(f * 100)}%`;

  function setRow(idx: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="max-h-[90vh] w-full max-w-[22rem] space-y-3 overflow-y-auto rounded-3xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="h-14 w-14 flex-none rounded-2xl border border-[#ffd6e8] object-cover" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[11px] font-bold text-[#c2679c]">{aiRead ? "AI가 읽었어요. 틀리면 고쳐 주세요" : "직접 적어 주세요"}</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="음식 이름"
              maxLength={40}
              className="w-full rounded-xl border border-[#ffd6e8] bg-[#fff0f6] px-3 py-1.5 text-sm font-bold text-[#4a2540]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          {rows.map((r, idx) => (
            <div key={idx} className="space-y-1">
              {pickIdx === idx && (
                <div className="grid grid-cols-4 gap-1">
                  {FRACTIONS.map(([f, text]) => (
                    <button
                      key={f}
                      onClick={() => {
                        setRow(idx, { fraction: f });
                        setPickIdx(null);
                      }}
                      className={`rounded-full py-1 text-[11px] font-bold ${
                        r.fraction === f ? "bg-[#de73a5] text-white" : "bg-[#ffe1ee] text-[#b4356f]"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <input
                  value={r.name}
                  onChange={(e) => setRow(idx, { name: e.target.value })}
                  placeholder="음식"
                  maxLength={30}
                  className="min-w-0 flex-1 rounded-lg border border-[#ffd6e8] px-2.5 py-1.5 text-sm text-[#4a2540]"
                />
                <button
                  onClick={() => setPickIdx(pickIdx === idx ? null : idx)}
                  className={`w-[3.6rem] flex-none rounded-full py-1.5 text-[11px] font-bold ${
                    r.fraction < 1 ? "bg-[#de73a5] text-white" : "bg-[#ffe1ee] text-[#b4356f]"
                  }`}
                >
                  {r.fraction < 1 ? label(r.fraction) : "다 먹음"}
                </button>
                <button
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="이 음식 빼기"
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#ffeef5] text-xs text-[#c2679c]"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {rows.length < 8 && (
            <button
              onClick={() => setRows((prev) => [...prev, { name: "", kcal: 0, fraction: 1, est: "", kcalKnown: false }])}
              className="w-full rounded-lg border border-dashed border-[#ffc2dc] py-1.5 text-xs font-semibold text-[#c2679c]"
            >
              + 음식 추가
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-[#fff0f6] px-3 py-2.5 text-center">
          <p className="text-xl font-black text-[#de73a5]">{pending ? "계산 중..." : `약 ${eaten.toLocaleString()} kcal`}</p>
          {calcFailed && !pending && <p className="text-[11px] text-[#b4779b]">일부 음식은 칼로리를 계산하지 못했어요</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-xl bg-[#ffeef5] py-2.5 text-sm font-semibold text-[#c2679c]">
            취소
          </button>
          <button
            onClick={() =>
              canSave &&
              onSave({
                title: title.trim(),
                items: rows
                  .filter((r) => r.name.trim())
                  .map((r) => ({ name: r.name.trim(), kcal: r.kcalKnown ? r.kcal : 0, fraction: r.fraction })),
              })
            }
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
