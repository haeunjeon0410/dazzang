"use client";

import { useEffect } from "react";

// 사진을 자르지 않은 원본 그대로 화면에 크게 보여주는 창. 아무 데나 누르거나 Esc를 누르면 닫힌다
export default function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-2" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="원본 사진" className="max-h-full max-w-full object-contain" />
      <button
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg text-white"
      >
        ✕
      </button>
    </div>
  );
}
