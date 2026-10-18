"use client";

import { useEffect, useState } from "react";

type Meal = {
  id: string;
  userId: string;
  name: string;
  photoUrl: string;
  analyzed: boolean;
  title: string | null;
  kcal: number | null;
  items: { name: string; kcal: number }[] | null;
  comment: string | null;
  createdAt: string;
};

// 식단 사진은 분석용이라 운동 인증보다 작게 줄인다 (긴 변 1024px)
async function compressImage(file: File, maxDim = 1024, quality = 0.7): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });
}

// 실험실: 식단 인증. 운동 인증(주 3회/벌금)과 별개로 오늘 먹은 걸 올리면 AI가 칼로리를 추정하고 친구와 공유한다
export function MealPanel({ meId }: { meId: string }) {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/meals");
    if (!res.ok) return;
    setMeals((await res.json()).meals);
  }

  useEffect(() => {
    fetch("/api/meals")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setMeals(data.meals))
      .catch(() => {});
  }, []);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const photoDataUrl = await compressImage(file);
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoDataUrl }),
      });
      if (!res.ok) {
        alert((await res.json().catch(() => null))?.error || "업로드 실패");
      } else {
        await load();
      }
    } catch {
      alert("사진을 올리지 못했어요");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("이 식단을 지울까요?")) return;
    const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  const totals = new Map<string, number>();
  for (const m of meals ?? []) totals.set(m.userId, (totals.get(m.userId) ?? 0) + (m.kcal ?? 0));

  return (
    <div className="rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#4a2540]">
          오늘의 식단 <span className="ml-1 rounded-full bg-[#ffc72c] px-2 py-0.5 text-[10px] font-bold text-[#6b4a00]">실험실</span>
        </p>
        <label className="cursor-pointer">
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
          <span className="inline-block rounded-full bg-[#ec4899] px-3 py-1.5 text-xs font-bold text-white">
            {uploading ? "분석 중..." : "식단 올리기"}
          </span>
        </label>
      </div>

      {meals && meals.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-[#b4779b]">
          {[...totals].map(([uid, kcal]) => (
            <span key={uid} className="rounded-full bg-[#ffe1ee] px-2.5 py-1 font-semibold text-[#b4356f]">
              {meals.find((m) => m.userId === uid)?.name}
              {uid === meId ? "(나)" : ""} {kcal.toLocaleString()} kcal
            </span>
          ))}
        </div>
      )}

      {meals?.length === 0 && <p className="text-xs text-[#d9a9c4]">아직 올라온 식단이 없어요. 먹기 전에 한 장 찍어 볼까요?</p>}

      <div className="space-y-3">
        {meals?.map((m) => (
          <div key={m.id} className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.photoUrl} alt="" className="h-20 w-20 flex-none rounded-xl object-cover border border-[#ffd6e8]" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-[11px] text-[#d9a9c4]">
                {m.userId === meId ? "나" : m.name} · {timeLabel(m.createdAt)}
              </p>
              <p className="truncate text-sm font-bold text-[#4a2540]">{m.analyzed ? m.title : "분석하지 못했어요"}</p>
              {m.analyzed && m.kcal != null && (
                <button onClick={() => setOpenId(openId === m.id ? null : m.id)} className="text-sm font-black text-[#ec4899]">
                  약 {m.kcal.toLocaleString()} kcal {m.items?.length ? (openId === m.id ? "︿" : "﹀") : ""}
                </button>
              )}
              {openId === m.id && m.items && (
                <ul className="text-xs text-[#b4779b]">
                  {m.items.map((i, idx) => (
                    <li key={idx}>
                      {i.name} · {i.kcal} kcal
                    </li>
                  ))}
                </ul>
              )}
              {m.comment && <p className="text-xs text-[#b4779b]">&ldquo;{m.comment}&rdquo;</p>}
              {m.userId === meId && (
                <button onClick={() => remove(m.id)} className="text-[11px] text-[#d9a9c4] underline">
                  지우기
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#d9a9c4]">칼로리는 사진으로 어림잡은 값이에요. 벌금·인증 횟수와는 상관없어요.</p>
    </div>
  );
}
