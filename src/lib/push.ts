import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";

if (publicKey && privateKey) {
  webpush.setVapidDetails("mailto:admin@example.com", publicKey, privateKey);
}

export async function sendPushToSubscriptions(
  subscriptions: { endpoint: string; p256dh: string; auth: string }[],
  payload: { title: string; body: string },
) {
  await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      ),
    ),
  );
}

// 푸시 구독은 기기당 한 계정에만 걸려 있어서, 같은 사람의 계정이 방마다 따로 있으면(linkGroup)
// 알림이 마지막에 로그인한 계정 방 것만 도착한다. 그래서 연결된 계정들의 구독을 모아 보낸다.
export async function sendPushToUser(
  user: { id: string; linkGroup: string | null },
  payload: { title: string; body: string },
) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      user: user.linkGroup ? { OR: [{ id: user.id }, { linkGroup: user.linkGroup }] } : { id: user.id },
    },
  });
  await sendPushToSubscriptions(subscriptions, payload);
}
