"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Member = { id: string; name: string };

export default function JoinRoom() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [full, setFull] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [nickname, setNickname] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loginPin, setLoginPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/rooms/${params.token}`)
      .then(async (res) => {
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setMembers(data.members);
        setFull(data.full);
      })
      .catch(() => setNotFound(true));
  }, [params.token]);

  async function pick(e: React.FormEvent, userId: string) {
    e.preventDefault();
    if (!/^\d{4}$/.test(loginPin)) {
      setError("4자리 PIN을 입력해주세요");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, pin: loginPin }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "로그인 실패");
        return;
      }
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (!nickname.trim()) return;
    if (!/^\d{4}$/.test(joinPin)) {
      setError("4자리 숫자 PIN을 만들어주세요 (다음에 다시 들어올 때 필요해요)");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/rooms/${params.token}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nickname, pin: joinPin }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "참여 실패");
        return;
      }
      router.push("/");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <p className="text-[#d9a9c4]">존재하지 않는 초대 링크예요.</p>
      </div>
    );
  }

  if (!members) {
    return <div className="flex-1 flex items-center justify-center text-[#d9a9c4]">불러오는 중...</div>;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-4 bg-white/90 backdrop-blur rounded-3xl border border-[#ffd6e8] shadow-lg p-6">
        <h1 className="text-3xl font-black text-center text-[#ec4899] tracking-tight">다짱</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/poster.webp" alt="" className="w-full h-auto" />
        <p className="text-center text-sm text-[#c2679c]">누구인가요?</p>

        {full && <p className="rounded-xl bg-[#ffe1ee] px-3 py-2 text-center text-sm font-semibold text-[#b4356f]">이 방은 이미 2명으로 가득 찼어요.</p>}

        <div className="space-y-2">
          {members.map((m) =>
            selectedMemberId === m.id ? (
              <form
                key={m.id}
                onSubmit={(e) => pick(e, m.id)}
                className="rounded-xl border-2 border-[#ec4899] p-3 space-y-2"
              >
                <p className="text-center text-sm font-bold text-[#4a2540]">{m.name}님의 PIN을 입력해주세요</p>
                <input
                  value={loginPin}
                  onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="****"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  className="w-full rounded-xl bg-white border-2 border-[#ffd6e8] px-4 py-3 text-center text-lg tracking-[0.5em]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setSelectedMemberId(null); setLoginPin(""); setError(""); }}
                    className="flex-1 rounded-xl bg-white border border-[#ffd6e8] py-2.5 text-sm font-semibold text-[#c2679c]"
                  >
                    취소
                  </button>
                  <button
                    disabled={busy}
                    className="flex-1 rounded-xl bg-[#ec4899] py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? "확인 중..." : "들어가기"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                key={m.id}
                onClick={() => { setSelectedMemberId(m.id); setLoginPin(""); setError(""); }}
                className="w-full rounded-xl bg-white border-2 border-[#ffd6e8] py-4 font-bold text-[#4a2540] hover:border-[#ec4899]"
              >
                {m.name}
              </button>
            ),
          )}
        </div>

        {!full && (
          <form onSubmit={join} className="space-y-2 pt-2 border-t border-[#ffd6e8]">
            <p className="text-center text-xs text-[#c2679c]">처음 들어왔다면 닉네임과 PIN을 정해주세요</p>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="내 닉네임"
              className="w-full rounded-xl bg-white border-2 border-[#ffd6e8] px-4 py-3 text-center"
            />
            <input
              value={joinPin}
              onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="PIN 4자리 (다음에 들어올 때 필요해요)"
              inputMode="numeric"
              maxLength={4}
              className="w-full rounded-xl bg-white border-2 border-[#ffd6e8] px-4 py-3 text-center tracking-[0.5em]"
            />
            <button
              disabled={busy}
              className="w-full rounded-xl bg-[#ec4899] py-3 font-bold text-white disabled:opacity-50"
            >
              {busy ? "참여하는 중..." : "닉네임으로 참여하기"}
            </button>
          </form>
        )}

        {error && <p className="text-[#ec4899] text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
