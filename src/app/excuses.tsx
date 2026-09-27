"use client";

import { useEffect, useState } from "react";
import { CharacterSprite, CharRow, CharPose } from "./sprite";

type Excuse = {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  user: { name: string };
};

const STATUS_LABEL: Record<Excuse["status"], string> = {
  PENDING: "대기중",
  APPROVED: "허락됨",
  REJECTED: "거절됨",
};

export function ExcusePanel({ onResolved }: { onResolved?: () => void }) {
  const [mine, setMine] = useState<Excuse[]>([]);
  const [incoming, setIncoming] = useState<Excuse[]>([]);
  const [reason, setReason] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/excuses");
    if (!res.ok) return;
    const data = await res.json();
    setMine(data.mine);
    setIncoming(data.incoming);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!reason.trim()) return;
    const res = await fetch("/api/excuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      setReason("");
      setSheetOpen(false);
      await load();
    } else {
      const data = await res.json();
      alert(data.error || "요청 실패");
    }
  }

  async function respond(id: string, approve: boolean) {
    const res = await fetch(`/api/excuses/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    if (res.ok) {
      await load();
      onResolved?.();
    } else {
      const data = await res.json();
      alert(data.error || "처리 실패");
    }
  }

  const pendingIncoming = incoming.filter((e) => e.status === "PENDING");
  const latestMine = mine[0];

  return (
    <div className="space-y-2">
      {pendingIncoming.length > 0 && (
        <div className="rounded-2xl bg-[#ffe1ee] border border-[#ffc72c] p-4 space-y-2">
          <p className="text-sm font-bold text-[#b4356f] flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/nav/excuse.webp" alt="" className="w-6 h-6 object-contain" />
            사정 봐달라기 요청이 왔어요
          </p>
          {pendingIncoming.map((e) => (
            <div key={e.id} className="text-sm space-y-2">
              <p className="text-[#4a2540]">
                <span className="font-bold">{e.user.name}</span>: {e.reason}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => respond(e.id, true)}
                  className="flex-1 rounded-lg bg-[#2f9e44] text-white py-1.5 text-sm font-bold"
                >
                  허락하기
                </button>
                <button
                  onClick={() => respond(e.id, false)}
                  className="flex-1 rounded-lg bg-white border border-[#ffd6e8] py-1.5 text-sm text-[#b4779b]"
                >
                  거절하기
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setSheetOpen(true)}
        className="w-full flex items-center justify-between rounded-2xl bg-white border border-[#ffd6e8] shadow-sm px-4 py-3 text-sm"
      >
        <span className="text-[#c2679c] font-semibold flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/nav/excuse.webp" alt="" className="w-7 h-7 object-contain" />
          사정 봐달라하기
        </span>
        {latestMine ? (
          <span className="text-xs text-[#c2679c]">
            최근 요청: {STATUS_LABEL[latestMine.status]}
          </span>
        ) : (
          <span className="text-[#ec4899] text-lg leading-none">›</span>
        )}
      </button>

      {sheetOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSheetOpen(false)}>
          <div
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3 relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSheetOpen(false)}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#ffeef5] text-[#c2679c] font-bold"
              aria-label="닫기"
            >
              ✕
            </button>
            <div className="flex items-center gap-2">
              <CharacterSprite row={CharRow.A} pose={CharPose.PLEAD} height={76} />
              <p className="font-bold text-[#4a2540]">사정 봐달라고 요청하기</p>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 이번 주 여행 가서 운동 못했어요, 대신 다음 주 4번 할게요"
              className="w-full rounded-xl bg-[#ffeef5] border border-[#ffd6e8] px-3 py-2 text-sm"
              rows={3}
              autoFocus
            />
            <button onClick={submit} className="w-full rounded-xl bg-[#ec4899] py-3 text-sm font-bold text-white">
              친구에게 요청 보내기
            </button>

            {mine.length > 0 && (
              <div className="text-xs text-[#d9a9c4] space-y-1 pt-2 border-t border-[#ffd6e8]">
                {mine.map((e) => (
                  <p key={e.id}>
                    내 요청 &quot;{e.reason}&quot; - {STATUS_LABEL[e.status]}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
