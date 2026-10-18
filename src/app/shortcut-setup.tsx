"use client";

import { useState, type ReactNode } from "react";

const PILL = "flex-none rounded-full bg-[#ffe1ee] px-3 py-1 text-xs font-bold text-[#b4356f]";

// 도움말 속 "눌러야 하는 글씨"를 분홍 배경으로 눈에 띄게 한다
function B({ children }: { children: ReactNode }) {
  return <span className="rounded bg-[#ffe1ee] px-1.5 py-0.5 font-bold text-[#b4356f]">{children}</span>;
}

// "화면에 이렇게 보여요" 그림. 실제 단축어 화면을 흉내 낸 칸들이고, 분홍 테두리가 지금 눌러야 하는 곳이다
function Mock({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-2xl border border-[#e6e6ee] bg-[#f4f4f8] p-3 text-xs">
      <p className="text-[10px] font-bold text-[#a0a0ae]">화면에 이렇게 보여요</p>
      {children}
    </div>
  );
}
function Row({ children, hot }: { children: ReactNode; hot?: boolean }) {
  return (
    <div
      className={`rounded-lg px-2.5 py-1.5 ${
        hot ? "bg-white font-bold text-[#b4356f] ring-2 ring-[#de73a5]" : "bg-white text-[#8a8a96]"
      }`}
    >
      {children}
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
      title: "시작해 볼까요?",
      body: (
        <>
          <p>
            아이폰 <B>단축어</B> 앱으로 &ldquo;사진을 찍으면 이 앱으로 바로 보내는 버튼&rdquo;을 만들어요.
          </p>
          <p>설명을 한 장에 한 가지씩만 따라 하면 돼요. 약 7분 걸려요.</p>
          <p className="rounded-xl bg-[#fff0f6] px-3 py-2 text-xs">
            꼭 순서대로 하세요. 화면이 설명과 다르면 <B>이전</B>으로 돌아가 다시 읽어 보세요.
          </p>
        </>
      ),
    },
    {
      title: "먼저 내 주소 만들기",
      needsToken: true,
      body: (
        <>
          <p>아이폰이 &ldquo;이 사진은 내 거예요&rdquo;라고 알릴 수 있는 나만의 주소를 만들어요. 비밀번호 같은 거라서 남에게 알려 주면 안 돼요.</p>
          {token ? (
            <p className="rounded-xl bg-[#fff0f6] px-3 py-2 font-bold text-[#2f9e44]">✓ 주소가 만들어졌어요. 다음으로 넘어가요</p>
          ) : (
            <button onClick={make} disabled={busy} className="w-full rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "만드는 중..." : "내 주소 만들기"}
            </button>
          )}
        </>
      ),
    },
    {
      title: "단축어 앱 열기",
      body: (
        <>
          <p>
            아이폰 화면에서 <B>단축어</B> 앱을 찾아 열어요. 파랑·보라색 네모 두 개가 겹친 모양이에요.
          </p>
          <p>안 보이면 홈 화면 가운데를 아래로 쓸어내려서 검색 칸에 <B>단축어</B>라고 쓰면 나와요.</p>
        </>
      ),
    },
    {
      title: "새 단축어 시작하기",
      body: (
        <>
          <p>
            단축어 앱 오른쪽 위에 있는 <B>＋</B> 를 눌러요.
          </p>
          <Mock>
            <Row>단축어</Row>
            <div className="flex justify-end">
              <span className="rounded-full bg-white px-3 py-1 font-bold text-[#b4356f] ring-2 ring-[#de73a5]">＋</span>
            </div>
          </Mock>
        </>
      ),
    },
    {
      title: "이름 짓기",
      body: (
        <>
          <p>
            화면 맨 위의 <B>이름 없는 단축어</B> 글씨를 눌러요. <B>이름 변경</B>이 나오면 누르고, <B>식단</B> 이라고 써요.
          </p>
          <Mock>
            <Row hot>새로운 단축어 ▾</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "사진 찍기 넣기 (1/2)",
      body: (
        <>
          <p>
            화면 아래쪽에 있는 <B>동작 검색</B> 칸을 눌러요. 아직 아무 칸도 없는 하얀 화면이에요.
          </p>
          <Mock>
            <Row>(비어 있음)</Row>
            <Row hot>동작 검색</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "사진 찍기 넣기 (2/2)",
      body: (
        <>
          <p>
            검색 칸에 <B>사진 찍기</B> 라고 써요. 아래 나온 결과 중 <B>사진 찍기</B> 를 눌러요.
          </p>
          <p>화면 위쪽에 &ldquo;사진 찍기&rdquo; 칸이 하나 생기면 성공이에요.</p>
          <Mock>
            <Row hot>사진 찍기</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "사진 줄이기 넣기",
      body: (
        <>
          <p>
            사진이 너무 크면 보내는 데 오래 걸리고 보내지지 않을 수도 있어서 작게 줄여요. 검색 칸에 <B>이미지 크기 변경</B> 이라고 쓰고 나온 결과를 눌러요.
          </p>
          <Mock>
            <Row>사진 찍기</Row>
            <Row hot>이미지 크기 변경</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "크기를 1024로 바꾸기",
      body: (
        <>
          <p>
            방금 생긴 칸에서 <B>너비</B> 옆의 파란 글씨(또는 숫자)를 눌러요. 키보드가 나오면 <B>1024</B> 라고 쓰고 완료를 눌러요.
          </p>
          <p>높이는 손대지 않아도 돼요.</p>
          <Mock>
            <Row hot>이미지 크기 변경 · 너비 1024</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "JPEG로 바꾸기",
      body: (
        <>
          <p>
            아이폰 사진은 특별한 형식(HEIC)이라 이 앱이 못 읽어요. 검색 칸에 <B>이미지 변환</B> 이라고 쓰고 나온 결과를 눌러요.
          </p>
          <p>
            생긴 칸 안의 <B>형식</B> 옆 글씨(HEIF 같은 것)를 눌러 <B>JPEG</B> 를 골라요.
          </p>
          <Mock>
            <Row hot>이미지 변환 · JPEG</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "보내기 칸 만들기",
      body: (
        <>
          <p>
            이제 사진을 이 앱으로 보내는 칸이에요. 검색 칸에 <B>URL 콘텐츠 가져오기</B> 라고 쓰고 결과를 눌러요.
          </p>
          <Mock>
            <Row hot>URL 콘텐츠 가져오기</Row>
            <Row>URL ____________</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "주소 붙여 넣기",
      body: (
        <>
          <p>
            먼저 아래 <B>주소 복사하기</B> 를 눌러요. 그다음 단축어 앱으로 돌아가 칸의 <B>URL</B> 자리를 길게 눌러 <B>붙여넣기</B> 해요.
          </p>
          <button onClick={() => token && copy(url, "주소를")} className={`${PILL} w-full py-2`}>
            주소 복사하기
          </button>
        </>
      ),
    },
    {
      title: "보내는 방법 고르기",
      body: (
        <>
          <p>
            그 칸 오른쪽의 <B>⌄</B>(작은 화살표)를 눌러 칸을 펼쳐요. <B>방법</B> 이 보이면 눌러서 <B>POST</B> 를 골라요.
          </p>
          <p>POST는 &ldquo;보낸다&rdquo;는 뜻이에요.</p>
          <Mock>
            <Row>URL https://…</Row>
            <Row hot>방법 POST</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "사진 담기",
      body: (
        <>
          <p>
            펼친 칸 아래 <B>요청 본문</B> 을 눌러 <B>파일</B> 을 골라요. (JSON, 양식, 파일 중 <B>파일</B>이에요)
          </p>
          <p>
            그다음 <B>파일</B> 칸을 누르면 아래에 변수 목록이 떠요. 거기서 <B>변환된 이미지</B> 를 골라요. 글자를 직접 쓰는 게 아니에요.
          </p>
          <Mock>
            <Row hot>요청 본문 ｜ 파일 ｜ [변환된 이미지]</Row>
          </Mock>
        </>
      ),
    },
    {
      title: "결과 보여주고 저장하기",
      body: (
        <>
          <p>
            검색 칸에 <B>결과 보기</B> 를 쓰고 결과를 눌러요. 맨 끝에 &ldquo;결과 보기&rdquo; 칸이 생겨야 해요.
          </p>
          <p>
            마지막으로 화면 오른쪽 위 <B>완료</B> 를 눌러 저장해요. 단축어 만들기는 끝이에요!
          </p>
        </>
      ),
    },
    {
      title: "액션 버튼에 연결하기",
      body: (
        <>
          <p className="font-bold text-[#c2679c]">액션 버튼이 있는 폰 (아이폰 15 Pro 이후)</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              <B>설정</B> 앱 → <B>액션 버튼</B>
            </li>
            <li>
              화면을 옆으로 넘겨 <B>단축어</B> 를 고르고 <B>식단</B> 을 선택해요.
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
          <li>액션 버튼(또는 폰 뒷면 두 번 탭)을 눌러요.</li>
          <li>
            카메라가 켜지면 음식을 찍고 <B>사진 사용</B> 을 눌러요.
          </li>
          <li>잠시 뒤 화면에 &ldquo;OO 약 N kcal로 읽었어요&rdquo; 문구가 뜨면 성공이에요.</li>
          <li>
            이 앱 식단 화면에서 <B>아이폰으로 올린 식단 N건 확인하기</B> 를 눌러 확인하고 저장해요.
          </li>
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

            <div className="pr-24">
              <p className="text-[11px] font-bold text-[#de73a5]">
                {step + 1} / {steps.length}
              </p>
              <p className="text-lg font-black text-[#4a2540]">{cur.title}</p>
            </div>

            {/* 진행 막대 */}
            <div className="h-1 overflow-hidden rounded-full bg-[#ffe1ee]">
              <div className="h-full rounded-full bg-[#de73a5] transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
            </div>

            <div className="min-h-[13rem] flex-1 space-y-3 overflow-y-auto text-sm leading-relaxed text-[#6b4a5e]">{cur.body}</div>

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
