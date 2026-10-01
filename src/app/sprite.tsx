"use client";

import { useLayoutEffect, useRef } from "react";

// characters.webp / stickers.webp 둘 다 4열 x 2행 스프라이트 시트, 칸 크기 384x512(고정)
const CELL_W = 384;
const CELL_H = 512;
const COLS = 4;
const ROWS = 2;

export function Sprite({
  src,
  col,
  row,
  height,
  width,
  className,
}: {
  src: string;
  col: number;
  row: number;
  height: number;
  width?: number;
  className?: string;
}) {
  const w = width ?? Math.round((height * CELL_W) / CELL_H);
  const scale = height / CELL_H;
  return (
    <div
      className={className}
      style={{
        width: w,
        height,
        overflow: "hidden",
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${CELL_W * COLS * scale}px ${CELL_H * ROWS * scale}px`,
        backgroundPosition: `-${col * CELL_W * scale}px -${row * CELL_H * scale}px`,
      }}
    />
  );
}

export const CHARACTER_SHEET = "/assets/characters.webp?v=9";

// characters.webp: row 0 = 캐릭터 A(양갈래 스월번), row 1 = 캐릭터 B(긴머리)
export const CharRow = { A: 0, B: 1 } as const;
// col 0=기본 1=승리(왕관) 2=시무룩 3=애원(사정 봐달라기)
export const CharPose = { NEUTRAL: 0, WIN: 1, SAD: 2, PLEAD: 3 } as const;

export function CharacterSprite({
  row,
  pose,
  height,
  className,
}: {
  row: (typeof CharRow)[keyof typeof CharRow];
  pose: (typeof CharPose)[keyof typeof CharPose];
  height: number;
  className?: string;
}) {
  return <Sprite src={CHARACTER_SHEET} col={pose} row={row} height={height} className={className} />;
}

// 체크인 횟수에 따라 달라지는 귀여운 멘트 말풍선
const BUBBLE_SRC = { [CharRow.A]: "/assets/bubbles/bubble-a.webp", [CharRow.B]: "/assets/bubbles/bubble-b.webp" } as const;
const BUBBLE_RATIO = { [CharRow.A]: 353 / 103, [CharRow.B]: 382 / 103 } as const;
// 멘트가 길면 글씨를 줄이되, 한 줄로 이것보다 작아지면 두 줄로 나눠서 크게 보여준다
const CAPTION_TWO_LINE_BELOW = 13;
// 두 줄로도 이것보다는 작게 줄이지 않는다 (더 작으면 안 읽힘)
const CAPTION_MIN_FONT = 10;
let measureCanvas: HTMLCanvasElement | undefined;

export function CaptionBubble({
  row,
  text,
  height = 56,
  className,
}: {
  row: (typeof CharRow)[keyof typeof CharRow];
  text: string;
  height?: number;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);

  // 멘트가 말풍선보다 길면 알아서 맞춘다 (화면 폭이 바뀌어도 다시 맞춤)
  // 1) 한 줄로 넣어도 글씨가 충분히 크면 한 줄 + 살짝 축소
  // 2) 그래도 길면 띄어쓰기 기준으로 두 줄로 나눠서, 말풍선 안에 들어가는 가장 큰 글씨로
  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return;
    const fit = () => {
      const base = Math.min(height * 0.28, box.clientHeight * 0.5);
      Object.assign(el.style, { whiteSpace: "nowrap", wordBreak: "", overflowWrap: "", lineHeight: "", paddingInline: "", fontSize: `${base}px` });

      // 말줄임 처리된 화면 폭이 아니라 canvas로 글자 자체의 폭을 잰다 (경계에서 잘리지 않게 5% 여유)
      const cs = getComputedStyle(el);
      const ctx = (measureCanvas ??= document.createElement("canvas")).getContext("2d");
      if (!ctx) return;
      ctx.font = `${cs.fontWeight} ${base}px ${cs.fontFamily}`;
      const natural = ctx.measureText(text).width;
      const avail = box.clientWidth * 0.95;
      if (natural <= avail) return;

      const oneLine = Math.floor(((base * avail) / natural) * 2) / 2;
      if (oneLine >= CAPTION_TWO_LINE_BELOW) {
        el.style.fontSize = `${oneLine}px`;
        return;
      }

      // 두 줄: 말풍선 테두리/꼬리 빼고 안쪽 높이(약 64%)에 들어갈 때까지 줄인다
      Object.assign(el.style, { whiteSpace: "normal", wordBreak: "keep-all", overflowWrap: "anywhere", lineHeight: "1", paddingInline: "3%" });
      const maxH = box.clientHeight * 0.64;
      for (let size = base; size >= CAPTION_MIN_FONT; size -= 0.5) {
        el.style.fontSize = `${size}px`;
        if (el.scrollHeight <= maxH && el.scrollWidth <= el.clientWidth) return;
      }
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text, height]);

  // 폭이 좁은 화면에서도 절대 옆으로 넘치지 않도록, 가로폭에 맞춰 말풍선이 줄어들고
  // (aspect-ratio로 비율 유지) height는 "최대 크기"와 글씨 크기 기준으로만 사용한다
  return (
    <div
      className={`relative w-full min-w-0 ${className ?? ""}`}
      style={{ aspectRatio: BUBBLE_RATIO[row], maxHeight: height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BUBBLE_SRC[row]} alt="" className="w-full h-full object-contain" />
      <div
        ref={boxRef}
        className="absolute inset-y-0 left-[36%] right-[16%] flex items-center overflow-hidden"
      >
        <p
          ref={textRef}
          className="text-[#7a4a63] font-bold leading-[1.15] w-full text-center whitespace-nowrap overflow-hidden text-ellipsis [text-wrap:balance]"
        >
          {text}
        </p>
      </div>
    </div>
  );
}

