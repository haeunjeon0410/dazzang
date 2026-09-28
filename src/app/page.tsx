"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeToPush } from "./push-setup";
import { Battle } from "./battle";
import { WeekCalendar } from "./calendar";
import { ExcusePanel } from "./excuses";
import { CharacterSprite, CharRow, CharPose } from "./sprite";

// 업로드 전 브라우저에서 리사이즈+압축해서 DB 용량/트래픽을 아낀다 (긴 변 1280px, JPEG 75%)
async function compressImage(file: File, maxDim = 1280, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

type Summary = {
  userId: string;
  name: string;
  count: number;
  shortfall: number;
  fine: number;
  checkins: { id: string; photoUrl: string; createdAt: string }[];
};

type Me = { id: string; name: string };
type Room = {
  inviteToken: string;
  full: boolean;
  groupBankName: string | null;
  groupAccountNumber: string | null;
  groupAccountHolder: string | null;
  deleteRequestedBy: string | null;
  pauseRequestedBy: string | null;
  pauseRequestedUntil: string | null;
  pausedUntil: string | null;
};

type WeekSummary = { userId: string; name: string; count: number; shortfall: number; fine: number; settled: boolean };
type PastWeek = { weekStart: string; deadline: string; summary: WeekSummary[] };

const BANK_SCHEMES: Record<string, string> = {
  카카오뱅크: "kakaobank://",
  토스: "supertoss://",
};

const CARD = "rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4";

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [creating, setCreating] = useState(false);
  const [weekData, setWeekData] = useState<{ weekStart: string; deadline: string; summary: Summary[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameForm, setNameForm] = useState("");
  const [groupForm, setGroupForm] = useState({ groupBankName: "", groupAccountNumber: "", groupAccountHolder: "" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pastWeeks, setPastWeeks] = useState<PastWeek[] | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<
    { userId: string; name: string; totalCheckins: number; weeksWon: number; totalWeeks: number; totalFine: number }[] | null
  >(null);
  const [pauseWeeks, setPauseWeeks] = useState(2);

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json();
    setMe(data.user);
    setRoom(data.room ?? null);
    if (data.user) setNameForm(data.user.name ?? "");
    if (data.room) {
      setGroupForm({
        groupBankName: data.room.groupBankName ?? "",
        groupAccountNumber: data.room.groupAccountNumber ?? "",
        groupAccountHolder: data.room.groupAccountHolder ?? "",
      });
    }
  }

  async function loadWeek() {
    const res = await fetch("/api/checkins");
    if (!res.ok) return;
    setWeekData(await res.json());
  }

  async function loadHistory() {
    const res = await fetch("/api/history");
    if (!res.ok) return;
    const data = await res.json();
    setPastWeeks(data.weeks);
  }

  async function loadStats() {
    const res = await fetch("/api/stats");
    if (!res.ok) return;
    const data = await res.json();
    setStats(data.stats);
  }

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (me) loadWeek();
  }, [me]);

  async function roomAction(action: string, extra?: Record<string, unknown>) {
    const res = await fetch("/api/room", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "요청 실패"); return false; }
    if (data.deleted) { await fetch("/api/logout", { method: "POST" }); location.href = "/"; return true; }
    await loadMe();
    return true;
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setCreating(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        setLoginError(data.error || "방 만들기 실패");
        return;
      }
      const data = await res.json();
      router.push(`/join/${data.inviteToken}`);
    } finally {
      setCreating(false);
    }
  }

  function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setLoginError("방 코드를 입력해주세요");
      return;
    }
    router.push(`/join/${encodeURIComponent(code)}`);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoDataUrl: dataUrl }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "업로드 실패");
      } else {
        await loadWeek();
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function inviteUrl() {
    if (!room) return "";
    return `${location.origin}/join/${room.inviteToken}`;
  }

  async function copyRoomCode() {
    if (!room?.inviteToken) return;
    await navigator.clipboard.writeText(room.inviteToken);
    alert("방 코드가 복사됐어요");
  }

  async function shareInvite() {
    const url = inviteUrl();
    const text = `같이 운동 인증 맞짱 뜨자! 초대 코드: ${room?.inviteToken}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "다짱 초대", text, url });
        return;
      } catch {
        // 공유 취소 시 복사로 대체
      }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    alert("초대 문구가 복사됐어요");
  }

  function openBankApp() {
    const scheme = room?.groupBankName ? BANK_SCHEMES[room.groupBankName] : undefined;
    if (scheme) {
      window.location.href = scheme;
    } else {
      alert("이 은행은 앱 바로가기가 없어요. 계좌번호를 복사해서 직접 송금해주세요.");
    }
  }

  async function copyAccount() {
    if (!room?.groupAccountNumber) return;
    await navigator.clipboard.writeText(room.groupAccountNumber);
    alert("계좌번호가 복사됐어요");
  }

  async function saveName() {
    if (!nameForm.trim()) {
      alert("이름을 입력해주세요");
      return;
    }
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameForm }),
    });
    await loadMe();
    alert("저장됐어요");
  }

  async function saveGroupAccount() {
    await fetch("/api/room", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupForm),
    });
    await loadMe();
    alert("모임 통장이 등록됐어요");
  }

  async function toggleSettled(weekStart: string, userId: string, current: boolean) {
    await fetch("/api/settlement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart, userId, settled: !current }),
    });
    await loadHistory();
  }

  if (me === undefined) {
    return <div className="flex-1 flex items-center justify-center text-[#d9a9c4]">불러오는 중...</div>;
  }

  if (!me) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-4 bg-white/90 backdrop-blur rounded-3xl border border-[#ffd6e8] shadow-lg p-6">
          <h1 className="text-3xl font-black text-center text-[#ec4899] tracking-tight">다짱</h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/poster.webp" alt="" className="w-full h-auto" />
          <p className="text-center text-sm text-[#c2679c]">방 코드로 친구와 함께 시작해보세요.</p>
          <form onSubmit={handleJoinRoom} className="space-y-2">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="방 코드"
              maxLength={20}
              autoCapitalize="characters"
              className="w-full rounded-xl bg-white border-2 border-[#ffd6e8] px-4 py-3 text-center text-lg tracking-widest"
            />
            <button className="w-full rounded-xl bg-[#ec4899] py-3 font-bold text-white shadow-md shadow-[#ec4899]/30">방 코드로 입장하기</button>
          </form>
          <div className="flex items-center gap-3 text-xs text-[#d9a9c4]"><span className="h-px flex-1 bg-[#ffd6e8]" /><span>또는</span><span className="h-px flex-1 bg-[#ffd6e8]" /></div>
          <form onSubmit={handleCreateRoom}>
            <button disabled={creating} className="w-full rounded-xl bg-white border-2 border-[#ec4899] py-3 font-bold text-[#ec4899] disabled:opacity-50">{creating ? "방 만드는 중..." : "방 만들기"}</button>
          </form>
          {loginError && <p className="text-[#ec4899] text-sm text-center">{loginError}</p>}
        </div>
      </div>
    );
  }

  const myEntry = weekData?.summary.find((s) => s.userId === me.id);
  const otherEntry = weekData?.summary.find((s) => s.userId !== me.id);
  const hasGroupAccount = !!room?.groupAccountNumber;

  return (
    <>
      <div className="flex-1 p-4 max-w-md mx-auto w-full space-y-4 pb-24">
        <header className="flex items-center justify-between pt-4">
          <h1 className="text-xl font-black text-[#ec4899]">
            다짱 <span className="text-[#4a2540] font-bold text-base">· {me.name}님</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setStatsOpen(true);
                if (!stats) loadStats();
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#ffe1ee]"
              aria-label="통산전적"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/nav/total.webp" alt="" className="w-6 h-6 object-contain" />
            </button>
            <button
              onClick={() => subscribeToPush().then((ok) => alert(ok ? "알림이 설정됐어요" : "알림 설정 실패"))}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#ffe1ee]"
              aria-label="마감 알림 받기"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/nav/alarm.webp" alt="" className="w-6 h-6 object-contain" />
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-[#ffe1ee]"
              aria-label="내 정보"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/nav/profile.webp" alt="" className="w-6 h-6 object-contain" />
            </button>
          </div>
        </header>

        {room && !room.full && (
          <div className="rounded-2xl bg-[#ffe1ee] border border-[#ffc72c] p-4 flex items-center gap-3">
            <CharacterSprite row={CharRow.A} pose={CharPose.SAD} height={88} />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-bold text-[#b4356f]">친구가 아직 안 들어왔어요</p>
              <p className="text-xs text-[#b4779b]">아래 초대 코드를 카톡으로 보내거나, 코드를 눌러 복사해주세요</p>
              <button onClick={copyRoomCode}>
                <p className="text-center text-2xl font-black tracking-[0.25em] text-[#ec4899]">{room.inviteToken}</p>
              </button>
              <button onClick={shareInvite} className="w-full rounded-xl bg-[#ec4899] py-2.5 text-sm font-bold text-white">
                초대 공유하기
              </button>
            </div>
          </div>
        )}

        {/* 정지 중 배너 */}
        {room?.pausedUntil && new Date(room.pausedUntil) > new Date() && (
          <div className={`${CARD} space-y-2`}>
            <p className="text-sm font-bold text-[#4a2540]">쉬어가는 중</p>
            <p className="text-xs text-[#b4779b]">
              {new Date(room.pausedUntil).toLocaleDateString("ko-KR")}까지 일시정지 중이에요. 인증과 벌금이 없어요.
            </p>
            <button
              onClick={() => { if (confirm("정지를 지금 취소할까요?")) roomAction("cancel-pause"); }}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-2 text-sm font-semibold text-[#c2679c]"
            >
              정지 취소하고 다시 시작하기
            </button>
          </div>
        )}

        {/* 상대방이 삭제 요청한 경우 */}
        {room?.deleteRequestedBy && room.deleteRequestedBy !== me?.id && (
          <div className="rounded-2xl bg-[#ffe1ee] border border-[#ffc72c] p-4 space-y-2">
            <p className="text-sm font-bold text-[#b4356f]">방 삭제 요청이 왔어요</p>
            <p className="text-xs text-[#b4779b]">상대방이 방 삭제를 요청했어요. 수락하면 모든 기록이 삭제돼요.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { if (confirm("정말 방을 삭제할까요? 모든 기록이 사라져요.")) roomAction("confirm-delete"); }}
                className="flex-1 rounded-lg bg-[#2f9e44] text-white py-1.5 text-sm font-bold"
              >허락하기</button>
              <button
                onClick={() => roomAction("cancel-delete")}
                className="flex-1 rounded-lg bg-white border border-[#ffd6e8] py-1.5 text-sm text-[#b4779b]"
              >거절하기</button>
            </div>
          </div>
        )}

        {/* 내가 삭제 요청한 경우 */}
        {room?.deleteRequestedBy && room.deleteRequestedBy === me?.id && (
          <div className={`${CARD} space-y-2`}>
            <p className="text-sm font-bold text-[#4a2540]">방 삭제를 요청했어요</p>
            <p className="text-xs text-[#b4779b]">상대방이 수락하면 방이 삭제돼요.</p>
            <button
              onClick={() => roomAction("cancel-delete")}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-2 text-sm font-semibold text-[#c2679c]"
            >요청 취소</button>
          </div>
        )}

        {/* 상대방이 정지 요청한 경우 */}
        {room?.pauseRequestedBy && room.pauseRequestedBy !== me?.id && !room.pausedUntil && (
          <div className="rounded-2xl bg-[#ffe1ee] border border-[#ffc72c] p-4 space-y-2">
            <p className="text-sm font-bold text-[#b4356f]">쉬어가기 요청이 왔어요</p>
            <p className="text-xs text-[#b4779b]">
              {room.pauseRequestedUntil
                ? `${new Date(room.pauseRequestedUntil).toLocaleDateString("ko-KR")}까지 쉬어가자고 요청했어요.`
                : ""}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => roomAction("confirm-pause")}
                className="flex-1 rounded-lg bg-[#2f9e44] text-white py-1.5 text-sm font-bold"
              >허락하기</button>
              <button
                onClick={() => roomAction("cancel-pause")}
                className="flex-1 rounded-lg bg-white border border-[#ffd6e8] py-1.5 text-sm text-[#b4779b]"
              >거절하기</button>
            </div>
          </div>
        )}

        {/* 내가 정지 요청한 경우 */}
        {room?.pauseRequestedBy && room.pauseRequestedBy === me?.id && !room.pausedUntil && (
          <div className={`${CARD} space-y-2`}>
            <p className="text-sm font-bold text-[#4a2540]">쉬어가기를 요청했어요</p>
            <p className="text-xs text-[#b4779b]">상대방이 수락하면 정지가 시작돼요.</p>
            <button
              onClick={() => roomAction("cancel-pause")}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-2 text-sm font-semibold text-[#c2679c]"
            >요청 취소</button>
          </div>
        )}

        {weekData && myEntry && otherEntry && (
          <section className="space-y-3">
            <p className="text-xs text-[#8a5a1f] font-semibold bg-white/80 inline-block px-3 py-1 rounded-full">
              이번 주 ({new Date(weekData.weekStart).toLocaleDateString("ko-KR")} ~), 일요일 밤 12시 마감
            </p>

            <Battle
              myCount={myEntry.count}
              otherCount={otherEntry.count}
              myName={myEntry.name}
              otherName={otherEntry.name}
              myFine={myEntry.fine}
              otherFine={otherEntry.fine}
            />

            {myEntry.fine > 0 && hasGroupAccount && (
              <div className={`${CARD} space-y-2`}>
                <p className="text-sm font-bold text-[#4a2540]">
                  지금 마감되면 모임 통장에 {myEntry.fine.toLocaleString()}원 보내야 해요
                </p>
                <p className="text-xs text-[#b4779b]">
                  {room.groupBankName} {room.groupAccountNumber} ({room.groupAccountHolder})
                </p>
                <div className="flex gap-2">
                  <button onClick={copyAccount} className="flex-1 rounded-xl bg-[#ffe1ee] py-2 text-sm font-semibold text-[#b4356f]">
                    계좌번호 복사
                  </button>
                  <button onClick={openBankApp} className="flex-1 rounded-xl bg-[#ffe1ee] py-2 text-sm font-semibold text-[#b4356f]">
                    은행 앱 열기
                  </button>
                </div>
              </div>
            )}

            {myEntry.fine > 0 && !hasGroupAccount && (
              <div className={`${CARD} space-y-1`}>
                <p className="text-sm font-bold text-[#4a2540]">
                  지금 마감되면 벌금 {myEntry.fine.toLocaleString()}원
                </p>
                <button onClick={() => setSettingsOpen(true)} className="text-xs text-[#ec4899] underline">
                  모임 통장을 등록하면 여기서 바로 송금 정보가 떠요
                </button>
              </div>
            )}

            <WeekCalendar
              weekStart={weekData.weekStart}
              people={[
                { userId: myEntry.userId, name: "나", checkins: myEntry.checkins },
                { userId: otherEntry.userId, name: otherEntry.name, checkins: otherEntry.checkins },
              ]}
            />

            <ExcusePanel onResolved={loadWeek} />

            <button
              onClick={() => {
                setHistoryOpen((v) => !v);
                if (!pastWeeks) loadHistory();
              }}
              className="w-full flex items-center justify-between rounded-2xl bg-white border border-[#ffd6e8] shadow-sm px-4 py-3 text-sm"
            >
              <span className="text-[#c2679c] font-semibold">지난 기록</span>
              <span className="text-[#ec4899] text-lg leading-none">{historyOpen ? "︿" : "﹀"}</span>
            </button>

            {historyOpen && (
              <div className="space-y-3">
                {pastWeeks?.length === 0 && <p className="text-[#d9a9c4] text-sm text-center">아직 마감된 주가 없어요.</p>}
                {pastWeeks?.map((week) => (
                  <div key={week.weekStart} className="rounded-2xl bg-white p-4 border border-[#ffd6e8] shadow-sm space-y-3">
                    <p className="text-xs text-[#d9a9c4]">{new Date(week.weekStart).toLocaleDateString("ko-KR")} 주</p>
                    {week.summary.map((s) => (
                      <div key={s.userId} className="flex items-center justify-between text-sm">
                        <span className="text-[#4a2540] font-semibold">
                          {s.name} · {s.count}/3
                        </span>
                        {s.fine > 0 ? (
                          s.settled ? (
                            <button onClick={() => toggleSettled(week.weekStart, s.userId, s.settled)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/assets/nav/check-button.webp" alt="정산완료" className="h-8 w-auto" />
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleSettled(week.weekStart, s.userId, s.settled)}
                              className="flex items-center gap-2"
                            >
                              <span className="text-xs font-bold text-[#b4356f]">{s.fine.toLocaleString()}원</span>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/assets/nav/settle-button.webp" alt="정산하기" className="h-8 w-auto" />
                            </button>
                          )
                        ) : (
                          <span className="text-[#2f9e44] font-semibold">완료</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {room?.full && !(room.pausedUntil && new Date(room.pausedUntil) > new Date()) && (
        <label className="fixed right-5 bottom-5 z-40 drop-shadow-lg">
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          {uploading ? (
            <span className="flex items-center justify-center w-24 h-10 rounded-full bg-[#ffc72c] text-sm font-bold text-[#4a2540]">
              업로드 중...
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/assets/nav/verify-button.webp" alt="인증하기" className="h-10 w-auto" />
          )}
        </label>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSettingsOpen(false)}>
          <div
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSettingsOpen(false)}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#ffeef5] text-[#c2679c] font-bold"
              aria-label="닫기"
            >
              ✕
            </button>
            <p className="font-bold text-[#4a2540]">내 정보</p>

            <div className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 space-y-2">
              <p className="text-sm font-bold text-[#4a2540]">내 이름</p>
              <input
                placeholder="내 이름"
                value={nameForm}
                onChange={(e) => setNameForm(e.target.value)}
                className="w-full rounded-lg bg-white border border-[#ffd6e8] px-3 py-2 text-sm"
              />
              <button onClick={saveName} className="w-full rounded-xl bg-[#f472b6] py-2.5 text-sm font-bold text-white">
                저장
              </button>
            </div>

            <div className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 space-y-2">
              <p className="text-sm font-bold text-[#4a2540]">모임 통장 (벌금 보낼 곳)</p>
              <p className="text-xs text-[#b4779b]">둘이 같이 쓰는 계좌 하나만 등록하면, 벌금 있을 때 홈 화면에 바로 떠요</p>
              <input
                placeholder="은행명 (예: 카카오뱅크)"
                value={groupForm.groupBankName}
                onChange={(e) => setGroupForm((a) => ({ ...a, groupBankName: e.target.value }))}
                className="w-full rounded-lg bg-white border border-[#ffd6e8] px-3 py-2 text-sm"
              />
              <input
                placeholder="계좌번호"
                value={groupForm.groupAccountNumber}
                onChange={(e) => setGroupForm((a) => ({ ...a, groupAccountNumber: e.target.value }))}
                className="w-full rounded-lg bg-white border border-[#ffd6e8] px-3 py-2 text-sm"
              />
              <input
                placeholder="예금주"
                value={groupForm.groupAccountHolder}
                onChange={(e) => setGroupForm((a) => ({ ...a, groupAccountHolder: e.target.value }))}
                className="w-full rounded-lg bg-white border border-[#ffd6e8] px-3 py-2 text-sm"
              />
              <button onClick={saveGroupAccount} className="w-full rounded-xl bg-[#f472b6] py-2.5 text-sm font-bold text-white">
                저장
              </button>
            </div>

            <button
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                location.href = "/";
              }}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-3 text-sm font-semibold text-[#c2679c]"
            >
              로그아웃 (새 방 만들기로)
            </button>

            {/* 쉬어가기 요청 */}
            {!room?.pausedUntil && !room?.pauseRequestedBy && (
              <div className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 space-y-2">
                <p className="text-sm font-bold text-[#4a2540]">잠깐 쉬어갈까요?</p>
                <p className="text-xs text-[#b4779b]">상대방이 수락하면 해당 기간 동안 인증과 벌금이 없어요.</p>
                <div className="flex items-center gap-2">
                  <select
                    value={pauseWeeks}
                    onChange={(e) => setPauseWeeks(Number(e.target.value))}
                    className="flex-1 rounded-lg bg-white border border-[#ffd6e8] px-3 py-2 text-sm"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                      <option key={w} value={w}>{w}주</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setSettingsOpen(false); roomAction("request-pause", { weeks: pauseWeeks }); }}
                    className="flex-1 rounded-xl bg-[#f472b6] py-2.5 text-sm font-bold text-white"
                  >
                    쉬어가기 요청
                  </button>
                </div>
              </div>
            )}

            {/* 방 삭제 요청 */}
            {!room?.deleteRequestedBy && (
              <button
                onClick={() => {
                  if (confirm("방 삭제를 요청할까요?\n상대방이 수락하면 모든 기록이 삭제돼요.")) {
                    setSettingsOpen(false);
                    roomAction("request-delete");
                  }
                }}
                className="w-full rounded-xl bg-white border border-[#ffd6e8] py-3 text-sm font-semibold text-[#ec4899]"
              >
                방 삭제 요청
              </button>
            )}
          </div>
        </div>
      )}

      {statsOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setStatsOpen(false)}>
          <div
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3 relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setStatsOpen(false)}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#ffeef5] text-[#c2679c] font-bold"
              aria-label="닫기"
            >
              ✕
            </button>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/nav/total.webp" alt="" className="w-8 h-8 object-contain" />
              <p className="font-bold text-[#4a2540]">통산전적</p>
            </div>

            {!stats && <p className="text-sm text-[#b4779b]">불러오는 중...</p>}

            {stats && (
              <div className="grid grid-cols-2 gap-3">
                {stats.map((s) => (
                  <div key={s.userId} className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 text-center space-y-1">
                    <p className="text-sm font-bold text-[#4a2540]">{s.name}</p>
                    <p className="text-2xl font-black text-[#ec4899]">{s.weeksWon}</p>
                    <p className="text-xs text-[#b4779b]">승리한 주 (총 {s.totalWeeks}주)</p>
                    <p className="text-xs text-[#8a5a1f]">누적 인증 {s.totalCheckins}회</p>
                    <p className="text-xs text-[#b4356f] font-semibold">누적 벌금 {s.totalFine.toLocaleString()}원</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
