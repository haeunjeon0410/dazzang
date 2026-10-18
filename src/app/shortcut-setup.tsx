"use client";

import { useState } from "react";

// 아이폰 액션 버튼 → 단축어 → 사진 찍기 → 서버로 바로 보내기 연결.
// 설정에는 한 줄(연동 버튼)만 두고, 주소/코드/만드는 법은 버튼을 누르면 뜨는 창에 모아 둔다.
// 단축어에는 쿠키가 없어서 이 앱이 만들어 주는 개인 토큰으로 "누구의 사진인지"를 알린다.
export function ShortcutSetup({ token, onChanged }: { token: string | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
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

  const copyBtn = "flex-none rounded-full bg-[#ffe1ee] px-3 py-1 text-xs font-bold text-[#b4356f]";

  return (
    <>
      <div className="flex items-center justify-between border-t border-[#ffd6e8] pt-3">
        <p className="text-sm font-semibold text-[#4a2540]">아이폰 액션 버튼</p>
        <button onClick={() => setOpen(true)} className={copyBtn}>
          연동
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            className="relative max-h-[85vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-3xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#ffeef5] font-bold text-[#c2679c]"
              aria-label="닫기"
            >
              ✕
            </button>
            <p className="font-bold text-[#4a2540]">아이폰 액션 버튼 연동</p>

            {!token ? (
              <button onClick={make} disabled={busy} className="w-full rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white disabled:opacity-50">
                {busy ? "만드는 중..." : "연결 코드 만들기"}
              </button>
            ) : (
              <div className="space-y-2 rounded-2xl bg-[#fff0f6] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#b4779b]">주소</span>
                  <button onClick={() => copy(url, "주소를")} className={copyBtn}>
                    복사
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#b4779b]">연결 코드</span>
                  <button onClick={() => copy(`Bearer ${token}`, "코드를")} className={copyBtn}>
                    복사
                  </button>
                </div>
                <button onClick={make} disabled={busy} className="text-[11px] text-[#d9a9c4] underline">
                  코드 다시 만들기
                </button>
              </div>
            )}

            <div className="space-y-1.5 text-xs text-[#6b4a5e]">
              <p className="font-bold text-[#c2679c]">단축어 만드는 법</p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>단축어 앱 → 새 단축어 &ldquo;식단&rdquo;</li>
                <li>사진 찍기 → 이미지 크기 변경(긴 변 1024) → 이미지 변환(JPEG) → Base64로 인코딩(줄바꿈 없음)</li>
                <li>
                  URL 콘텐츠 가져오기: 위 주소, POST
                  <br />
                  헤더 Authorization = 연결 코드, Content-Type = application/json
                  <br />
                  본문 JSON: imageBase64 = Base64 결과, mimeType = image/jpeg
                </li>
                <li>사전에서 값 가져오기(message) → 결과 보기</li>
                <li>설정 → 액션 버튼 → 단축어 → &ldquo;식단&rdquo;</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
