"use client";

import { useState } from "react";
import { CharacterSprite, CharPose, CharRow } from "./sprite";

// 몸무게 인증의 벌금 약속. 한쪽이 금액을 제안하고 상대가 수락해야 정해진다 (합의한 다음 주부터 적용)

export type FineRule = {
  feature: "weight";
  amount: number;
  sinceWeek: string | null;
  proposedAmount: number | null;
  proposedByMe: boolean;
};
export type FineSnapshot = { choices: number[]; rules: FineRule[] };

const RULE = "이번 주 몸무게가 지난 기록보다 늘거나 인증을 안 하면";
const won = (n: number) => `${n.toLocaleString()}원`;

async function post(body: Record<string, unknown>): Promise<FineSnapshot | null> {
  const res = await fetch("/api/room/fines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "weight", ...body }),
  });
  const d = await res.json().catch(() => null);
  if (!res.ok) {
    alert(d?.error || "요청에 실패했어요");
    return null;
  }
  return d;
}

// 설정 → 실험실 → 몸무게 인증 아래에 붙는 벌금 설정.
// 금액을 골라 친구에게 제안하고, 친구가 수락하면 다음 주부터 적용된다.
// 한 번 정해진 금액은 혼자 못 바꾸고, 바꾸려면 다시 제안해서 친구가 수락해야 한다
export function FineSetting({
  data,
  otherName,
  bothOn,
  onChange,
}: {
  data: FineSnapshot | null;
  otherName: string;
  bothOn: boolean;
  onChange: (d: FineSnapshot) => void;
}) {
  const rule = data?.rules.find((r) => r.feature === "weight");
  const [pick, setPick] = useState(0);
  // 정해진 뒤에 "변경 제안"을 눌러 고르는 중인지
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data || !rule) return null;

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const d = await post(body);
      if (d) {
        onChange(d);
        setChanging(false);
        setPick(0);
      }
    } finally {
      setBusy(false);
    }
  }

  const fixed = rule.amount > 0;
  const incoming = rule.proposedAmount !== null && !rule.proposedByMe;
  const outgoing = rule.proposedAmount !== null && rule.proposedByMe;
  const proposalText = (n: number) => (n > 0 ? won(n) : "없음");
  // 정해진 금액은 고를 수 없고, 정해진 뒤에는 "없음"도 고를 수 있다
  const options = data.choices.filter((c) => c !== rule.amount && c > 0);
  const btn = "flex-none rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-40";

  let right;
  if (!bothOn) {
    right = <span className="text-xs text-[#b4779b]">{otherName || "친구"}님 대기</span>;
  } else if (incoming) {
    right = (
      <>
        <span className="text-xs font-bold text-[#4a2540]">{proposalText(rule.proposedAmount!)}</span>
        <button disabled={busy} onClick={() => run({ action: "respond", accept: true })} className={`${btn} bg-[#2f9e44] text-white`}>수락</button>
        <button disabled={busy} onClick={() => run({ action: "respond", accept: false })} className={`${btn} border border-[#ffd6e8] bg-white text-[#b4779b]`}>거절</button>
      </>
    );
  } else if (outgoing) {
    right = (
      <>
        <span className="text-xs text-[#b4779b]">{proposalText(rule.proposedAmount!)} 제안 중</span>
        <button disabled={busy} onClick={() => run({ action: "cancel" })} className="flex-none text-xs text-[#b4779b] underline">취소</button>
      </>
    );
  } else if (fixed && !changing) {
    right = (
      <>
        <span className="text-sm font-bold text-[#de73a5]">{won(rule.amount)}</span>
        <button onClick={() => setChanging(true)} className="flex-none text-xs text-[#b4779b] underline">변경</button>
      </>
    );
  } else {
    right = (
      <>
        <select
          aria-label="벌금 금액"
          value={pick}
          disabled={busy}
          onChange={(e) => setPick(Number(e.target.value))}
          className="rounded-lg border border-[#ffd6e8] bg-white px-2 py-1.5 text-sm text-[#4a2540]"
        >
          <option value={0} disabled={!fixed}>{fixed ? "없음" : "금액"}</option>
          {options.map((c) => (
            <option key={c} value={c}>{won(c)}</option>
          ))}
        </select>
        <button disabled={busy || (!fixed && pick === 0)} onClick={() => run({ action: "propose", amount: pick })} className={`${btn} bg-[#f472b6] text-white`}>
          제안
        </button>
              </>
    );
  }

  return (
    <div className="ml-2 mt-2 flex items-center gap-2 border-l-2 border-[#f6c3d8] pl-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#4a2540]">벌금</span>
        <span className="block text-xs text-[#b4779b]">늘거나 인증을 안 하면 벌금이에요</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5">{right}</span>
      {/* 확정된 벌금이 있으면 체크. 켜고 끄는 건 위의 제안/동의로만 바뀐다 */}
      <input type="checkbox" checked={fixed} readOnly tabIndex={-1} aria-label="벌금 확정" className="pointer-events-none h-6 w-6 flex-none accent-[#de73a5]" />
    </div>
  );
}

// 친구가 보낸 벌금 제안이 있으면 앱을 열 때 간단히 물어보는 팝업
export function FineProposalPopup({
  rule,
  otherName,
  onChange,
}: {
  rule: FineRule;
  otherName: string;
  onChange: (d: FineSnapshot) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function answer(accept: boolean) {
    setBusy(true);
    try {
      const d = await post({ action: "respond", accept });
      if (d) onChange(d);
    } finally {
      setBusy(false);
    }
  }
  const amount = rule.proposedAmount ?? 0;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="celebrate-pop w-full max-w-xs bg-white rounded-3xl p-5 space-y-3 text-center shadow-xl">
        <CharacterSprite row={CharRow.A} pose={CharPose.PLEAD} height={76} className="mx-auto" />
        <p className="font-bold text-[#4a2540]">{otherName}님이 몸무게 벌금을 제안했어요</p>
        <p className="text-3xl font-black text-[#de73a5]">{amount > 0 ? won(amount) : "없음"}</p>
        <p className="text-xs leading-relaxed text-[#b4779b]">
          {RULE} 내는 돈이에요.
          <br />
          수락하면 다음 주부터 적용돼요.
        </p>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => answer(true)} className="flex-1 rounded-xl bg-[#2f9e44] px-2 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            수락
          </button>
          <button disabled={busy} onClick={() => answer(false)} className="flex-1 rounded-xl border border-[#ffd6e8] bg-white px-2 py-2.5 text-sm font-semibold text-[#b4779b] disabled:opacity-50">
            거절
          </button>
        </div>
      </div>
    </div>
  );
}
