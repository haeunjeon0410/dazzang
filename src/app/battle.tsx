"use client";

import { useState } from "react";
import { CharacterSprite, CharRow, CharPose, CaptionBubble, countCaption } from "./sprite";

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
}: {
  myCount: number;
  otherCount: number;
  myName: string;
  otherName: string;
  myFine: number;
  otherFine: number;
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
            <CaptionBubble row={CharRow.A} text={countCaption(myCount)} height={62} />
            <div style={{ transform: `scale(${myScale})` }} className="transition-transform duration-500 ease-out">
              <CharacterSprite row={CharRow.A} pose={myCount >= 3 ? CharPose.WIN : CharPose.NEUTRAL} height={BASE_HEIGHT} />
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/nav/battle.webp" alt="VS" className="w-14 h-14 shrink-0 object-contain mb-8" />

          <div className="flex-1 min-w-0 flex flex-col items-center gap-1">
            <CaptionBubble row={CharRow.B} text={countCaption(otherCount)} height={62} />
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

      {pokeConfirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setPokeConfirmOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-3xl p-5 space-y-3 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <CharacterSprite row={CharRow.A} pose={CharPose.PLEAD} height={76} className="mx-auto" />
            <p className="font-bold text-[#4a2540]">{otherName}님을 격려할까요?</p>
            <p className="text-xs text-[#b4779b]">어떤 메시지가 갈지는 비밀이에요</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPokeConfirmOpen(false)}
                className="flex-1 rounded-xl bg-white border border-[#ffd6e8] py-2.5 text-sm font-semibold text-[#c2679c]"
              >
                취소
              </button>
              <button
                disabled={poking}
                onClick={sendPoke}
                className="flex-1 rounded-xl bg-[#ec4899] py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {poking ? "보내는 중..." : "보내기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
