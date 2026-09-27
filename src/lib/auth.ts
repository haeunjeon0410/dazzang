import { prisma } from "./prisma";
import { getSessionUserId } from "./session";

// 로그인한 유저 + 그 유저가 속한 방(Room) 정보를 함께 가져오는 헬퍼
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}
