"use client";

import { useEffect, useState } from "react";
import { CharacterSprite, CharRow, CharPose, CaptionBubble } from "./sprite";
import { countCaption, CAPTION_MAX_LEN } from "@/lib/captions";

const POKED_KEY = "dajjang_poked_on";
const RIBBON_SEEN_KEY = "dajjang_seen_ribbon_used";
const RIBBON_EARNED_SEEN_KEY = "dajjang_seen_ribbon_earned";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
// 하루는 오전 6시에 바뀐다 (lib/week.ts와 동일)
const DAY_RESET_MS = 6 * 60 * 60 * 1000;

function todayKstDateStr(): string {
  return new Date(Date.now() + KST_OFFSET_MS - DAY_RESET_MS).toISOString().slice(0, 10);
}

function unseenRibbonIds(ids: string[], key: string = RIBBON_SEEN_KEY): string[] {
  try {
    const seen = new Set<string>(JSON.parse(localStorage.getItem(key) || "[]"));
    return ids.filter((id) => !seen.has(id));
  } catch {
    return [];
  }
}

function markRibbonsSeen(ids: string[], key: string = RIBBON_SEEN_KEY) {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(key, JSON.stringify([...seen, ...ids].slice(-50)));
  } catch {
    // localStorage 접근 불가하면 무시 (연출이 다시 나오는 정도)
  }
}

const MEDAL_MAX = 6;

// 쓴 리본 (면제 내용 자체는 주간 결과 팝업이 안내하고, 여기서는 훈장이 떨어지는 연출에만 쓴다)
type UsedRibbon = { id: string; usedWeek: string; waivedFine: number };

// 캐릭터 옆 빈 공간에 달아두는 작은 리본 훈장. 이미 쓴 리본은 앱을 열었을 때 한 번 떨어진다
function Medals({
  count,
  falling,
  attaching,
  fxOn,
  side,
}: {
  count: number;
  falling: number;
  attaching: number;
  fxOn: boolean; // 주간 결과 팝업을 닫기 전에는 연출을 시작하지 않는다
  side: "left" | "right";
}) {
  if (count <= 0 && falling <= 0) return null;
  const newCount = Math.min(attaching, count);
  const shown = Math.min(count, MEDAL_MAX);
  return (
    <div
      className={`pointer-events-none absolute top-[24%] grid w-9 grid-cols-2 gap-0.5 ${side === "left" ? "left-1" : "right-1"}`}
      role="img"
      aria-label={`리본 ${count}개`}
    >
      {Array.from({ length: shown }, (_, i) => {
        const isNew = i >= count - newCount; // 방금 받은 리본은 맨 뒤에 붙는다
        return (
          <span key={i} className="relative block h-4 w-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/ribbon.webp"
              alt=""
              className={`h-4 w-4 object-contain drop-shadow-sm ${isNew ? (fxOn ? "ribbon-attach" : "opacity-0") : ""}`}
              style={{ rotate: `${i % 2 ? 8 : -8}deg` }}
            />
            {isNew && fxOn && <span className="ribbon-sparkle" aria-hidden>✦</span>}
          </span>
        );
      })}
      {count > MEDAL_MAX && <span className="text-[10px] font-black leading-4 text-[#b4356f]">+{count - MEDAL_MAX}</span>}
      {Array.from({ length: falling }, (_, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`f${i}`}
          src="/assets/ribbon.webp"
          alt=""
          className={`h-4 w-4 object-contain ${fxOn ? "ribbon-fall" : ""}`}
          style={{ ["--dir" as string]: side === "left" ? 1 : -1 }}
        />
      ))}
    </div>
  );
}

