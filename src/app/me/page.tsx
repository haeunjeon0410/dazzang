"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const OWNER_CODE = "000000";

type RoomInfo = { id: string; inviteToken: string; me: { id: string; name: string } | null; others: string[] };

export default function OwnerHome() {
  const router = useRouter();
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: OWNER_CODE }),
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
      body: JSON.stringify({ code: OWNER_CODE, userId }),
    });
    if (!res.ok) {
      setError("로그인 실패");
      return;
    }
    router.push("/");
  }

  return (
    <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-4 pb-10">
      <h1 className="text-xl font-black text-[#ec4899] pt-4">내 방 목록</h1>

      {error && <p className="text-[#ec4899] text-sm">{error}</p>}
      {!rooms && !error && <p className="text-[#d9a9c4] text-sm">불러오는 중...</p>}
      {rooms?.length === 0 && <p className="text-[#d9a9c4] text-sm">만들어둔 방이 없어요.</p>}

      <div className="space-y-3">
        {rooms?.map((room) => (
          <div key={room.id} className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4 space-y-2">
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
        ))}
      </div>
    </div>
  );
}
