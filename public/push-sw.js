/* Push handlers, pulled into the generated service worker by importScripts
   (see workbox.importScripts in vite.config.ts). Plain script, not a module. */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Spirit Life School of Ministry";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/images/school-logo.png",
      badge: "/images/school-logo.png",
      tag: data.tag,
      data: { link: typeof data.link === "string" && data.link.startsWith("/") ? data.link : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      // Reuse an open portal tab rather than stacking a new one on top of it.
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          const moved = "navigate" in client ? await client.navigate(url) : null;
          await (moved || client).focus();
          return;
        } catch (_) {
          // Not controllable (e.g. mid-load): fall through to a new window.
        }
      }
      await self.clients.openWindow(url);
    }),
  );
});
