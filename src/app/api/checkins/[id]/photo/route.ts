import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

// 운동 인증샷 한 장. 목록 응답에 사진 데이터(base64)를 통째로 넣으면 앱을 열 때마다 몇 MB가 오가서 느려지므로,
// 목록에는 이 주소만 주고 사진은 화면에 보일 때 따로 받는다. 같은 방 사람의 사진만 볼 수 있고, 사진은 바뀌지 않아서 오래 캐시한다
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const checkin = await prisma.checkin.findUnique({
    where: { id },
    select: { photoUrl: true, user: { select: { roomId: true } } },
  });
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { roomId: true } });
  if (!checkin || !me || checkin.user.roomId !== me.roomId) return new NextResponse(null, { status: 404 });

  // data:image/jpeg;base64,.... 에서 종류와 본문을 나눈다 (본문이 매우 길어서 정규식 대신 위치로 자른다)
  const comma = checkin.photoUrl.indexOf(",");
  const head = checkin.photoUrl.slice(0, comma);
  const mime = head.match(/^data:(image\/[a-zA-Z+.-]+);base64$/)?.[1];
  if (comma < 0 || !mime) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(checkin.photoUrl.slice(comma + 1), "base64"), {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