// 자는 캐릭터: 천천히 숨 쉬듯 부풀고, 머리 위로 Z가 하나씩 떠올랐다 사라진다
export function SleepingFigure({ src, height, lift }: { src: string; height: number; lift: number }) {
  return (
    <div className="relative" style={{ marginBottom: lift }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="자는 중" style={{ height }} className="sleep-breathe block w-auto" />
      <span className="sleep-z" style={{ animationDelay: "0s" }} aria-hidden>
        z
      </span>
      <span className="sleep-z" style={{ animationDelay: "0.9s" }} aria-hidden>
        z
      </span>
      <span className="sleep-z" style={{ animationDelay: "1.8s" }} aria-hidden>
        Z
      </span>
    </div>
  );
}

export function Battle({
  myCount,
  otherCount,
  myName,
  otherName,
  myFine,
  otherFine,
  myRibbons = 0,
  otherRibbons = 0,
  myUsedRibbons = [],
  otherUsedRibbons = [],
  fxEnabled = true,
  myEarnedRibbonIds = [],
  otherEarnedRibbonIds = [],
  myCaption,
  otherCaption,
  mySleeping,
  otherSleeping,
  onCaptionSaved,
  footer,
}: {
  myCount: number;
  otherCount: number;
  myName: string;
  otherName: string;
  myFine: number;
  otherFine: number;
  // 친구가 혼자 쉬는 동안 목표를 채워 모은 리본 (벌금이 생기면 자동으로 면제에 쓰인다)
  myRibbons?: number;
  otherRibbons?: number;
  // 최근에 쓴 리본 id: 처음 보는 것이면 훈장이 떨어지는 연출
  myUsedRibbons?: UsedRibbon[];
  otherUsedRibbons?: UsedRibbon[];
  // false인 동안(주간 결과 팝업이 떠 있을 때)은 훈장 연출을 보류한다
  fxEnabled?: boolean;
  // 최근에 받은(아직 안 쓴) 리본 id: 처음 보는 것이면 훈장이 붙는 연출과 안내
  myEarnedRibbonIds?: string[];
  otherEarnedRibbonIds?: string[];
  myCaption?: string;
  otherCaption?: string;
  // 혼자 쉬는 중이면 서 있는 캐릭터 대신 자는 모습을 보여준다
  mySleeping?: boolean;
  otherSleeping?: boolean;
  onCaptionSaved?: () => void;
  footer?: React.ReactNode;
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
  // 처음 보는 "리본 사용" 기록: 훈장이 떨어지는 연출과 함께 어떤 벌금을 면제했는지 안내
  const [usedMine] = useState(() => {
    const ids = new Set(unseenRibbonIds(myUsedRibbons.map((r) => r.id)));
    return myUsedRibbons.filter((r) => ids.has(r.id));
  });
  const [usedOther] = useState(() => {
    const ids = new Set(unseenRibbonIds(otherUsedRibbons.map((r) => r.id)));
    return otherUsedRibbons.filter((r) => ids.has(r.id));
  });
  const unseenMine = usedMine.map((r) => r.id);
  const unseenOther = usedOther.map((r) => r.id);
  const [earnedMine] = useState(() => unseenRibbonIds(myEarnedRibbonIds, RIBBON_EARNED_SEEN_KEY));
  const [earnedOther] = useState(() => unseenRibbonIds(otherEarnedRibbonIds, RIBBON_EARNED_SEEN_KEY));
  const [ribbonFxDone, setRibbonFxDone] = useState(false);
  useEffect(() => {
    if (!fxEnabled) return;
    if (unseenMine.length + unseenOther.length + earnedMine.length + earnedOther.length === 0) return;
    const t = setTimeout(() => {
      markRibbonsSeen([...unseenMine, ...unseenOther]);
      markRibbonsSeen([...earnedMine, ...earnedOther], RIBBON_EARNED_SEEN_KEY);
      setRibbonFxDone(true);
    }, 5200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxEnabled, usedMine, usedOther, earnedMine, earnedOther]);

  // 앱을 열었을 때 한 번 보여주는 리본 안내 문구들
  const ribbonToasts = [
    ...(earnedMine.length > 0 ? ["리본을 얻었어요! 쉬는 친구 몫까지 열심히 했네요"] : []),
  ];
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
  // 자는 그림은 여백 없이 잘라둔 이미지라서, 서 있는 캐릭터 스프라이트(위아래 투명 여백 약 11%)와
  // 보이는 머리 끝~발 끝 범위가 같아지도록 키(0.77)와 바닥 띄우기(0.105)를 직접 눈으로 맞춘 값
  const SLEEP_HEIGHT = Math.round(BASE_HEIGHT * 0.77);
  const SLEEP_LIFT = Math.round(BASE_HEIGHT * 0.105);

  return (
    <div className="relative rounded-3xl bg-white border border-[#ffd6e8] shadow-sm overflow-hidden">
      {ribbonToasts.length > 0 && fxEnabled && !ribbonFxDone && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 flex w-[92%] -translate-x-1/2 flex-col items-center gap-1">
          {ribbonToasts.map((text) => (
            <div
              key={text}
              className="ribbon-toast flex max-w-full items-center gap-1.5 rounded-full border border-[#ffc2dc] bg-white/95 px-3 py-1 text-xs font-bold text-[#b4356f] shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/ribbon.webp" alt="" className="h-4 w-4 shrink-0 object-contain" />
              <span className="min-w-0 break-keep leading-tight">{text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="bg-gradient-to-b from-[#ffe1ee] to-white px-4 pt-6 pb-2">
        {/* 말풍선은 VS 아이콘 없이 따로 한 줄을 써서 최대한 넓게 (글씨가 커 보이도록) */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={openCaptionEditor} className="min-w-0" aria-label="내 말풍선 멘트 바꾸기">
            <CaptionBubble row={CharRow.A} text={countCaption(myCount, myCaption)} height={64} />
          </button>
          <CaptionBubble row={CharRow.B} text={countCaption(otherCount, otherCaption)} height={64} />
        </div>
        <div className="flex items-end justify-around gap-2 mt-2">
          <div className="relative flex-1 min-w-0 flex flex-col items-center">
            <Medals
              count={myRibbons}
              falling={ribbonFxDone ? 0 : unseenMine.length}
              attaching={ribbonFxDone ? 0 : earnedMine.length}
              fxOn={fxEnabled}
              side="left"
            />
            <div style={{ transform: `scale(${myScale})` }} className="transition-transform duration-500 ease-out">
              {mySleeping ? (
                <SleepingFigure src="/assets/sleep-a.webp" height={SLEEP_HEIGHT} lift={SLEEP_LIFT} />
              ) : (
                <CharacterSprite row={CharRow.A} pose={myCount >= 3 ? CharPose.WIN : CharPose.NEUTRAL} height={BASE_HEIGHT} />
              )}
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/nav/battle.webp" alt="VS" className="w-14 h-14 shrink-0 object-contain mb-8" />

          <div className="relative flex-1 min-w-0 flex flex-col items-center">
            <Medals
              count={otherRibbons}
              falling={ribbonFxDone ? 0 : unseenOther.length}
              attaching={ribbonFxDone ? 0 : earnedOther.length}
              fxOn={fxEnabled}
              side="right"
            />
            <button
              onClick={() => setPokeConfirmOpen(true)}
              disabled={poked}
              className="transition-transform duration-500 ease-out"
              style={{ transform: `scale(${otherScale})` }}
              aria-label={`${otherName} 격려하기`}
            >
              {otherSleeping ? (
                <SleepingFigure src="/assets/sleep-b.webp" height={SLEEP_HEIGHT} lift={SLEEP_LIFT} />
              ) : (
                <CharacterSprite
                  row={CharRow.B}
                  pose={otherCount >= 3 ? CharPose.WIN : CharPose.NEUTRAL}
                  height={BASE_HEIGHT}
                />
              )}
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
            {p.fine > 0 && <p className="text-[11px] text-[#de73a5] font-bold">벌금 {p.fine.toLocaleString()}원</p>}
          </div>
        ))}
      </div>

      {footer}

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
              className="w-full rounded-xl bg-[#de73a5] text-white py-3 text-base font-bold disabled:opacity-50"
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
