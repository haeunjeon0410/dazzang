"use client";

import { useState } from "react";

// 아이폰 액션 버튼 → 단축어 → 사진 찍기 → 서버로 바로 보내기 연결 안내.
// 단축어에는 쿠키가 없어서 이 앱이 만들어 주는 개인 토큰으로 "누구의 사진인지"를 알린다.
export function ShortcutSetup({ token, onChanged }: { token: string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const url = typeof location === "undefined" ? "" : `${location.origin}/api/external/meal`;

  async function make() {
    if (token && !confirm("새로 만들면 이전 토큰은 더 못 써요. 단축어에서도 바꿔야 해요. 계속할까요?")) return;
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
      alert(`${what}를 복사했어요`);
    } catch {
      alert("복사하지 못했어요");
    }
  }

  const btn = "rounded-full bg-[#ffe1ee] px-3 py-1 text-xs font-bold text-[#b4356f]";

  return (
    <div className="space-y-2 border-t border-[#ffd6e8] pt-3">
      <p className="text-sm font-semibold text-[#4a2540]">아이폰 액션 버튼으로 바로 올리기</p>
      <p className="text-xs text-[#b4779b]">
        단축어를 만들어 액션 버튼에 연결하면, 버튼을 누르고 사진만 찍으면 식단이 올라와요. 올라온 식단은 앱에서 한 번 확인해야 친구에게 보여요.
      </p>

      {!token ? (
        <button onClick={make} disabled={busy} className="w-full rounded-xl bg-[#de73a5] py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "만드는 중..." : "연결 코드 만들기"}
        </button>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-[#c2679c]">단축어에 넣을 주소</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-[11px] text-[#4a2540]">{url}</code>
              <button onClick={() => copy(url, "주소")} className={btn}>
                복사
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-[#c2679c]">연결 코드 (남에게 알려주지 마세요)</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-[11px] text-[#4a2540]">{token}</code>
              <button onClick={() => copy(`Bearer ${token}`, "코드")} className={btn}>
                복사
              </button>
            </div>
          </div>
          <button onClick={make} disabled={busy} className="text-[11px] text-[#d9a9c4] underline">
            코드 다시 만들기
          </button>
        </>
      )}

      <details className="rounded-xl bg-white p-3 text-xs text-[#4a2540]">
        <summary className="cursor-pointer font-bold text-[#c2679c]">단축어 만드는 법</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[#6b4a5e]">
          <li>아이폰의 단축어 앱에서 새 단축어를 만들고 이름을 &ldquo;식단&rdquo;으로 해요.</li>
          <li>동작 추가: <b>사진 찍기</b></li>
          <li>동작 추가: <b>이미지 크기 변경</b> → 긴 변 1024</li>
          <li>동작 추가: <b>이미지 변환</b> → JPEG</li>
          <li>동작 추가: <b>Base64로 인코딩</b> → 줄바꿈 없음</li>
          <li>
            동작 추가: <b>URL 콘텐츠 가져오기</b>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>URL: 위의 주소, 방법: POST</li>
              <li>헤더 Authorization: 복사한 코드 (Bearer로 시작)</li>
              <li>헤더 Content-Type: application/json</li>
              <li>요청 본문 JSON: imageBase64 = 앞 단계 결과, mimeType = 텍스트 image/jpeg</li>
            </ul>
          </li>
          <li>동작 추가: <b>사전에서 값 가져오기</b> → 키 message → <b>결과 보기</b></li>
          <li>설정 → 액션 버튼 → 단축어 → &ldquo;식단&rdquo; 선택 (액션 버튼이 없는 폰은 뒷면 탭이나 잠금화면 버튼에 연결)</li>
        </ol>
      </details>
    </div>
  );
}
