"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// 서비스워커 등록만 담당. 실제 알림 구독은 로그인 후 대시보드에서 버튼으로 트리거한다.
export function PushSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // 아이폰 사파리는 viewport 설정을 무시하고 두 손가락으로 확대되므로 그 동작(gesturestart)을 직접 막는다
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", block);
    return () => document.removeEventListener("gesturestart", block);
  }, []);

  return null;
}

export async function subscribeToPush(): Promise<{ ok: boolean; reason?: string }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return {
      ok: false,
      reason: "이 브라우저는 알림을 지원하지 않아요. 아이폰이면 사파리로 열어서 홈 화면에 추가한 다음, 그 앱에서 다시 시도해주세요.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "알림 권한이 거부됐어요. 폰 설정에서 이 앱의 알림 권한을 허용해주세요." };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, reason: "서버에 알림 키가 설정되어 있지 않아요." };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) {
      return { ok: false, reason: "서버에 알림 등록을 저장하지 못했어요." };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "알 수 없는 오류가 발생했어요." };
  }
}

// 이 기기에서 알림이 켜져 있는지 (권한이 허용되어 있고 구독이 있을 때)
export async function isPushOn(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return !!(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    return await subscription.unsubscribe();
  } catch {
    return false;
  }
}

// 설정의 알림 켜기/끄기 체크박스 (다른 설정 줄과 같은 모양)
export function PushToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    isPushOn().then((v) => alive && setOn(v));
    return () => {
      alive = false;
    };
  }, []);

  async function change(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const r = await subscribeToPush();
        if (!r.ok) alert(r.reason || "알림 설정 실패");
        setOn(r.ok);
      } else {
        setOn(!(await unsubscribeFromPush()));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-none items-center gap-2">
      <span className="text-sm font-semibold text-[#4a2540]">알림</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="마감 알림"
        disabled={busy}
        onClick={() => change(!on)}
        className={`relative h-6 w-11 flex-none rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[#de73a5]" : "bg-[#e9cfdc]"}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}
