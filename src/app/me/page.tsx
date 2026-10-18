"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPauseEnd } from "@/lib/week";

// 관리자 코드는 화면 코드에 두지 않고, 홈에서 서버가 확인한 코드를 이 탭에서만 기억한다
function ownerCode(): string {
  try {
    return sessionStorage.getItem("dajjang_owner_code") ?? "";
  } catch {
    return "";
  }
}

type RoomInfo = {
  id: string;
  inviteToken: string;
  me: { id: string; name: string } | null;
  others: string[];
  pausedUntil: string | null;
  pauseRequested: boolean;
};

export default function OwnerHome() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    if (!ownerCode()) {
      router.replace("/");
      return;
    }
    const res = await fetch("/api/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: ownerCode() }),
    });
    if (!res.ok) {
      setError("불러오지 못했어요");
      return;
    }
    const data = await res.json();
    setRooms(data.rooms);
  }

  useEffect(() => {
    load().catch(() => setError("불러오지 못했어요"));
  }, []);

  async function loginAs(userId: string) {
    const res = await fetch("/api/owner/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: ownerCode(), userId }),
    });
    if (!res.ok) {
      setError("로그인 실패");
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-4 pb-10">
      <h1 className="text-xl font-black text-[#de73a5] pt-4">내 방 목록</h1>

      {error && <p className="text-[#de73a5] text-sm">{error}</p>}
      {!rooms && !error && <p className="text-[#d9a9c4] text-sm">불러오는 중...</p>}
      {rooms?.length === 0 && <p className="text-[#d9a9c4] text-sm">만들어둔 방이 없어요.</p>}

      <div className="space-y-3">
        {rooms?.map((room) => {
          const paused = !!room.pausedUntil && new Date(room.pausedUntil) > new Date();
          return (
          <div
            key={room.id}
            className={`rounded-2xl border shadow-sm p-4 space-y-2 ${paused ? "paused-card border-dashed border-2" : "bg-white border-[#ffd6e8]"}`}
          >
            {paused && (
              <p className="paused-badge px-2.5 py-0.5 text-[11px]">
                <span className="blink">⏸</span> PAUSED · ~ {formatPauseEnd(new Date(room.pausedUntil!))}
              </p>
            )}
            {!paused && room.pauseRequested && (
              <p className="inline-block rounded-full bg-[#ffc72c] px-2.5 py-0.5 text-[11px] font-bold text-[#6b4a00]">
                쉬어가기 요청 중
              </p>
            )}
            <p className="text-xs text-[#d9a9c4]">
              {room.others.length > 0 ? `친구: ${room.others.join(", ")}` : "친구가 아직 안 들어왔어요"}
            </p>
            {room.me ? (
              <button
                onClick={() => loginAs(room.me!.id)}
                className="w-full rounded-xl bg-[#ffe1ee] border border-[#ffd6e8] px-4 py-2 text-sm font-bold text-[#b4356f]"
              >
                {room.me.name}(으)로 들어가기
              </button>
            ) : (
              <p className="text-xs text-[#d9a9c4]">빈 방</p>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
