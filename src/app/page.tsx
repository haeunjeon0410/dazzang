"use client";

import { formatPauseEnd } from "@/lib/week";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeToPush } from "./push-setup";
import { Battle, SleepingFigure } from "./battle";
import { WeekCalendar } from "./calendar";
import { ExcusePanel } from "./excuses";
import { MealView } from "./meals";
import { MealConfirm, type ConfirmValues } from "./meal-confirm";
import { ShortcutSetup } from "./shortcut-setup";
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

// 사진 조작 방지: 사진에 찍힌 촬영 시각(EXIF)을 읽는다. 압축(canvas)하면 EXIF가 지워지므로 원본 파일에서 읽어야 한다.
// EXIF 시각은 시간대 없는 "현지 시각"이라 한국 시간(KST)으로 해석한다. 날짜 정보가 없으면 null (= 오늘로 인정)
async function readTakenAt(file: File): Promise<string | null> {
  try {
    const { default: exifr } = await import("exifr");
    const exif = await exifr.parse(file, { pick: ["DateTimeOriginal", "CreateDate"], reviveValues: false });
    const raw: unknown = exif?.DateTimeOriginal ?? exif?.CreateDate;
    const m = typeof raw === "string" && raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, y, mo, d, h, mi, sec] = m.map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h - 9, mi, sec)).toISOString();
  } catch {
    return null;
  }
}

type Summary = {
  userId: string;
  name: string;
  count: number;
  shortfall: number;
  fine: number;
  ribbons?: number;
  recentUsedRibbons?: { id: string; usedWeek: string; waivedFine: number }[];
  ribbonIds?: string[];
  recentEarnedRibbonIds?: string[];
  checkins: { id: string; photoUrl: string; createdAt: string; userId: string; liked: boolean }[];
};

type Me = { id: string; name: string; caption?: string; restUntil?: string | null; labMeal?: boolean; mealToken?: string | null; pendingMeals?: number };
type Room = {
  inviteToken: string;
  full: boolean;
  groupBankName: string | null;
  groupAccountNumber: string | null;
  groupAccountHolder: string | null;
  pauseRequestedBy: string | null;
  pauseRequestedUntil: string | null;
  pauseReason: string | null;
  pausedUntil: string | null;
};

type WeekSummary = {
  userId: string;
  name: string;
  count: number;
  shortfall: number;
  fine: number;
  settled: boolean;
  ribbonUsed?: boolean;
  waivedFine?: number;
  // 실험실 식단 인증을 켠 사람에게만 내려오는 그 주의 하루 평균 칼로리
  avgKcal?: number | null;
};
type PastWeek = { weekStart: string; deadline: string; summary: WeekSummary[] };

const BANK_SCHEMES: Record<string, string> = {
  카카오뱅크: "kakaobank://",
  토스: "supertoss://",
};

const CARD = "rounded-2xl bg-white border border-[#ffd6e8] shadow-sm p-4";
// 방 코드 입력창에 이 코드를 치면 내 모든 방을 한눈에 보는 전용 화면으로 이동 (나만 아는 코드)

// 주간 결과 팝업을 이미 봤는지는 이 기기에만 기억해두면 충분하다
const CONFETTI_COLORS = ["#f472b6", "#de73a5", "#ffc72c", "#60a5fa", "#34d399", "#a78bfa"];
const CONFETTI_PIECES = Array.from({ length: 36 }, (_, i) => ({
  left: `${(i * 97) % 100}%`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 6 + (i % 4) * 2,
  delay: `${((i * 13) % 20) / 10}s`,
  dur: `${2.4 + ((i * 7) % 12) / 10}s`,
  drift: `${((i % 7) - 3) * 24}px`,
  round: i % 3 === 0,
}));

