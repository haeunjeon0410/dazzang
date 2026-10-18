"use client";

import { useState, type ReactNode } from "react";

const PILL = "flex-none rounded-full bg-[#ffe1ee] px-3 py-1 text-xs font-bold text-[#b4356f]";

// 도움말 속 "눌러야 하는 글씨"를 분홍색으로 눈에 띄게 한다
function B({ children }: { children: ReactNode }) {
  return <span className="rounded bg-[#ffe1ee] px-1.5 py-0.5 font-bold text-[#b4356f]">{children}</span>;
}

// 번호 붙은 한 줄. 번호는 장이 바뀌어도 이어져서 전체가 하나의 순서처럼 읽힌다
function Line({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#de73a5] text-xs font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// 아이폰 액션 버튼 → 단축어 → 사진 찍기 → 서버로 바로 보내기 연결.
// 설정에는 한 줄(연동 버튼)만 두고, 버튼을 누르면 한 장에 한 동작씩 도움말이 넘어가며 뜬다.
// 단축어에는 쿠키가 없어서 이 앱이 만들어 주는 개인 토큰으로 "누구의 사진인지"를 알린다.
export function ShortcutSetup({ token, onChanged }: { token: string | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  // 연결 코드를 주소 끝에 붙여 두면 헤더를 따로 적을 필요가 없다
  const url = typeof location === "undefined" ? "" : `${location.origin}/api/external/meal${token ? `?t=${token}` : ""}`;

  async function make() {
    if (token && !confirm("새로 만들면 이전 주소는 못 써요. 단축어의 주소도 바꿔야 해요. 계속할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/meal-token", { method: "POST" });
      if (res.ok) onChanged();
      else alert("만들지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${what} 복사했어요. 이제 단축어 앱으로 가서 붙여 넣어요`);
    } catch {
      alert("복사하지 못했어요");
    }
  }

  const steps: { title: string; body: ReactNode; needsToken?: boolean }[] = [
    {
      title: "내 주소 만들기",
      needsToken: true,
      body: token ? (
        <p className="font-bold text-[#2f9e44]">✓ 만들어졌어요. 남에게 알려 주지 마세요</p>
      ) : (
        <button onClick={make} disabled={busy} className="w-full rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "만드는 중..." : "내 주소 만들기"}
        </button>
      ),
    },
    {
      title: "단축어 만들기",
      body: (
        <>
          <Line n={1}>
            <B>단축어</B> 앱 → <B>＋</B> → 이름 <B>식단</B>
          </Line>
          <Line n={2}>
            <B>동작 검색</B> → <B>사진 찍기</B>
          </Line>
          <Line n={3}>
            <B>동작 검색</B> → <B>이미지 크기 변경</B> → 너비 <B>1024</B>
          </Line>
          <Line n={4}>
            <B>동작 검색</B> → <B>이미지 변환</B> → 형식 <B>JPEG</B>
          </Line>
        </>
      ),
    },
    {
      title: "앱으로 보내기",
      body: (
        <>
          <Line n={5}>
            <B>동작 검색</B> → <B>URL 콘텐츠 가져오기</B>
            <ul className="mt-1.5 space-y-1 text-[#8a5a73]">
              <li>
                · URL: 아래 주소 붙여넣기
              </li>
              <li>
                · 칸의 <B>⌄</B> → 메소드 <B>POST</B>
              </li>
              <li>
                · 요청 본문 <B>파일</B> → <B>변환된 이미지</B>
              </li>
            </ul>
          </Line>
          <button onClick={() => token && copy(url, "주소를")} className={`${PILL} w-full py-2.5 text-sm`}>
            주소 복사하기
          </button>
          <Line n={6}>
            <B>동작 검색</B> → <B>콘텐츠 보기</B> → 오른쪽 위 <B>완료</B>
          </Line>
        </>
      ),
    },
    {
      title: "액션 버튼에 연결",
      body: (
        <>
          <Line n={7}>
            <B>설정</B> → <B>액션 버튼</B> → <B>단축어</B> → <B>식단</B>
          </Line>
          <p className="text-xs text-[#b4779b]">버튼이 없는 폰: 설정 → 손쉬운 사용 → 터치 → 뒷면 탭 → 두 번 탭 → 식단</p>
        </>
      ),
    },
    {
      title: "해 보기",
      body: (
        <>
          <Line n={8}>
            액션 버튼 → 음식 찍기 → <B>사진 사용</B>
          </Line>
          <Line n={9}>&ldquo;N kcal로 읽었어요&rdquo;가 뜨면 성공</Line>
          <Line n={10}>
            앱 식단 화면의 <B>확인하기</B> 배너에서 저장
          </Line>
        </>
      ),
    },
  ];

  const last = steps.length - 1;
  const cur = steps[step];
  const canNext = !(cur.needsToken && !token);

  function close() {
    setOpen(false);
    setStep(0);
  }

  return (
    <>
      <div className="flex items-center justify-between border-t border-[#ffd6e8] pt-3">
        <p className="text-sm font-semibold text-[#4a2540]">아이폰 액션 버튼</p>
        <button onClick={() => setOpen(true)} className={PILL}>
          연동
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            className="relative flex max-h-[88vh] w-full max-w-sm flex-col gap-3 rounded-3xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute right-4 top-4 flex items-center gap-2">
              {token && step > 1 && (
                <button onClick={make} disabled={busy} className="text-[11px] text-[#d9a9c4] underline">
                  주소 다시 만들기
                </button>
              )}
              <button
                onClick={close}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffeef5] font-bold text-[#c2679c]"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <div className="pr-20">
              <p className="text-[11px] font-bold text-[#de73a5]">
                {step + 1} / {steps.length}
              </p>
              <p className="text-lg font-black text-[#4a2540]">{cur.title}</p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto text-[15px] leading-relaxed text-[#6b4a5e]">{cur.body}</div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setStep((n) => Math.max(0, n - 1))}
                disabled={step === 0}
                className="rounded-xl bg-[#ffeef5] py-2.5 text-sm font-semibold text-[#c2679c] disabled:opacity-40"
              >
                이전
              </button>
              {step < last ? (
                <button
                  onClick={() => setStep((n) => Math.min(last, n + 1))}
                  disabled={!canNext}
                  className="rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white disabled:opacity-40"
                >
                  다음
                </button>
              ) : (
                <button onClick={close} className="rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white">
                  완료
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
