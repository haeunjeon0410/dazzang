"use client";

import { useEffect, useState } from "react";

// 실험실 몸무게 인증. 기록은 본인에게만 보이고, 친구에게는 늘었는지/줄었는지 방향만 보인다.
// 몸무게는 첫 번째도 포함해서 인증하기 버튼(또는 단축어)으로 올린 체중계 사진으로만 기록한다 (직접 입력 없음).
// 이 창은 그래프를 보여주는 곳이다.

type WeightData = {
  enabled: boolean;
  thisWeekDone: boolean;
  logs: { weekStart: string; kg: number }[]; // 최신순
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

// 지난 기록과 비교한 알약. 좋다/나쁘다는 말하지 않고 숫자 변화만 알려준다
function ChangePill({ logs }: { logs: WeightData["logs"] }) {
  const [now, prev] = logs;
  if (!now) return null;
  if (!prev) return <span className="rounded-full bg-[#fff0f6] px-3 py-1 text-xs font-bold text-[#b4779b]">첫 기록</span>;
  const diff = Math.round((now.kg - prev.kg) * 10) / 10;
  if (diff === 0) return <span className="rounded-full bg-[#fff0f6] px-3 py-1 text-xs font-bold text-[#b4779b]">지난주와 같아요</span>;
  const up = diff > 0;
  return (
    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${up ? "bg-[#ffe1ee] text-[#b4356f]" : "bg-[#e6f6ea] text-[#2f9e44]"}`}>
      {up ? "▲" : "▼"} 지난주보다 {fmt(Math.abs(diff))}kg {up ? "↑" : "↓"}
    </span>
  );
}

// 최근 기록(오래된 것이 왼쪽)을 꺾은선으로. 점마다 kg과 주 시작 날짜
function Chart({ logs }: { logs: WeightData["logs"] }) {
  const pts = [...logs].reverse();
  const W = 300;
  const H = 150;
  const PX = 24;
  const PY = 24;
  const min = Math.min(...pts.map((p) => p.kg)) - 0.5;
  const span = Math.max(...pts.map((p) => p.kg)) + 0.5 - min || 1;
  const xy = pts.map((p, i) => [
    pts.length === 1 ? W / 2 : PX + (i / (pts.length - 1)) * (W - PX * 2),
    PY + (1 - (p.kg - min) / span) * (H - PY * 2),
  ]);
  const label = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="주별 몸무게">
      {pts.length > 1 && (
        <polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="#f6c3d8" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {xy.map(([x, y], i) => (
        <g key={pts[i].weekStart}>
          <circle cx={x} cy={y} r={i === pts.length - 1 ? 5 : 3.5} fill="#de73a5" />
          <text x={x} y={y - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill="#4a2540">{fmt(pts[i].kg)}</text>
          <text x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="#b4779b">{label(pts[i].weekStart)}</text>
        </g>
      ))}
    </svg>
  );
}

// 헤더의 그래프 버튼으로 여는 몸무게 창: 최근 5주 기록과 지난주 대비 변화를 보여준다
export function WeightGraph({ fineAmount, onClose, onRegister }: { fineAmount: number; onClose: () => void; onRegister: () => void }) {
  const [data, setData] = useState<WeightData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/weight")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WeightData | null) => alive && d?.enabled && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;
  const latest = data.logs[0];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 space-y-3 relative shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#ffeef5] text-[#c2679c] font-bold"
          aria-label="닫기"
        >
          ✕
        </button>
        <p className="font-bold text-[#4a2540]">
          몸무게
          {fineAmount > 0 && <span className="ml-1.5 text-[11px] font-semibold text-[#b4779b]">늘거나 안 하면 벌금 {fineAmount.toLocaleString()}원</span>}
        </p>

        {latest ? (
          <>
            <div className="flex items-end justify-between gap-2">
              <p className="text-2xl font-black leading-none text-[#4a2540]">
                {fmt(latest.kg)}
                <span className="ml-1 text-sm font-bold text-[#b4779b]">kg</span>
              </p>
              <ChangePill logs={data.logs} />
            </div>
            <Chart logs={data.logs} />
          </>
        ) : (
          <p className="py-8 text-center text-sm text-[#b4779b]">체중계 사진을 올려 기록해요</p>
        )}

        <button
          onClick={onRegister}
          className="w-full rounded-xl bg-[#f472b6] px-2 py-2.5 text-sm font-bold text-white"
        >
          {data.thisWeekDone ? "몸무게 다시 등록" : "몸무게 등록"}
        </button>
      </div>
    </div>
  );
}