// 목표를 채운 주에만 결과 팝업 뒤로 색종이가 떨어진다
function Confetti() {
  return (
    <>
      {CONFETTI_PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: p.left,
              width: p.size,
              height: p.size * (p.round ? 1 : 1.6),
              borderRadius: p.round ? "50%" : 2,
              backgroundColor: p.color,
              "--confetti-delay": p.delay,
              "--confetti-dur": p.dur,
              "--confetti-drift": p.drift,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

const WEEK_SEEN_KEY = "dajjang_seen_week_results";
// 쉬어가기 시작 연출(카드 떨어지고 흑백)을 이 기기에서 이미 봤는지 (방+종료일 단위)
const PAUSE_SEEN_KEY = "dajjang_seen_pause_effect";

function hasSeenPauseEffect(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(PAUSE_SEEN_KEY) || "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}

function markPauseEffectSeen(id: string) {
  try {
    const seen = JSON.parse(localStorage.getItem(PAUSE_SEEN_KEY) || "[]") as string[];
    localStorage.setItem(PAUSE_SEEN_KEY, JSON.stringify([...seen.slice(-19), id]));
  } catch {
    // localStorage 접근 불가하면 무시 (연출이 다시 나오는 정도)
  }
}

function getSeenWeeks(): Set<string> {
  try {
    const raw = localStorage.getItem(WEEK_SEEN_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function markWeekSeen(weekStart: string) {
  try {
    const seen = getSeenWeeks();
    seen.add(weekStart);
    localStorage.setItem(WEEK_SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage 접근 불가하면 그냥 무시 (팝업이 다시 뜨는 정도)
  }
}

// 쉬어가기 수락 연출: 제목, 아이콘, 카드들이 시간차를 두고 우수수 떨어진다. 걸리는 시간(ms)을 돌려준다
const FALL_STEP_MS = 260;
const FALL_TAIL_MS = 1700;

function prepareFall(container: HTMLElement | null): number {
  if (!container) return 0;
  const targets: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>("header > h1, .hdr-icons > *").forEach((el) => targets.push(el));
  for (const child of Array.from(container.children) as HTMLElement[]) {
    if (child.tagName === "HEADER" || child.hasAttribute("data-keep")) continue;
    if (child.tagName === "SECTION") targets.push(...(Array.from(child.children) as HTMLElement[]));
    else targets.push(child);
  }
  // 플로팅 인증하기 버튼도 마지막에 같이 떨어진다 (컨테이너 밖에 고정 배치돼 있음)
  const fab = document.querySelector<HTMLElement>("[data-fab]");
  if (fab) targets.push(fab);
  targets.forEach((el, i) => {
    el.setAttribute("data-fall", "");
    el.style.setProperty("--fall-delay", `${(i * FALL_STEP_MS) / 1000}s`);
    el.style.setProperty("--tilt", `${(i % 2 ? 1 : -1) * (3 + (i % 3) * 2)}deg`);
  });
  return targets.length * FALL_STEP_MS + FALL_TAIL_MS;
}

function clearFall(container: HTMLElement | null) {
  const nodes = Array.from(container?.querySelectorAll<HTMLElement>("[data-fall]") ?? []);
  const fab = document.querySelector<HTMLElement>("[data-fab]");
  if (fab) nodes.push(fab);
  nodes.forEach((el) => {
    el.removeAttribute("data-fall");
    el.style.removeProperty("--fall-delay");
    el.style.removeProperty("--tilt");
  });
}

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [otherCaption, setOtherCaption] = useState<string | undefined>(undefined);
  const [otherResting, setOtherResting] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  // 쉬어가기를 수락하는 순간: 카드들이 우수수 떨어지고 앱 전체가 흑백으로 변한다
  const [pauseFalling, setPauseFalling] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const [roomCode, setRoomCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [creating, setCreating] = useState(false);
  const [weekData, setWeekData] = useState<{ weekStart: string; deadline: string; summary: Summary[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  // 실험실 식단 인증을 켠 사람만 쓰는 보기 전환 (운동 | 식단). 고른 보기는 이 기기에 기억한다
  const [viewMode, setViewMode] = useState<"workout" | "diet">(() => {
    try {
      return localStorage.getItem("dajjang_view_mode") === "diet" ? "diet" : "workout";
    } catch {
      return "workout";
    }
  });
  const [mealRefresh, setMealRefresh] = useState(0);
  // 식단 사진을 올리기 전에 AI가 읽은 내용을 확인하고 고치는 창에 띄울 값
  const [mealConfirm, setMealConfirm] = useState<{ photo: string; initial: ConfirmValues; aiRead: boolean } | null>(null);
  const [mealSaving, setMealSaving] = useState(false);
  // 식단을 저장한 직후 잠깐 떴다 사라지는 알림
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groupAccountOpen, setGroupAccountOpen] = useState(false);
  const [nameForm, setNameForm] = useState("");
  const [groupForm, setGroupForm] = useState({ groupBankName: "", groupAccountNumber: "" });
  // 트로피 창 안의 탭: 통산전적 | 지난 기록
  const [statsTab, setStatsTab] = useState<"stats" | "history">("stats");
  const [pastWeeks, setPastWeeks] = useState<PastWeek[] | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<
    { userId: string; name: string; totalCheckins: number; weeksWon: number; totalWeeks: number; totalFine: number }[] | null
  >(null);
  const [pauseWeeks, setPauseWeeks] = useState(2);
  const [pauseReason, setPauseReason] = useState("");
  const [weekResultPopup, setWeekResultPopup] = useState<PastWeek | null>(null);
  // 주간 결과 팝업을 띄울지 판단이 끝났는지 (끝나기 전에 훈장 연출이 팝업 뒤에서 먼저 돌지 않도록)
  const [historyReady, setHistoryReady] = useState(false);

  async function loadMe() {
    const res = await fetch("/api/me");
    const data = await res.json();
    setMe(data.user);
    setRoom(data.room ?? null);
    setOtherCaption(data.other?.caption);
    setOtherResting(!!data.other?.resting);
    if (data.user) setNameForm(data.user.name ?? "");
    if (data.room) {
      setGroupForm({
        groupBankName: data.room.groupBankName ?? "",
        groupAccountNumber: data.room.groupAccountNumber ?? "",
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
    if (!res.ok) {
      setHistoryReady(true);
      return;
    }
    const data = await res.json();
    setPastWeeks(data.weeks);

    const lastWeek = data.weeks[0];
    if (lastWeek && !getSeenWeeks().has(lastWeek.weekStart)) {
      setWeekResultPopup(lastWeek);
    }
    setHistoryReady(true);
  }

  function closeWeekResultPopup(goToSettlement: boolean) {
    if (weekResultPopup) markWeekSeen(weekResultPopup.weekStart);
    setWeekResultPopup(null);
    if (goToSettlement) {
      setStatsTab("history");
      setStatsOpen(true);
      if (!stats) loadStats();
      if (!pastWeeks) loadHistory();
    }
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
    // loadMe가 매번 새 객체를 만들기 때문에 me 전체가 아니라 id로만 감시한다 (쉬어가기 등 액션마다 주/기록을 다시 불러오지 않도록)
    if (me?.id) {
      loadWeek();
      loadHistory();
    }
  }, [me?.id]);

  const incomingPause = !!room?.pauseRequestedBy && room.pauseRequestedBy !== me?.id && !room.pausedUntil;
  const roomPaused = !!room?.pausedUntil && new Date(room.pausedUntil) > new Date();
  const pauseEffectId = room?.pausedUntil ? `${room.inviteToken}:${room.pausedUntil}` : null;
  // 아직 이 기기에서 쉬어가기 시작 연출을 못 본 상태 (연출이 끝나기 전에는 흑백/숨김 처리를 미룬다)
  const pauseFxUnseen = roomPaused && !!pauseEffectId && !hasSeenPauseEffect(pauseEffectId);
  const isPaused = roomPaused && !pauseFxUnseen;

  // 연출이 모두 끝난 뒤에야 html 전체(배경, 아이콘, 플로팅 버튼 포함)가 흑백이 된다 — 망한 게임 엔딩처럼 마지막에
  const grayNow = isPaused && !pauseFalling;
  useEffect(() => {
    document.documentElement.classList.toggle("paused-app", grayNow);
    return () => document.documentElement.classList.remove("paused-app");
  }, [grayNow]);

  // 요청한 쪽: 수락받은 뒤 처음 이 방에 들어오면 같은 연출을 한 번 보여준다
  useEffect(() => {
    if (!pauseFxUnseen || !weekData || pauseFalling) return;
    const startTimer = setTimeout(() => {
      markPauseEffectSeen(pauseEffectId!);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const ms = reduceMotion ? 0 : prepareFall(mainRef.current);
      setPauseFalling(true);
      // 연출을 봤다고 기록하는 순간 pauseFxUnseen이 바뀌어 이 effect가 정리(cleanup)된다.
      // 종료 타이머까지 같이 지우면 pauseFalling이 영원히 true로 남아 PAUSED/흑백이 막히므로 여기선 지우지 않는다
      setTimeout(() => {
        clearFall(mainRef.current);
        setPauseFalling(false);
      }, ms);
    }, 0);
    return () => clearTimeout(startTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseFxUnseen, !!weekData]);

  async function confirmPause() {
    const seenId = room?.pauseRequestedUntil ? `${room.inviteToken}:${room.pauseRequestedUntil}` : null;
    // 서버가 수락을 거부하면(만료 등) 연출 없이 끝낸다 — 예전엔 먼저 떨어지고 나서 실패해서 화면만 망가졌다
    setPauseFalling(true);
    if (!(await roomAction("confirm-pause"))) {
      setPauseFalling(false);
      return;
    }
    if (seenId) markPauseEffectSeen(seenId);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 팝업이 닫힌 뒤(다음 렌더)에 떨어질 대상을 잡는다
    await new Promise((r) => setTimeout(r, 50));
    const ms = reduceMotion ? 0 : prepareFall(mainRef.current);
    await new Promise((r) => setTimeout(r, ms));
    clearFall(mainRef.current);
    setPauseFalling(false);
  }

  async function roomAction(action: string, extra?: Record<string, unknown>) {
    const res = await fetch("/api/room", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "요청 실패"); return false; }
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

  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    const typed = roomCode.trim();
    const code = typed.toUpperCase();
    if (!code) {
      setLoginError("방 코드를 입력해주세요");
      return;
    }
    // 관리자 코드인지는 서버가 확인한다 (화면 코드에는 관리자 코드를 넣지 않는다)
    const owner = await fetch("/api/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: typed }),
    }).catch(() => null);
    if (owner?.ok) {
      try {
        sessionStorage.setItem("dajjang_owner_code", typed);
      } catch {
        // 저장이 안 되면 /me에서 다시 입력하게 된다
      }
      router.push("/me");
      return;
    }
    router.push(`/join/${encodeURIComponent(code)}`);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      if (me?.labMeal) {
        // 실험실 식단 인증이 켜져 있으면 AI가 사진을 보고 음식이면 식단에, 아니면 운동 인증으로 보낸다.
        // AI가 판단하지 못하면(키 없음/실패) 지금 보고 있는 보기(운동 | 식단)를 따른다
        const mealPhoto = await compressImage(file, 1024, 0.7);
        const res = await fetch("/api/meals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoDataUrl: mealPhoto }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          alert(data?.error || "업로드 실패");
          return;
        }
        if (data?.kind === "draft") {
          // AI가 읽은 값을 바로 올리지 않고 확인 창을 먼저 보여준다
          setMealConfirm({
            photo: mealPhoto,
            initial: {
              title: data.draft.title,
              items: data.draft.items.map((i: { name: string; kcal: number }) => ({ ...i, fraction: 1 })),
            },
            aiRead: true,
          });
          return;
        }
        if ((data?.kind === "unknown" || data?.kind === "limit") && viewMode === "diet") {
          // AI를 못 쓰는 상태(키 없음, 실패, 오늘 한도 초과): 직접 적을 수 있게 빈 확인 창을 연다
          if (data.kind === "limit") setToast(`${data.reason === "monthly" ? "이번 달" : "오늘"} AI 분석을 다 썼어요. 직접 적어 주세요`);
          setMealConfirm({ photo: mealPhoto, initial: { title: "", items: [{ name: "", kcal: 0, fraction: 1 }] }, aiRead: false });
          return;
        }
        // 그 밖에는 운동 인증으로 이어진다
        setViewMode("workout");
      }
      const [takenAt, dataUrl] = await Promise.all([readTakenAt(file), compressImage(file)]);
      const res = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoDataUrl: dataUrl, takenAt }),
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

  async function saveMeal(values: ConfirmValues) {
    if (!mealConfirm) return;
    setMealSaving(true);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoDataUrl: mealConfirm.photo, mode: "save", analyzed: mealConfirm.aiRead, ...values }),
      });
      if (!res.ok) {
        alert((await res.json().catch(() => null))?.error || "저장하지 못했어요");
        return;
      }
      const saved = await res.json().catch(() => null);
      setMealConfirm(null);
      setViewMode("diet");
      setMealRefresh((n) => n + 1);
      setToast(`저장했어요 · 약 ${(saved?.meal?.kcal ?? 0).toLocaleString()} kcal`);
    } finally {
      setMealSaving(false);
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
    const text = `같이 운동 인증 맞짱 뜨자!\n초대 코드: ${room?.inviteToken}`;
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
    const res = await fetch("/api/room", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(groupForm),
    });
    if (!res.ok) {
      alert((await res.json().catch(() => null))?.error || "저장에 실패했어요");
      return;
    }
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
          <h1 className="text-3xl font-black text-center text-[#de73a5] tracking-tight">다짱</h1>
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
            <button className="w-full rounded-xl bg-[#de73a5] py-3 font-bold text-white shadow-md shadow-[#de73a5]/30">방 코드로 입장하기</button>
          </form>
          <div className="flex items-center gap-3 text-xs text-[#d9a9c4]"><span className="h-px flex-1 bg-[#ffd6e8]" /><span>또는</span><span className="h-px flex-1 bg-[#ffd6e8]" /></div>
          <form onSubmit={handleCreateRoom}>
            <button disabled={creating} className="w-full rounded-xl bg-white border-2 border-[#de73a5] py-3 font-bold text-[#de73a5] disabled:opacity-50">{creating ? "방 만드는 중..." : "방 만들기"}</button>
          </form>
          {loginError && <p className="text-[#de73a5] text-sm text-center">{loginError}</p>}
        </div>
      </div>
    );
  }

  const myEntry = weekData?.summary.find((s) => s.userId === me.id);
  const otherEntry = weekData?.summary.find((s) => s.userId !== me.id);
  const hasGroupAccount = !!room?.groupAccountNumber;
  // 실험실 식단 인증을 켜면 주간 표 카드 맨 위에 제목과 운동 | 식단 전환이 생긴다. 끄면 기존 화면 그대로
  const calendarHeader = me.labMeal ? (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-sm font-bold text-[#4a2540]">{viewMode === "diet" ? "먹은 칼로리" : "운동 인증"}</p>
      <div className="grid w-28 grid-cols-2 gap-0.5 rounded-full bg-[#fff0f6] border border-[#ffd6e8] p-0.5" role="tablist">
        {([["workout", "운동"], ["diet", "식단"]] as const).map(([mode, label]) => (
          <button
            key={mode}
            role="tab"
            aria-selected={viewMode === mode}
            onClick={() => {
              setViewMode(mode);
              try {
                localStorage.setItem("dajjang_view_mode", mode);
              } catch {
                // 저장이 안 되면 다음에 다시 운동 보기로 열릴 뿐이다
              }
            }}
            className={`rounded-full py-1 text-xs font-bold ${
              viewMode === mode ? "bg-[#de73a5] text-white shadow-sm" : "text-[#c2679c]"
            }`}
          >
            {label}
            {mode === "diet" && (me.pendingMeals ?? 0) > 0 && (
              <span
                className={`ml-1 rounded-full px-1.5 text-[10px] ${viewMode === "diet" ? "bg-white text-[#de73a5]" : "bg-[#de73a5] text-white"}`}
              >
                {me.pendingMeals}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div
        ref={mainRef}
        className="flex-1 p-4 max-w-md mx-auto w-full space-y-4 pb-24"
        data-falling={pauseFalling ? "true" : undefined}
        data-paused={isPaused ? "true" : undefined}
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between pt-4" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>
          <h1 className="text-xl font-black text-[#de73a5] [text-shadow:0_1px_0_#fff,0_0_6px_#fff]">
            다짱 <span className="text-[#4a2540] font-bold text-base">· {me.name}님</span>
          </h1>
          <div className="hdr-icons flex items-center gap-2">
            <button
              onClick={() => {
                setStatsTab("stats");
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
              onClick={() =>
                subscribeToPush().then((result) => alert(result.ok ? "알림이 설정됐어요" : result.reason || "알림 설정 실패"))
              }
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
                <p className="text-center text-2xl font-black tracking-[0.25em] text-[#de73a5]">{room.inviteToken}</p>
              </button>
              <button onClick={shareInvite} className="w-full rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white">
                초대 공유하기
              </button>
            </div>
          </div>
        )}

        {/* 정지 중: 화면 가운데에 PAUSED 카드. 누르면 바로 로그아웃해서 다른 방에 참여할 수 있다 */}
        {isPaused && !pauseFalling && room?.pausedUntil && (
          <div data-keep className="paused-overlay" role="status">
            <button
              type="button"
              className="paused-card paused-center"
              onClick={async () => {
                await fetch("/api/logout", { method: "POST" });
                location.href = "/";
              }}
            >
              <span className="flex items-end justify-center gap-2">
                <SleepingFigure src="/assets/sleep-a.webp" height={64} lift={0} />
                <SleepingFigure src="/assets/sleep-b.webp" height={58} lift={0} />
              </span>
              <span className="paused-badge">
                <span className="blink">⏸</span> PAUSED
              </span>
              <span className="paused-until">~ {formatPauseEnd(new Date(room.pausedUntil))}</span>
              <span className="paused-hint">로그아웃</span>
            </button>
          </div>
        )}

        {/* 상대방이 정지 요청한 경우 */}
        {/* 친구가 쉬어가기를 거절해서 나만 쉬는 중: 그 기간 벌금 없음 */}
        {me.restUntil && new Date(me.restUntil) > new Date() && !roomPaused && (
          <div className={`${CARD} space-y-1`}>
            <p className="text-sm font-bold text-[#4a2540]">혼자 쉬는 중이에요</p>
            <p className="text-xs text-[#b4779b]">
              ~ {formatPauseEnd(new Date(me.restUntil))}까지 벌금이 없어요. 친구는 계속 도전 중이에요!
            </p>
          </div>
        )}

        {/* 내가 정지 요청한 경우 */}
        {room?.pauseRequestedBy && room.pauseRequestedBy === me?.id && !room.pausedUntil && (
          <div className={`${CARD} space-y-2`}>
            <p className="text-sm font-bold text-[#4a2540]">쉬어가기를 요청했어요</p>
            <p className="text-xs text-[#b4779b]">상대방이 수락하면 정지가 시작돼요.</p>
            {room.pauseReason && <p className="text-sm text-[#4a2540]">사유: {room.pauseReason}</p>}
            <button
              onClick={() => roomAction("cancel-pause")}
              className="w-full rounded-xl bg-white border border-[#ffd6e8] py-2 text-sm font-semibold text-[#c2679c]"
            >요청 취소</button>
          </div>
        )}

        {weekData && myEntry && otherEntry && (
          <section className="space-y-3">
            <p className="text-xs text-[#8a5a1f] font-semibold bg-white/80 inline-block px-3 py-1 rounded-full">
              이번 주 ({new Date(weekData.weekStart).toLocaleDateString("ko-KR")} ~), 월요일 오전 6시 마감
            </p>

            <Battle
              myCount={myEntry.count}
              otherCount={otherEntry.count}
              myName={myEntry.name}
              otherName={otherEntry.name}
              myFine={myEntry.fine}
              otherFine={otherEntry.fine}
              myRibbons={myEntry.ribbons ?? 0}
              otherRibbons={otherEntry.ribbons ?? 0}
              fxEnabled={historyReady && !weekResultPopup}
              myUsedRibbons={myEntry.recentUsedRibbons ?? []}
              otherUsedRibbons={otherEntry.recentUsedRibbons ?? []}
              myEarnedRibbonIds={(myEntry.recentEarnedRibbonIds ?? []).filter((id) => myEntry.ribbonIds?.includes(id))}
              otherEarnedRibbonIds={(otherEntry.recentEarnedRibbonIds ?? []).filter((id) => otherEntry.ribbonIds?.includes(id))}
              myCaption={me.caption}
              otherCaption={otherCaption}
              mySleeping={!!me.restUntil && new Date(me.restUntil) > new Date()}
              otherSleeping={otherResting}
              onCaptionSaved={loadMe}
              footer={
                myEntry.fine > 0 && !hasGroupAccount ? (
                  <div className="flex items-center justify-between gap-3 border-t border-[#ffd6e8] px-4 py-2.5">
                    <p className="text-xs font-semibold text-[#8a5a1f]">지금 마감되면 벌금 {myEntry.fine.toLocaleString()}원</p>
                    <button
                      onClick={() => setGroupAccountOpen(true)}
                      className="flex-none rounded-full bg-[#ffe1ee] px-3 py-1 text-xs font-bold text-[#b4356f]"
                    >
                      통장 등록
                    </button>
                  </div>
                ) : undefined
              }
            />

            {myEntry.fine > 0 && hasGroupAccount && (
              <div className={`${CARD} space-y-2`}>
                <p className="text-sm font-bold text-[#4a2540]">
                  지금 마감되면 모임 통장에 {myEntry.fine.toLocaleString()}원 보내야 해요
                </p>
                <button onClick={() => setGroupAccountOpen(true)} className="text-xs text-[#b4779b] underline">
                  {room.groupBankName} {room.groupAccountNumber}
                </button>
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


            {me.labMeal && viewMode === "diet" ? (
              <MealView
                meId={me.id}
                refreshKey={mealRefresh}
                header={calendarHeader}
                onSaved={(t) => {
                  setToast(t);
                  loadMe();
                }}
              />
            ) : (
              <WeekCalendar
                meId={me.id}
                header={calendarHeader}
                people={[
                  { userId: myEntry.userId, name: "나", checkins: myEntry.checkins },
                  { userId: otherEntry.userId, name: otherEntry.name, checkins: otherEntry.checkins },
                ]}
              />
            )}

            <ExcusePanel onResolved={loadWeek} />
          </section>
        )}
      </div>

      {room?.full && (!isPaused || pauseFalling) && (
        <label
          data-fab
          className="fixed z-40 drop-shadow-lg"
          style={{
            right: "calc(1.25rem + env(safe-area-inset-right))",
            bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
          }}
        >
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

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 z-[70] -translate-x-1/2 rounded-full bg-[#4a2540]/90 px-4 py-2 text-sm font-bold text-white shadow-lg"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        >
          {toast}
        </div>
      )}

      {mealConfirm && (
        <MealConfirm
          photoUrl={mealConfirm.photo}
          initial={mealConfirm.initial}
          aiRead={mealConfirm.aiRead}
          busy={mealSaving}
          onSave={saveMeal}
          onCancel={() => setMealConfirm(null)}
        />
      )}

      {incomingPause && !pauseFalling && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="celebrate-pop relative w-full max-w-xs bg-white rounded-3xl p-5 space-y-3 text-center shadow-xl">
            <button
              onClick={() => roomAction("cancel-pause", { exempt: false })}
              className="absolute right-3 top-3 w-8 h-8 flex items-center justify-center rounded-full bg-[#ffeef5] text-[#c2679c] font-bold"
              aria-label="거절하기"
            >
              ✕
            </button>
            <CharacterSprite row={CharRow.A} pose={CharPose.PLEAD} height={76} className="mx-auto" />
            <p className="font-bold text-[#4a2540]">
              {otherEntry ? `${otherEntry.name}님이 ` : ""}쉬어가기를 요청했어요
            </p>
            {room?.pauseReason && (
              <p className="rounded-xl bg-[#fff0f6] px-3 py-2 text-sm text-[#4a2540]">&ldquo;{room.pauseReason}&rdquo;</p>
            )}
            <p className="text-xs text-[#b4779b]">
              {room?.pauseRequestedUntil
                ? `~ ${formatPauseEnd(new Date(room.pauseRequestedUntil))} 까지 쉬어가자는 요청이에요.`
                : ""}
            </p>
            <div className="flex gap-2">
              <button onClick={confirmPause} className="flex-1 break-keep rounded-xl bg-[#2f9e44] px-2 py-2.5 text-sm font-bold leading-tight text-white">
                같이 죽자 💀
              </button>
              <button
                onClick={() => roomAction("cancel-pause")}
                className="flex-1 break-keep rounded-xl bg-white border border-[#ffd6e8] px-2 py-2.5 text-sm font-semibold leading-tight text-[#b4779b]"
              >
                나라도 지킨다 친구야
              </button>
            </div>
          </div>
        </div>
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

            {/* 실험실: 아직 다듬는 중인 기능을 켜고 끈다 */}
            <div className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 space-y-2">
              <p className="text-sm font-bold text-[#4a2540]">
                실험실 <span className="ml-1 rounded-full bg-[#ffc72c] px-2 py-0.5 text-[10px] font-bold text-[#6b4a00]">BETA</span>
              </p>
              <label className="flex items-center justify-between gap-3">
                <span className="space-y-0.5">
                  <span className="block text-sm font-semibold text-[#4a2540]">식단 인증</span>
                  <span className="block text-xs text-[#b4779b]">
                    먹은 걸 올리면 AI가 칼로리를 알려줘요. 벌금과는 상관없어요.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={!!me.labMeal}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setMe((m) => (m ? { ...m, labMeal: next } : m));
                    const res = await fetch("/api/me", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ labMeal: next }),
                    });
                    if (!res.ok) {
                      alert("저장에 실패했어요");
                      await loadMe();
                    }
                  }}
                  className="h-6 w-6 flex-none accent-[#de73a5]"
                />
              </label>
              {me.labMeal && <ShortcutSetup token={me.mealToken ?? null} onChanged={loadMe} />}
            </div>

            {/* 쉬어가기 요청 */}
            {!roomPaused && !room?.pauseRequestedBy && (
              <div className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 space-y-2">
                <p className="text-sm font-bold text-[#4a2540]">잠깐 쉬어갈까요?</p>
                <p className="text-xs text-[#b4779b]">상대방이 수락하면 해당 기간 동안 인증과 벌금이 없어요. 이번 주부터 세고, 끝나는 주 다음 월요일에 다시 시작해요.</p>
                <input
                  placeholder="쉬어가려는 사유 (예: 여행, 시험기간)"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  className="w-full rounded-lg bg-white border border-[#ffd6e8] px-3 py-2 text-sm"
                />
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
                    onClick={async () => {
                      if (!pauseReason.trim()) { alert("쉬어가려는 사유를 적어주세요"); return; }
                      if (await roomAction("request-pause", { weeks: pauseWeeks, reason: pauseReason })) {
                        setPauseReason("");
                        setSettingsOpen(false);
                      }
                    }}
                    className="flex-1 rounded-xl bg-[#f472b6] py-2.5 text-sm font-bold text-white"
                  >
                    쉬어가기 요청
                  </button>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-[#ffd6e8] space-y-1">
              <button
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST" });
                  location.href = "/";
                }}
                className="w-full rounded-xl bg-[#ffeef5] py-3 text-sm font-semibold text-[#c2679c]"
              >
                로그아웃 (새 방 만들기로)
              </button>
              <p className="text-center text-[11px] text-[#d9a9c4]">기록은 그대로 남고, 로그인 화면으로만 돌아가요</p>
            </div>
          </div>
        </div>
      )}

      {groupAccountOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setGroupAccountOpen(false)}>
          <div
            className="w-full max-w-md bg-white rounded-3xl p-5 space-y-4 relative shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setGroupAccountOpen(false)}
              className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full bg-[#ffeef5] text-[#c2679c] font-bold"
              aria-label="닫기"
            >
              ✕
            </button>
            <p className="font-bold text-[#4a2540]">모임 통장 (벌금 보낼 곳)</p>

            <div className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 space-y-2">
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
              <button
                onClick={async () => { await saveGroupAccount(); setGroupAccountOpen(false); }}
                className="w-full rounded-xl bg-[#f472b6] py-2.5 text-sm font-bold text-white"
              >
                저장
              </button>
            </div>
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
              <p className="font-bold text-[#4a2540]">{statsTab === "stats" ? "통산전적" : "지난 기록"}</p>
            </div>

            <div className="grid grid-cols-2 gap-0.5 rounded-full bg-[#fff0f6] border border-[#ffd6e8] p-0.5" role="tablist">
              {([["stats", "통산전적"], ["history", "지난 기록"]] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={statsTab === tab}
                  onClick={() => {
                    setStatsTab(tab);
                    if (tab === "history" && !pastWeeks) loadHistory();
                  }}
                  className={`rounded-full py-1 text-xs font-bold ${
                    statsTab === tab ? "bg-[#de73a5] text-white shadow-sm" : "text-[#c2679c]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {statsTab === "stats" && !stats && <p className="text-sm text-[#b4779b]">불러오는 중...</p>}

            {statsTab === "history" && (
              <div className="max-h-[55vh] overflow-y-auto">
                <div className="space-y-3">
                {pastWeeks?.length === 0 && <p className="text-[#d9a9c4] text-sm text-center">아직 마감된 주가 없어요.</p>}
                {pastWeeks?.map((week) => (
                  <div key={week.weekStart} className="rounded-2xl bg-white p-4 border border-[#ffd6e8] shadow-sm space-y-3">
                    <p className="text-xs text-[#d9a9c4]">{new Date(week.weekStart).toLocaleDateString("ko-KR")} 주</p>
                    {week.summary.map((s) => (
                      <div key={s.userId} className="flex items-center justify-between text-sm">
                        <span className="text-[#4a2540] font-semibold">
                          {s.name}
                          {s.avgKcal ? (
                            <span className="ml-1.5 text-xs font-normal text-[#b4779b]">평균 {s.avgKcal.toLocaleString()} kcal</span>
                          ) : null}
                          {" · "}
                          {s.count}/3
                        </span>
                        {s.fine > 0 ? (
                          s.settled ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src="/assets/nav/check-button.webp" alt="정산완료" className="h-8 w-auto" />
                          ) : (
                            <button
                              onClick={() => { if (confirm("정산하셨나요?")) toggleSettled(week.weekStart, s.userId, s.settled); }}
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
              </div>
            )}

            {statsTab === "stats" && stats && (
              <div className="grid grid-cols-2 gap-3">
                {stats.map((s) => (
                  <div key={s.userId} className="rounded-2xl bg-[#fff0f6] border border-[#ffd6e8] p-4 text-center space-y-1">
                    <p className="text-sm font-bold text-[#4a2540]">{s.name}</p>
                    <p className="text-2xl font-black text-[#de73a5]">{s.weeksWon}</p>
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

      {weekResultPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => closeWeekResultPopup(false)}>
          {weekResultPopup.summary.find((s) => s.userId === me?.id && s.fine === 0 && s.count >= 3) && <Confetti />}
          <div
            className="celebrate-pop w-full max-w-xs bg-white rounded-3xl p-5 space-y-3 text-center shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const mine = weekResultPopup.summary.find((s) => s.userId === me?.id);
              const myFineExists = !!mine && mine.fine > 0;
              return (
                <>
                  <CharacterSprite
                    row={CharRow.A}
                    pose={myFineExists ? CharPose.SAD : CharPose.WIN}
                    height={76}
                    className={`mx-auto ${myFineExists ? "" : "celebrate-hop"}`}
                  />
                  <p className="font-bold text-[#4a2540]">
                    {new Date(weekResultPopup.weekStart).toLocaleDateString("ko-KR")} 주 결과가 나왔어요
                  </p>
                  <div className="space-y-1 text-sm bg-[#fff0f6] rounded-xl p-3">
                    {weekResultPopup.summary.map((s) => (
                      <div key={s.userId}>
                        <div className="flex items-center justify-between">
                          <span className="text-left font-semibold text-[#4a2540]">
                            {s.name}
                            {s.avgKcal ? (
                              <span className="block text-[11px] font-normal text-[#b4779b]">평균 {s.avgKcal.toLocaleString()} kcal</span>
                            ) : null}
                          </span>
                          {s.ribbonUsed ? (
                            <span className="font-bold text-[#b4779b]">
                              {s.count}/3 ·{" "}
                              <span className="line-through decoration-[#de73a5] decoration-2">
                                벌금 {(s.waivedFine ?? 0).toLocaleString()}원
                              </span>
                            </span>
                          ) : (
                            <span className={s.fine > 0 ? "text-[#de73a5] font-bold" : "text-[#2f9e44] font-bold"}>
                              {s.count}/3{s.fine > 0 ? ` · 벌금 ${s.fine.toLocaleString()}원` : " · 완료"}
                            </span>
                          )}
                        </div>
                        {s.ribbonUsed && (
                          <div className="mt-1 flex justify-end">
                            <span className="inline-flex items-center gap-1 rounded-lg border border-[#ffc2dc] bg-white px-2 py-0.5 text-xs font-bold text-[#b4356f] shadow-sm">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/assets/ribbon.webp" alt="" className="h-4 w-4 object-contain" />
                              리본을 써서 면제됐어요
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => closeWeekResultPopup(myFineExists)}
                    className="w-full rounded-xl bg-[#de73a5] py-2.5 text-sm font-bold text-white"
                  >
                    {myFineExists ? "정산하러 가기" : "확인"}
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
