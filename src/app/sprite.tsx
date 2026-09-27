"use client";

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

export const CHARACTER_SHEET = "/assets/characters.webp?v=7";

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

export function countCaption(count: number): string {
  if (count <= 0) return "아직이야~";
  if (count === 1) return "1개 완료!";
  if (count === 2) return "2개! 조금만 더";
  return "다 했다 최고!";
}

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
  const width = Math.round(height * BUBBLE_RATIO[row]);
  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width, height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BUBBLE_SRC[row]} alt="" className="w-full h-full object-contain" />
      <div className="absolute inset-y-0 left-[32%] right-[18%] flex items-center overflow-hidden">
        <p
          className="text-[#7a4a63] font-bold leading-tight w-full text-center whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ fontSize: Math.max(13, height * 0.26) }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

