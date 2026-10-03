"use client";

import { useEffect, useState } from "react";
import { CharacterSprite, CharRow, CharPose } from "./sprite";
import { EXCUSE_REPLY_MAX_LEN } from "@/lib/excuse";

type Excuse = {
  id: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reply: string | null;
  createdAt: string;
  user: { name: string };
};

const STATUS_LABEL: Record<Excuse["status"], string> = {
  PENDING: "대기중",
  APPROVED: "허락됨",
  REJECTED: "거절됨",
};

// 요청 결과(허락/거절) 팝업을 이미 봤는지는 이 기기에만 기억해두면 충분하다
const SEEN_KEY = "dajjang_seen_excuse_results";

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    const seen = getSeenIds();
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage 접근 불가하면 그냥 무시 (팝업이 다시 뜨는 정도)
  }
}

export function ExcusePanel({ onResolved }: { onResolved?: () => void }) {
  const [mine, setMine] = useState<Excuse[]>([]);
  const [incoming, setIncoming] = useState<Excuse[]>([]);
  const [reason, setReason] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  // 한 달에 한 번만 쓸 수 있어서, 이번 달에 이미 보냈는지 / 보내기 전 안내 팝업을 띄웠는지
  const [usedThisMonth, setUsedThisMonth] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultPopup, setResultPopup] = useState<Excuse | null>(null);
  // 받은 요청별 답장 입력값 (선택)
  const [replies, setReplies] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/excuses");
    if (!res.ok) return;
    const data = await res.json();
    setMine(data.mine);
    setIncoming(data.incoming);
    setUsedThisMonth(!!data.usedThisMonth);

    const seen = getSeenIds();
    const unseenResult = (data.mine as Excuse[]).find((e) => e.status !== "PENDING" && !seen.has(e.id));
    if (unseenResult) setResultPopup(unseenResult);
  }

  function closeResultPopup() {
    if (resultPopup) markSeen(resultPopup.id);
    setResultPopup(null);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!reason.trim()) return;
    setConfirmOpen(false);
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
      body: JSON.stringify({ approve, reply: replies[id] ?? "" }),
    });
    if (res.ok) {
      setReplies((prev) => ({ ...prev, [id]: "" }));
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
            사정 봐달라하기 요청이 왔어요
          </p>
          {pendingIncoming.map((e) => (
            <div key={e.id} className="text-sm space-y-2">
              <p className="text-[#4a2540]">
                <span className="font-bold">{e.user.name}</span>: {e.reason}
              </p>
              <input
                value={replies[e.id] ?? ""}
                onChange={(ev) => setReplies((prev) => ({ ...prev, [e.id]: ev.target.value }))}
                maxLength={EXCUSE_REPLY_MAX_LEN}
                placeholder="답장 (선택)"
                className="w-full rounded-lg bg-white border border-[#ffd6e8] px-3 py-1.5 text-base text-[#4a2540] placeholder:text-[#d9a9c4] focus:outline-none focus:border-[#c2679c]"
              />
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
            {usedThisMonth ? (
              <p className="rounded-xl bg-[#ffeef5] px-3 py-3 text-sm text-[#b4356f]">
                이번 달엔 이미 사정 봐달라하기를 썼어요
              </p>
            ) : (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 이번 주 여행 가서 운동 못했어요, 대신 다음 주 4번 할게요"
                  className="w-full rounded-xl bg-[#ffeef5] border border-[#ffd6e8] px-3 py-2 text-base"
                  rows={3}
                  autoFocus
                />
                <button
                  onClick={() => reason.trim() && setConfirmOpen(true)}
                  className="w-full rounded-xl bg-[#ec4899] py-3 text-sm font-bold text-white"
                >
                  친구에게 요청 보내기
                </button>
              </>
            )}

            {mine.length > 0 && (
              <div className="text-xs text-[#d9a9c4] space-y-1 pt-2 border-t border-[#ffd6e8]">
                {mine.map((e) => (
                  <p key={e.id}>
                    내 요청 &quot;{e.reason}&quot; - {STATUS_LABEL[e.status]}
                    {e.reply && <> · 답장 &quot;{e.reply}&quot;</>}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmOpen(false)}>
          <div
            className="w-full max-w-xs bg-white rounded-3xl p-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-center font-bold text-[#4a2540]">보내기 전에 확인해주세요</p>
            <ul className="space-y-1.5 rounded-xl bg-[#ffeef5] px-4 py-3 text-sm text-[#4a2540]">
              <li>· 사정 봐달라하기는 <b>한 달에 한 번만</b> 쓸 수 있어요</li>
              <li>· 친구가 받아들이면 <b>이번 주 벌금이 전액 면제</b>돼요</li>
            </ul>
            <button onClick={submit} className="w-full rounded-xl bg-[#ec4899] py-3 text-sm font-bold text-white">
              보낼게요
            </button>
            <button
              onClick={() => setConfirmOpen(false)}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-2.5 text-sm font-semibold text-[#c2679c]"
            >
              다시 생각해볼게요
            </button>
          </div>
        </div>
      )}

      {resultPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={closeResultPopup}>
          <div
            className="w-full max-w-xs bg-white rounded-3xl p-5 space-y-3 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CharacterSprite
              row={CharRow.A}
              pose={resultPopup.status === "APPROVED" ? CharPose.WIN : CharPose.SAD}
              height={76}
              className="mx-auto"
            />
            <p className="font-bold text-[#4a2540]">
              {resultPopup.status === "APPROVED" ? "사정 봐달라하기 요청이 허락됐어요!" : "사정 봐달라하기 요청이 거절됐어요"}
            </p>
            <p className="text-xs text-[#b4779b]">&quot;{resultPopup.reason}&quot;</p>
            {resultPopup.reply && (
              <p className="rounded-xl bg-[#ffeef5] px-3 py-2 text-sm text-[#4a2540]">
                <span className="font-bold text-[#c2679c]">친구 답장</span> {resultPopup.reply}
              </p>
            )}
            <button onClick={closeResultPopup} className="w-full rounded-xl bg-[#ec4899] py-2.5 text-sm font-bold text-white">
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
