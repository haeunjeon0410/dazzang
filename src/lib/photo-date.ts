// 사진에 찍힌 촬영 시각(EXIF)으로 "이번 주에 찍은 사진인지" 확인한다 (운동 인증과 같은 규칙).
// 촬영 정보가 없는 사진(캡처 등)은 올린 지금 시각으로 인정한다. 브라우저와 서버 양쪽에서 쓴다.
import { getWeekStart } from "@/lib/week";

function parseExifDate(raw: unknown): string | null {
  const m = typeof raw === "string" && raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec] = m.map(Number);
  // EXIF 시각은 한국 시간이라 9시간을 빼서 UTC로 만든다
  return new Date(Date.UTC(y, mo - 1, d, h - 9, mi, sec)).toISOString();
}

// 사진 파일(브라우저 File)이나 서버의 사진 바이트(Buffer)에서 촬영 시각(ISO)을 꺼낸다. 없으면 null
export async function readTakenAt(source: File | Buffer): Promise<string | null> {
  try {
    const { default: exifr } = await import("exifr");
    const exif = await exifr.parse(source, { pick: ["DateTimeOriginal", "CreateDate"], reviveValues: false });
    return parseExifDate(exif?.DateTimeOriginal ?? exif?.CreateDate);
  } catch {
    return null;
  }
}

// 촬영 시각이 이번 주(오전 6시 기준 주)인지. takenAt이 없으면 지금으로 본다
export function checkThisWeek(takenAt: unknown): { ok: true } | { ok: false; error: string } {
  const now = new Date();
  const shotAt = typeof takenAt === "string" ? new Date(takenAt) : now;
  if (Number.isNaN(shotAt.getTime()) || shotAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    return { ok: false, error: "사진의 촬영 날짜가 올바르지 않아요" };
  }
  if (getWeekStart(shotAt).getTime() < getWeekStart(now).getTime()) {
    const kst = new Date(shotAt.getTime() + 9 * 60 * 60 * 1000);
    return { ok: false, error: `이번 주에 찍은 사진만 인증할 수 있어요 (이 사진은 ${kst.getUTCMonth() + 1}/${kst.getUTCDate()}에 찍은 사진이에요)` };
  }
  return { ok: true };
}
