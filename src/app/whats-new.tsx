"use client";

import { useState } from "react";
import { CharacterSprite, CharPose, CharRow } from "./sprite";

// 새 소식 팝업. 업데이트가 있을 때마다 UPDATE_ID를 바꾸면, 앱을 처음 여는 순간 한 번만 보여준다.
// 어느 소식을 이 기기에서 이미 봤는지는 localStorage에 기억한다 (못 쓰면 열 때마다 뜨는 정도)
const UPDATE_ID = "2026-10-20";
const SEEN_KEY = "dajjang_seen_update";

// 방 친구 둘(마스코트 A, B)이 메신저로 수다 떨듯이 소식을 알려준다. 말풍선이 하나씩 떠오른다
type Line = { from: "A" | "B"; text: string; pose?: (typeof CharPose)[keyof typeof CharPose] };

const CHAT: Line[] = [
  { from: "A", text: "이제 식단 인증이 기본 기능이 됐어! 🍱\n사진만 올리면 AI가 칼로리를 계산해 줘", pose: CharPose.WIN },
  { from: "B", text: "올리기 귀찮은데…", pose: CharPose.SAD },
  { from: "A", text: "아이폰이면 설정 → 실험실에서\n동작 버튼을 연동하면 훨씬 간단해! 📸", pose: CharPose.NEUTRAL },
  { from: "B", text: "몸무게도 있다던데?", pose: CharPose.NEUTRAL },
  { from: "A", text: "일주일에 한 번 체중계 사진으로 인증해!\n몸무게는 AI만 확인하고 친구는 ▲▼만 보여", pose: CharPose.WIN },
  { from: "B", text: "안 하면…?", pose: CharPose.PLEAD },
  { from: "A", text: "늘거나 인증을 안 하면 벌금! 💸\n금액은 설정 → 실험실에서 친구랑 정해", pose: CharPose.SAD },
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

// 마스코트 머리 전체(똥머리, 왕관, 턱까지)를 둥근 네모로 잘라 프로필 사진처럼 쓴다.
// 스프라이트 칸(384x512)에서 머리가 여백까지 들어오는 영역을 8가지 표정 그림으로 확인해 정했다: 왼쪽 위 (18, 20)부터 348px 정사각.
// 동그라미로 자르면 양옆 똥머리와 왕관이 잘려서 모서리만 둥글게 하고, 테두리는 칸 안쪽을 줄이지 않게 ring으로 둔다
const AVATAR = 38;
const HEAD_X = 18;
const HEAD_Y = 20;
const HEAD_BOX = 348;
const AVATAR_SCALE = AVATAR / HEAD_BOX;

function Avatar({ who, pose }: { who: "A" | "B"; pose: (typeof CharPose)[keyof typeof CharPose] }) {
  return (
    <div
      className="flex-none overflow-hidden rounded-md bg-[#fff0f6] shadow ring-2 ring-white"
      style={{ width: AVATAR, height: AVATAR }}
    >
      <div style={{ marginLeft: -HEAD_X * AVATAR_SCALE, marginTop: -HEAD_Y * AVATAR_SCALE }}>
        <CharacterSprite row={who === "A" ? CharRow.A : CharRow.B} pose={pose} height={512 * AVATAR_SCALE} />
      </div>
    </div>
  );
}

export function WhatsNew({ ready }: { ready: boolean }) {
  // 로그인 정보가 오기 전(ready=false)에는 아무것도 그리지 않으므로, 서버 렌더와 어긋날 일이 없다
  const [show, setShow] = useState(() => !alreadySeen());
  const visible = ready && show;

  if (!visible) return null;

  function close() {
    markSeen();
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <div className="celebrate-pop flex max-h-[92vh] w-full max-w-[20rem] flex-col overflow-hidden rounded-3xl border-2 border-[#ffc2dc] bg-white shadow-xl">
        {/* 메신저 상단 바 */}
        <div className="flex flex-none items-center justify-between bg-[#ffe1ee] px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex -space-x-0.5">
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
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-[#fff7fb] px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  className={`max-w-[78%] whitespace-pre-line break-keep rounded-2xl px-2.5 py-1.5 text-[12.5px] font-semibold leading-snug text-left ${
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

        <div className="flex-none bg-white px-3 pb-3 pt-2">
          <button onClick={close} className="w-full rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white">
            알겠어요! 💗
          </button>
        </div>
      </div>
    </div>
  );
}
