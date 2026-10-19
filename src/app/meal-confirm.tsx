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

// 마지막 글자에 받침이 있으면 "과", 없으면 "와" (한글이 아니면 "와")
function withParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${hasBatchim ? "과" : "와"}`;
}

// 음식 이름들로 식단 제목을 만든다: 하나면 그 이름, 둘이면 "돈까스와 쌀국수", 셋 이상이면 "돈까스 외 2가지"
export function mealTitleFrom(names: string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  const title =
    list.length === 0 ? "" : list.length === 1 ? list[0] : list.length === 2 ? `${withParticle(list[0])} ${list[1]}` : `${list[0]} 외 ${list.length - 1}가지`;
  return title.slice(0, 40);
}

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
  // 제목을 직접 고쳤으면 그 뒤로는 음식을 바꿔도 제목을 덮어쓰지 않는다
  const [titleTouched, setTitleTouched] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.items.map((i) => ({ ...i, est: i.name.trim(), kcalKnown: i.name.trim() !== "" && i.kcal > 0 })),
  );
  // 먹은 양을 고르는 중인 음식 (그 음식 위에 토글이 펼쳐진다)
  const [pickIdx, setPickIdx] = useState<number | null>(null);
  // 사진을 눌러 크게 볼 때 (음식이 뭐뭐 들어 있는지 보면서 고치기 편하게)
  const [zoom, setZoom] = useState(false);
  const alive = useRef(true);

  // 이름이 바뀌었는데 아직 칼로리를 계산하지 않은 음식
  const stale = (r: Row) => r.name.trim() !== "" && r.name.trim() !== r.est;
  const pending = rows.some(stale);
  // 이름에 어떤 글자가 들어 있어도 구분이 깨지지 않게 JSON 글자로 만든다
  const staleKey = JSON.stringify(rows.map((r) => (stale(r) ? r.name.trim() : "")));

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // 이름 입력이 잠깐 멈추면 바뀐 음식들의 칼로리를 AI에게 다시 물어본다
  useEffect(() => {
    const names = JSON.parse(staleKey) as string[];
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
      setRows((prev) =>
        prev.map((r, idx) => {
          const k = asked.findIndex((x) => x.i === idx && x.n === r.name.trim());
          return k < 0 ? r : { ...r, kcal: kcals ? kcals[k] : 0, est: r.name.trim(), kcalKnown: !!kcals };
        }),
      );
    }, 700);
    return () => clearTimeout(t);
  }, [staleKey]);

  const canSave = title.trim().length > 0 && !pending && !busy;
  const label = (f: number) => FRACTIONS.find(([v]) => v === f)?.[1] ?? `${Math.round(f * 100)}%`;

  // 음식 목록(이름)이 바뀌면 제목도 따라 바뀐다. 예: 버섯국을 쌀국수로 고치면 "돈까스와 버섯국" -> "돈까스와 쌀국수"
  function changeRows(next: Row[]) {
    setRows(next);
    if (titleTouched) return;
    const auto = mealTitleFrom(next.map((r) => r.name));
    if (auto) setTitle(auto);
  }

  function setRow(idx: number, patch: Partial<Row>) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    if ("name" in patch) changeRows(next);
    else setRows(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setZoom(true)} aria-label="사진 크게 보기" className="flex-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="" className="h-16 w-16 rounded-2xl border border-[#ffd6e8] object-cover" />
          </button>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-bold text-[#c2679c]">{aiRead ? "AI가 읽었어요. 틀리면 고쳐 주세요" : "직접 적어 주세요"}</p>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              placeholder="음식 이름"
              maxLength={40}
              className="w-full rounded-xl border border-[#ffd6e8] bg-[#fff0f6] px-3 py-2 text-base font-bold text-[#4a2540]"
            />
          </div>
        </div>

        {/* 사진·이름과 취소/저장은 고정하고, 음식 목록만 스크롤한다 (스크롤바는 숨김) */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex flex-none items-center justify-between">
            <p className="text-sm font-bold text-[#c2679c]">먹은 음식</p>
            {rows.length < 8 && (
              <button
                onClick={() => setRows([...rows, { name: "", kcal: 0, fraction: 1, est: "", kcalKnown: false }])}
                className="rounded-lg border border-dashed border-[#de73a5] bg-white px-3 py-1 text-xs font-bold text-[#de73a5]"
              >
                + 추가
              </button>
            )}
          </div>
          <div className="flex min-h-0 max-h-64 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rows.map((r, idx) => (
            <div key={idx} className="flex-none space-y-1">
              {pickIdx === idx && (
                <div className="grid grid-cols-4 gap-1">
                  {FRACTIONS.map(([f, text]) => (
                    <button
                      key={f}
                      onClick={() => {
                        setRow(idx, { fraction: f });
                        setPickIdx(null);
                      }}
                      className={`rounded-full py-1.5 text-xs font-bold ${
                        r.fraction === f ? "bg-[#de73a5] text-white" : "bg-[#ffe1ee] text-[#b4356f]"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  value={r.name}
                  onChange={(e) => setRow(idx, { name: e.target.value })}
                  placeholder="음식"
                  maxLength={30}
                  className="min-w-0 flex-1 rounded-lg border border-[#ffd6e8] px-3 py-2 text-base text-[#4a2540]"
                />
                <button
                  onClick={() => setPickIdx(pickIdx === idx ? null : idx)}
                  className={`w-[4.2rem] flex-none rounded-full py-2 text-xs font-bold ${
                    r.fraction < 1 ? "bg-[#de73a5] text-white" : "bg-[#ffe1ee] text-[#b4356f]"
                  }`}
                >
                  {r.fraction < 1 ? label(r.fraction) : "다 먹음"}
                </button>
                <button
                  onClick={() => changeRows(rows.filter((_, i) => i !== idx))}
                  aria-label="이 음식 빼기"
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#ffeef5] text-sm text-[#c2679c]"
                >
                  ✕
                </button>
              </div>
              {/* 이름이 틀리면 칼로리가 이상하게 나오니, 계산된 칼로리를 보여줘서 오타를 알아채게 한다 */}
              {r.name.trim() &&
                (stale(r) ? (
                  <p className="px-1 text-[11px] text-[#b4779b]">칼로리 계산 중...</p>
                ) : r.kcalKnown ? (
                  <p className="px-1 text-[11px] text-[#b4779b]">약 {Math.round(r.kcal * r.fraction).toLocaleString()} kcal</p>
                ) : (
                  <p className="px-1 text-[11px] font-semibold text-[#d1465f]">
                    칼로리를 못 구했어요. 이름을 확인해 주세요 (0 kcal로 저장돼요)
                  </p>
                ))}
            </div>
          ))}
          </div>
        </div>

        <div className="grid flex-none grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-xl bg-[#ffeef5] py-3 text-base font-semibold text-[#c2679c]">
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
            className="rounded-xl bg-[#de73a5] py-3 text-base font-bold text-white disabled:opacity-50"
          >
            {busy ? "저장 중..." : pending ? "계산 중..." : "저장"}
          </button>
        </div>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={() => setZoom(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="식단 사진" className="max-h-[88vh] max-w-full rounded-2xl object-contain" />
        </div>
      )}
    </div>
  );
}
