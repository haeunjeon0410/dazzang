"use client";

import { useState } from "react";
import { CharacterSprite, CharRow, CharPose, CaptionBubble } from "./sprite";
import { countCaption, CAPTION_MAX_LEN } from "@/lib/captions";

const POKED_KEY = "dajjang_poked_on";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 하루는 오전 6시에 바뀐다 (lib/week.ts와 동일)
const DAY_RESET_MS = 6 * 60 * 60 * 1000;

function todayKstDateStr(): string {
  return new Date(Date.now() + KST_OFFSET_MS - DAY_RESET_MS).toISOString().slice(0, 10);
}

export function Battle({
  myCount,
  otherCount,
  myName,
  otherName,
  myFine,
  otherFine,
  myCaption,
  otherCaption,
  onCaptionSaved,
}: {
  myCount: number;
  otherCount: number;
  myName: string;
  otherName: string;
  myFine: number;
  otherFine: number;
  myCaption?: string;
  otherCaption?: string;
  onCaptionSaved?: () => void;
}) {
  const [poked, setPoked] = useState(() => {
    try {
      return localStorage.getItem(POKED_KEY) === todayKstDateStr();
    } catch {
      return false;
    }
  });
  const [pokeConfirmOpen, setPokeConfirmOpen] = useState(false);
  const [poking, setPoking] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [captionInput, setCaptionInput] = useState("");
  const [savingCaption, setSavingCaption] = useState(false);

  function openCaptionEditor() {
    setCaptionInput(myCaption ?? "");
    setCaptionOpen(true);
  }

  async function saveCaption() {
    if (savingCaption) return;
    setSavingCaption(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: captionInput }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "저장에 실패했어요");
        return;
      }
      setCaptionOpen(false);
      onCaptionSaved?.();
    } finally {
      setSavingCaption(false);
    }
  }

  async function sendPoke() {
    setPoking(true);
    try {
      const res = await fetch("/api/poke", { method: "POST" });
      if (!res.ok) return;
      setPoked(true);
      setPokeConfirmOpen(false);
      try {
        localStorage.setItem(POKED_KEY, todayKstDateStr());
      } catch {
        // ignore
      }
    } finally {
      setPoking(false);
    }
  }

  const diff = myCount - otherCount;
  // 차이 1당 12%씩 커지고 작아짐, 0.7~1.5 범위로 제한
  const myScale = Math.min(1.5, Math.max(0.7, 1 + diff * 0.12));
  const otherScale = Math.min(1.5, Math.max(0.7, 1 - diff * 0.12));
  const BASE_HEIGHT = 96;

  return (
    <div className="rounded-3xl bg-white border border-[#ffd6e8] shadow-sm overflow-hidden">
      <div className="bg-gradient-to-b from-[#ffe1ee] to-white px-4 pt-6 pb-2">
        {/* 말풍선은 VS 아이콘 없이 따로 한 줄을 써서 최대한 넓게 (글씨가 커 보이도록) */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={openCaptionEditor} className="min-w-0" aria-label="내 말풍선 멘트 바꾸기">
            <CaptionBubble row={CharRow.A} text={countCaption(myCount, myCaption)} height={64} />
          </button>
          <CaptionBubble row={CharRow.B} text={countCaption(otherCount, otherCaption)} height={64} />
        </div>
        <div className="flex items-end justify-around gap-2 mt-2">
          <div className="flex-1 min-w-0 flex flex-col items-center">
            <div style={{ transform: `scale(${myScale})` }} className="transition-transform duration-500 ease-out">
              <CharacterSprite row={CharRow.A} pose={myCount >= 3 ? CharPose.WIN : CharPose.NEUTRAL} height={BASE_HEIGHT} />
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/nav/battle.webp" alt="VS" className="w-14 h-14 shrink-0 object-contain mb-8" />

          <div className="flex-1 min-w-0 flex flex-col items-center">
            <button
              onClick={() => setPokeConfirmOpen(true)}
              disabled={poked}
              className="transition-transform duration-500 ease-out"
              style={{ transform: `scale(${otherScale})` }}
              aria-label={`${otherName} 격려하기`}
            >
              <CharacterSprite
                row={CharRow.B}
                pose={otherCount >= 3 ? CharPose.WIN : CharPose.NEUTRAL}
                height={BASE_HEIGHT}
              />
            </button>
          </div>
        </div>
        <p className="text-center text-xs text-[#d9a9c4] mt-2 font-medium">
          {diff === 0 ? "팽팽한 접전" : diff > 0 ? `${myName} 우세 (+${diff})` : `${otherName} 우세 (+${-diff})`}
        </p>
      </div>

      <div className="grid grid-cols-2 divide-x divide-[#ffd6e8] border-t border-[#ffd6e8]">
        {[
          { name: myName, count: myCount, fine: myFine },
          { name: otherName, count: otherCount, fine: otherFine },
        ].map((p) => (
          <div key={p.name} className="p-3 text-center">
            <p className="text-xs text-[#b4779b] font-semibold truncate">{p.name}</p>
            <p className={`text-lg font-black ${p.count >= 3 ? "text-[#2f9e44]" : "text-[#4a2540]"}`}>{p.count}/3</p>
            {p.fine > 0 && <p className="text-[11px] text-[#ec4899] font-bold">벌금 {p.fine.toLocaleString()}원</p>}
          </div>
        ))}
      </div>

      {captionOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setCaptionOpen(false)}
        >
          <div
            className="relative w-full max-w-xs bg-white rounded-3xl px-5 pt-16 pb-5 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="absolute inset-x-0 top-4 text-center leading-8 font-bold text-[#4a2540]">말풍선 수정</p>
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setCaptionOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#ffeef5] text-lg font-bold leading-none text-[#c2679c]"
            >
              ×
            </button>
            <input
              autoFocus
              value={captionInput}
              maxLength={CAPTION_MAX_LEN}
              placeholder={`문구를 적어주세요 (최대 ${CAPTION_MAX_LEN}자)`}
              onChange={(e) => setCaptionInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && saveCaption()}
              className="w-full rounded-xl border border-[#ffd6e8] bg-[#ffeef5] px-3 py-3 text-base text-[#4a2540] placeholder:text-[#b4779b] focus:outline-none focus:border-[#c2679c] focus:ring-2 focus:ring-[#ffd6e8]"
            />
            <button
              disabled={savingCaption}
              onClick={saveCaption}
              className="w-full rounded-xl bg-[#ec4899] text-white py-3 text-base font-bold disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {pokeConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setPokeConfirmOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-3xl p-5 space-y-3 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-[#4a2540]">{otherName}님을 격려할까요?</p>
            <button disabled={poking} onClick={sendPoke} className="block mx-auto disabled:opacity-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/nav/encourage-button.webp" alt="격려하기" className="h-16 w-auto" />
            </button>
            <button
              onClick={() => setPokeConfirmOpen(false)}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-2.5 text-sm font-semibold text-[#c2679c]"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
