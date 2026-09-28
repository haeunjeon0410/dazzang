"use client";

import { CharacterSprite, CharRow, CharPose, CaptionBubble, countCaption } from "./sprite";

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
            <div style={{ transform: `scale(${otherScale})` }} className="transition-transform duration-500 ease-out">
              <CharacterSprite
                row={CharRow.B}
                pose={otherCount >= 3 ? CharPose.WIN : CharPose.NEUTRAL}
                height={BASE_HEIGHT}
              />
            </div>
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
    </div>
  );
}
