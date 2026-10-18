"use client";

import { useEffect, useRef, useState } from "react";
import { CharacterSprite, CharPose, CharRow } from "./sprite";

// 새 소식 팝업. 업데이트가 있을 때마다 UPDATE_ID를 바꾸면, 앱을 처음 여는 순간 한 번만 보여준다.
// 어느 소식을 이 기기에서 이미 봤는지는 localStorage에 기억한다 (못 쓰면 열 때마다 뜨는 정도)
const UPDATE_ID = "2026-10-19";
const SEEN_KEY = "dajjang_seen_update";

// 방 친구 둘(마스코트 A, B)이 메신저로 수다 떨듯이 소식을 알려준다. 말풍선이 하나씩 떠오른다
type Line = { from: "A" | "B"; text: string; pose?: (typeof CharPose)[keyof typeof CharPose] };

const CHAT: Line[] = [
  { from: "A", text: "설정 → 실험실에 AI 식단 기능이 생겼어! 🧪\n사진만 올리면 칼로리를 계산해 줘", pose: CharPose.WIN },
  { from: "B", text: "올리기 귀찮은데…", pose: CharPose.SAD },
  { from: "A", text: "동작 버튼을 연동하면 훨씬 간단하게 등록할 수 있어! 📸", pose: CharPose.NEUTRAL },
  { from: "B", text: "밥 먹을 때 깜빡하면?", pose: CharPose.PLEAD },
  { from: "A", text: "알림 설정도 할 수 있어 🔔\n점심 · 저녁 시간에 콕 알려줘", pose: CharPose.NEUTRAL },
  { from: "B", text: "AI가 틀리게 읽으면 어떡해?", pose: CharPose.PLEAD },
  { from: "A", text: "메뉴랑 먹은 양을 직접 수정할 수 있어! ✏️", pose: CharPose.WIN },
  { from: "B", text: "완전 좋다 💗", pose: CharPose.WIN },
];

// 말풍선이 하나씩 뜨는 간격(ms)
const STEP_MS = 650;

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === UPDATE_ID;
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, UPDATE_ID);
  } catch {
    // localStorage 접근 불가하면 무시 (다음에도 한 번 더 뜨는 정도)
  }
}

// 마스코트 머리 전체(머리카락~턱)를 동그랗게 잘라 프로필 사진처럼 쓴다.
// 스프라이트 칸(384x512)에서 머리는 대략 x 42~342, y 50~350 (300px 정사각)이라, 그 영역이 44px 원에 들어오게 줄여서 맞춘다
const AVATAR = 44;
const HEAD_BOX = 300;
const AVATAR_SCALE = AVATAR / HEAD_BOX;

function Avatar({ who, pose }: { who: "A" | "B"; pose: (typeof CharPose)[keyof typeof CharPose] }) {
  return (
    <div
      className="flex-none overflow-hidden rounded-full border-2 border-white bg-[#fff0f6] shadow"
      style={{ width: AVATAR, height: AVATAR }}
    >
      <div style={{ marginLeft: -42 * AVATAR_SCALE, marginTop: -50 * AVATAR_SCALE }}>
        <CharacterSprite row={who === "A" ? CharRow.A : CharRow.B} pose={pose} height={512 * AVATAR_SCALE} />
      </div>
    </div>
  );
}

export function WhatsNew({ ready }: { ready: boolean }) {
  // 로그인 정보가 오기 전(ready=false)에는 아무것도 그리지 않으므로, 서버 렌더와 어긋날 일이 없다
  const [show, setShow] = useState(() => !alreadySeen());
  const chatRef = useRef<HTMLDivElement>(null);
  const visible = ready && show;

  // 말풍선이 뜰 때마다 대화창을 아래로 내려서, 길어져도 새 말풍선이 잘리지 않게 한다
  useEffect(() => {
    if (!visible) return;
    const timers = CHAT.map((_, i) =>
      setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 300 + i * STEP_MS + 120),
    );
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible) return null;

  function close() {
    markSeen();
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <div className="celebrate-pop flex max-h-[92vh] w-full max-w-[20rem] flex-col overflow-hidden rounded-3xl border-2 border-[#ffc2dc] bg-white shadow-xl">
        {/* 메신저 상단 바 */}
        <div className="flex flex-none items-center justify-between bg-[#ffe1ee] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex -space-x-2">
              <Avatar who="A" pose={CharPose.NEUTRAL} />
              <Avatar who="B" pose={CharPose.NEUTRAL} />
            </span>
            <div className="text-left leading-tight">
              <p className="text-sm font-black text-[#4a2540]">다짱 새 소식</p>
              <p className="text-[11px] font-semibold text-[#b4779b]">
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[#2f9e44] align-middle" />
                방금 업데이트됐어요
              </p>
            </div>
          </div>
          <button
            onClick={close}
            aria-label="닫기"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/80 text-sm text-[#c2679c]"
          >
            ✕
          </button>
        </div>

        {/* 수다: 말풍선이 하나씩 떠오른다 */}
        <div ref={chatRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#fff7fb] px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHAT.map((l, i) => {
            const mine = l.from === "B";
            return (
              <div
                key={i}
                className={`celebrate-pop flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
                style={{ animationDelay: `${300 + i * STEP_MS}ms` }}
              >
                <Avatar who={l.from} pose={l.pose ?? CharPose.NEUTRAL} />
                <p
                  className={`max-w-[75%] whitespace-pre-line break-keep rounded-2xl px-3 py-2 text-left text-[13px] font-semibold leading-snug ${
                    mine
                      ? "rounded-br-sm bg-[#dbe9ff] text-[#2b3d5c]"
                      : "rounded-bl-sm border border-[#ffd6e8] bg-white text-[#4a2540]"
                  }`}
                >
                  {l.text}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex-none bg-white p-3">
          <button onClick={close} className="w-full rounded-xl bg-[#de73a5] py-3 text-sm font-bold text-white">
            알겠어요! 💗
          </button>
        </div>
      </div>
    </div>
  );
}
