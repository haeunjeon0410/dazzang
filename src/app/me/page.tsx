"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const OWNER_CODE = "000000";

type RoomInfo = { id: string; inviteToken: string; users: { id: string; name: string }[] };

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

  async function deleteRoom(roomId: string, label: string) {
    if (!confirm(`"${label}" 방을 정말 삭제할까요? 인증 기록이 전부 사라져요.`)) return;
    const res = await fetch("/api/owner/delete-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: OWNER_CODE, roomId }),
    });
    if (!res.ok) {
      setError("삭제 실패");
      return;
    }
    await load();
  }

  return (
    <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-4 pb-10">
      <h1 className="text-xl font-black text-[#ec4899] pt-4">개발자 도구</h1>

      {error && <p className="text-[#ec4899] text-sm">{error}</p>}
      {!rooms && !error && <p className="text-[#d9a9c4] text-sm">불러오는 중...</p>}
      {rooms?.length === 0 && <p className="text-[#d9a9c4] text-sm">만들어둔 방이 없어요.</p>}

      <div className="space-y-3">
        {rooms?.map((room) => {
          const label = room.users.length > 0 ? room.users.map((u) => u.name).join(" · ") : "빈 방";
          return (
            <div key={room.id} className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[#4a2540]">{label}</p>
                <button onClick={() => deleteRoom(room.id, label)} className="text-xs text-[#ec4899] underline">
                  방 삭제
                </button>
              </div>
              <div className="flex gap-2 flex-wrap">
                {room.users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => loginAs(u.id)}
                    className="rounded-xl bg-[#ffe1ee] border border-[#ffd6e8] px-4 py-2 text-sm font-bold text-[#b4356f]"
                  >
                    {u.name}(으)로 들어가기
                  </button>
                ))}
                {room.users.length === 0 && <p className="text-xs text-[#d9a9c4]">아직 아무도 안 들어옴</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
