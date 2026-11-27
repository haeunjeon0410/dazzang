self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    // JSON이 아닌 알림이 와도 버리지 않고 글자 그대로 보여준다
    data = { title: "다짱", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/assets/app-icon-192.png",
      badge: "/assets/app-icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 이미 열려 있는 앱 창이 있으면 그 창으로 간다 (알림마다 새 창이 뜨지 않게)
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      return open ? open.focus() : clients.openWindow("/");
    }),
  );
});
