import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import sharp from "sharp";

// 식단 사진 한 장. 목록 응답에 사진 데이터(base64)를 통째로 넣으면 식단 창을 열 때마다 몇 MB가 오가서 느려지므로,
// 목록에는 이 주소만 주고 사진은 화면에 보일 때 따로 받는다. 같은 방 사람의 사진만 볼 수 있고
// (확인 전 초안은 올린 본인만), 사진은 바뀌지 않아서 오래 캐시한다
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const meal = await prisma.meal.findUnique({
    where: { id },
    select: { photoUrl: true, userId: true, confirmed: true, user: { select: { roomId: true } } },
  });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { roomId: true } });
  if (!meal || !me || meal.user.roomId !== me.roomId) return new NextResponse(null, { status: 404 });
  if (!meal.confirmed && meal.userId !== userId) return new NextResponse(null, { status: 404 });

  // data:image/jpeg;base64,.... 에서 종류와 본문을 나눈다 (본문이 매우 길어서 정규식 대신 위치로 자른다)
  const comma = meal.photoUrl.indexOf(",");
  const head = meal.photoUrl.slice(0, comma);
  const mime = head.match(/^data:(image\/(?:jpeg|png|webp));base64$/)?.[1];
  if (comma < 0 || !mime) return new NextResponse(null, { status: 404 });
  const original = Buffer.from(meal.photoUrl.slice(comma + 1), "base64");
  // 혹시 스크립트가 든 파일이어도 이 주소를 직접 열어서 실행되지 않게 한다
  const safe = { "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" };

  // ?w=480 처럼 너비를 주면 작은 그림으로 줄여서 준다 (목록의 작은 칸에 원본을 그대로 보내면 느리다)
  const w = Math.round(Number(req.nextUrl.searchParams.get("w")));
  if (w >= 64 && w <= 800) {
    try {
      const small = await sharp(original).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
      return new NextResponse(small, { headers: { "Content-Type": "image/jpeg", ...safe } });
    } catch (e) {
      console.error("[photo] resize", e instanceof Error ? e.message : e);
    }
  }
  return new NextResponse(original, { headers: { "Content-Type": mime, ...safe } });
}
