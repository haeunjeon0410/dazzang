"use client";

import { useState } from "react";
import { CharacterSprite, CharRow, CharPose, CaptionBubble } from "./sprite";
import { countCaption, CAPTION_MAX_LEN, savedCaption } from "@/lib/captions";

const POKED_KEY = "dajjang_poked_on";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function todayKstDateStr(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function Battle({
  myCount,
  otherCount,
  myName,
  otherName,
  myFine,
  otherFine,
  myCaptions,
  otherCaptions,
  onCaptionsSaved,
}: {
  myCount: number;
  otherCount: number;
  myName: string;
  otherName: string;
  myFine: number;
  otherFine: number;
  myCaptions?: string[];
  otherCaptions?: string[];
  onCaptionsSaved?: () => void;
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
  const [captionForm, setCaptionForm] = useState<string[] | null>(null);
  const [captionInput, setCaptionInput] = useState("");
  const [savingCaptions, setSavingCaptions] = useState(false);

  function openCaptionEditor() {
    setCaptionForm([0, 1, 2, 3].map((i) => myCaptions?.[i] ?? ""));
    setCaptionInput(savedCaption(myCaptions));
  }

  async function saveCaptions() {
    if (captionForm === null) return;
    setSavingCaptions(true);
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
      setCaptionForm(null);
      onCaptionsSaved?.();
    } finally {
      setSavingCaptions(false);
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
        <div className="flex items-end justify-around gap-2">
          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <button onClick={openCaptionEditor} className="w-full min-w-0" aria-label="내 말풍선 멘트 바꾸기">
              <CaptionBubble row={CharRow.A} text={countCaption(myCount, myCaptions)} height={62} />
            </button>
            <div style={{ transform: `scale(${myScale})` }} className="transition-transform duration-500 ease-out">
              <CharacterSprite row={CharRow.A} pose={myCount >= 3 ? CharPose.WIN : CharPose.NEUTRAL} height={BASE_HEIGHT} />
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/nav/battle.webp" alt="VS" className="w-14 h-14 shrink-0 object-contain mb-8" />

          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <CaptionBubble row={CharRow.B} text={countCaption(otherCount, otherCaptions)} height={62} />
            <button
              onClick={() => setPokeConfirmOpen(true)}
              disabled={poked}
              className={`transition-transform duration-500 ease-out ${poked ? "opacity-60" : ""}`}
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

      {captionForm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setCaptionForm(null)}
        >
          <div
            className="relative w-full max-w-xs bg-white rounded-3xl px-5 pt-9 pb-5 space-y-3 shadow-xl [&>p]:hidden [&>button:last-child]:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="닫기"
              onClick={() => setCaptionForm(null)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#ffeef5] text-lg font-bold leading-none text-[#c2679c]"
            >
              ×
            </button>
            <input
              autoFocus
              value={captionInput}
              maxLength={CAPTION_MAX_LEN}
              placeholder="문구를 적어주세요 (최대 15자)"
              onChange={(e) => setCaptionInput(e.target.value)}
              className="w-full rounded-xl border border-[#ffd6e8] bg-[#ffeef5] px-3 py-2.5 text-sm text-[#4a2540] placeholder:text-[#b4779b] focus:outline-none focus:border-[#c2679c] focus:ring-2 focus:ring-[#ffd6e8]"
            />
            <div className="hidden">
              <p className="font-bold text-[#4a2540]">내 말풍선 멘트</p>
              <p className="text-xs text-[#b4779b] mt-1">{otherName}님 화면에도 이 멘트가 떠요. 비워두면 기본 멘트!</p>
            </div>
            <p className="text-[11px] text-[#d9a9c4] text-right">최대 {CAPTION_MAX_LEN}자</p>
            <button
              disabled={savingCaptions}
              onClick={saveCaptions}
              className="block w-24 mx-auto rounded-xl bg-[#ec4899] text-white py-2.5 text-sm font-bold disabled:opacity-50"
            >
              저장
            </button>
            <button
              onClick={() => setCaptionForm(null)}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-2.5 text-sm font-semibold text-[#c2679c]"
            >
              취소
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
