import webpush from "web-push";

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
