"use client";

import { useState, type ReactNode } from "react";

// 아이폰 액션 버튼 → 단축어 → 사진 찍기 → 서버로 바로 보내기 연결.
// 설정에는 한 줄(연동 버튼)만 두고, 버튼을 누르면 단계별 도움말이 한 장씩 넘어가며 뜬다.
// 단축어에는 쿠키가 없어서 이 앱이 만들어 주는 개인 토큰으로 "누구의 사진인지"를 알린다.
const PILL = "flex-none rounded-full bg-[#ffe1ee] px-3 py-1 text-xs font-bold text-[#b4356f]";

// 도움말 속 "눌러야 하는 글씨"를 분홍 배경으로 눈에 띄게 한다
function B({ children }: { children: ReactNode }) {
  return <span className="rounded bg-[#ffe1ee] px-1.5 py-0.5 font-bold text-[#b4356f]">{children}</span>;
}

export function ShortcutSetup({ token, onChanged }: { token: string | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const url = typeof location === "undefined" ? "" : `${location.origin}/api/external/meal`;

  async function make() {
    if (token && !confirm("새로 만들면 이전 코드는 못 써요. 계속할까요?")) return;
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
      alert(`${what} 복사했어요`);
    } catch {
      alert("복사하지 못했어요");
    }
  }

  const pill = PILL;

  const steps: { title: string; body: ReactNode; needsToken?: boolean }[] = [
    {
      title: "연결 코드 만들기",
      needsToken: true,
      body: (
        <>
          <p>이 코드가 있어야 아이폰이 &ldquo;내 사진&rdquo;이라는 걸 알아요. 먼저 만들어 주세요.</p>
          {token ? (
            <p className="rounded-xl bg-[#fff0f6] px-3 py-2 font-bold text-[#2f9e44]">✓ 코드가 만들어졌어요. 다음으로 넘어가요</p>
          ) : (
            <button onClick={make} disabled={busy} className="w-full rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "만드는 중..." : "연결 코드 만들기"}
            </button>
          )}
        </>
      ),
    },
    {
      title: "새 단축어 만들기",
      body: (
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>
            아이폰에서 <B>단축어</B> 앱을 열어요. (파랑·보라색 네모 겹친 아이콘이에요)
          </li>
          <li>
            오른쪽 위 <B>＋</B>를 눌러요.
          </li>
          <li>
            맨 위 이름 칸을 눌러 <B>식단</B>으로 바꿔요.
          </li>
        </ol>
      ),
    },
    {
      title: "① 사진 찍기 넣기",
      body: (
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>
            아래 <B>동작 검색</B> 칸을 눌러요.
          </li>
          <li>
            <B>사진 찍기</B>라고 입력해요.
          </li>
          <li>나온 결과 중 &ldquo;사진 찍기&rdquo;를 눌러요. 화면 위쪽에 칸이 하나 생겨요.</li>
        </ol>
      ),
    },
    {
      title: "② 사진 가볍게 줄이기",
      body: (
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>
            다시 검색 칸에 <B>이미지 크기 변경</B>을 입력하고 눌러요.
          </li>
          <li>
            생긴 칸에서 <B>너비</B>(또는 크기)를 눌러 <B>1024</B>로 바꿔요. 높이는 그대로 둬요.
          </li>
        </ol>
      ),
    },
    {
      title: "③ JPEG로 바꾸기",
      body: (
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>
            검색 칸에 <B>이미지 변환</B>을 입력하고 눌러요.
          </li>
          <li>
            칸 안의 형식 글씨를 눌러 <B>JPEG</B>로 골라요.
          </li>
        </ol>
      ),
    },
    {
      title: "④ 사진을 글자로 바꾸기",
      body: (
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>
            검색 칸에 <B>Base64로 인코딩</B>을 입력하고 눌러요.
          </li>
          <li>
            칸 안의 <B>줄바꿈</B> 글씨를 눌러 <B>없음</B>으로 골라요. (안 보이면 칸 오른쪽의 <B>⌄</B>를 눌러요)
          </li>
        </ol>
      ),
    },
    {
      title: "⑤ 서버로 보내기 (1/2) 주소",
      body: (
        <>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              검색 칸에 <B>URL 콘텐츠 가져오기</B>를 입력하고 눌러요.
            </li>
            <li>
              칸의 <B>URL</B> 자리에 아래 주소를 붙여 넣어요.
            </li>
            <li>
              칸 오른쪽의 <B>⌄</B>(화살표)를 눌러 펼친 뒤, 방법을 <B>POST</B>로 바꿔요.
            </li>
          </ol>
          <button onClick={() => copy(url, "주소를")} className={`${pill} w-full py-2`}>
            주소 복사하기
          </button>
        </>
      ),
    },
    {
      title: "⑤ 서버로 보내기 (2/2) 내용",
      body: (
        <>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              펼친 칸에서 <B>헤더 추가</B>를 두 번 눌러요.
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>
                  첫째: 키 <B>Authorization</B>, 값은 아래 연결 코드를 붙여 넣기
                </li>
                <li>
                  둘째: 키 <B>Content-Type</B>, 값 <B>application/json</B>
                </li>
              </ul>
            </li>
            <li>
              <B>요청 본문</B>을 <B>JSON</B>으로 두고 <B>새 필드 추가</B> → <B>텍스트</B>를 두 번 눌러요.
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>
                  첫째: 키 <B>imageBase64</B>, 값은 글자 대신 위 ④번 결과(<B>Base64 인코딩됨</B>)를 골라요
                </li>
                <li>
                  둘째: 키 <B>mimeType</B>, 값 <B>image/jpeg</B>
                </li>
              </ul>
            </li>
          </ol>
          <button onClick={() => token && copy(`Bearer ${token}`, "연결 코드를")} className={`${pill} w-full py-2`}>
            연결 코드 복사하기
          </button>
        </>
      ),
    },
    {
      title: "⑥ 결과 알림 띄우기",
      body: (
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>
            검색 칸에 <B>사전에서 값 가져오기</B>를 입력하고 눌러요. 키 자리에 <B>message</B>를 적어요.
          </li>
          <li>
            검색 칸에 <B>결과 보기</B>를 입력하고 눌러요.
          </li>
          <li>
            오른쪽 위 <B>완료</B>를 눌러 저장해요.
          </li>
        </ol>
      ),
    },
    {
      title: "액션 버튼에 연결하기",
      body: (
        <>
          <p className="font-bold text-[#c2679c]">액션 버튼이 있는 폰 (15 Pro 이후)</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              <B>설정</B> → <B>액션 버튼</B>
            </li>
            <li>
              화면을 옆으로 넘겨 <B>단축어</B>를 고르고, <B>식단</B>을 선택해요.
            </li>
          </ol>
          <p className="font-bold text-[#c2679c]">액션 버튼이 없는 폰</p>
          <p>
            <B>설정</B> → <B>손쉬운 사용</B> → <B>터치</B> → <B>뒷면 탭</B> → <B>두 번 탭</B> → <B>식단</B>
          </p>
        </>
      ),
    },
    {
      title: "해 보기",
      body: (
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>액션 버튼(또는 뒷면 두 번 탭)을 눌러요.</li>
          <li>
            카메라가 뜨면 음식을 찍고 <B>사진 사용</B>을 눌러요.
          </li>
          <li>잠시 뒤 &ldquo;식단 확인&rdquo; 알림이 오면 성공이에요. 앱 식단 화면에서 확인하고 저장해요.</li>
        </ol>
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
        <button onClick={() => setOpen(true)} className={pill}>
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
              {token && step > 0 && (
                <button onClick={make} disabled={busy} className="text-[11px] text-[#d9a9c4] underline">
                  코드 다시 만들기
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

            <div className="pr-24">
              <p className="text-[11px] font-bold text-[#de73a5]">
                {step + 1} / {steps.length}
              </p>
              <p className="text-lg font-black text-[#4a2540]">{cur.title}</p>
            </div>

            <div className="min-h-[12rem] flex-1 space-y-3 overflow-y-auto text-sm leading-relaxed text-[#6b4a5e]">{cur.body}</div>

            <div className="flex justify-center gap-1.5">
              {steps.map((_, i) => (
                <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? "bg-[#de73a5]" : "bg-[#ffd6e8]"}`} />
              ))}
            </div>

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
