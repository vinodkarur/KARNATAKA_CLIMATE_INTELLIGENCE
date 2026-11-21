/* ==========================================================================
   sw.js — Karnataka Emergency Response Web Push Service Worker
   RFC 8291 / RFC 8292 Background & Screen-Locked Push Handler
   ========================================================================== */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "Karnataka Emergency Warning", body: event.data.text() };
    }
  }

  const title = data.title || "🚨 Karnataka Emergency Response Alert";
  
  // Enforce strictly relative URL path to prevent obsolete domain DNS NXDOMAIN
  let targetUrl = "/alerts";
  try {
    const rawUrl = data.url || (data.alert_id ? `/alerts?id=${encodeURIComponent(data.alert_id)}` : "/alerts");
    const parsed = new URL(rawUrl, self.location.origin);
    targetUrl = parsed.pathname + parsed.search;
  } catch (e) {
    targetUrl = "/alerts";
  }
  
  const isCritical = (data.severity === "CRITICAL" || data.priority === "CRITICAL" || (data.severity && data.severity.includes("CRITICAL")));

  const options = {
    body: data.body || data.message || "A meteorological warning has been issued for your area.",
    icon: "/static/favicon.ico",
    badge: "/static/favicon.ico",
    vibrate: [300, 150, 300, 150, 300],
    data: {
      url: targetUrl,
      alert_id: data.alert_id,
      district: data.district,
      locality: data.locality,
      hazard_type: data.hazard_type,
      severity: data.severity,
      timestamp: data.timestamp || data.generated_at,
      action_recommended: data.action_recommended,
    },
    actions: [
      { action: "explore", title: "View Alert" },
      { action: "close", title: "Acknowledge" }
    ],
    tag: data.alert_id || `kci-alert-${data.district || "emergency"}`,
    renotify: true,
    requireInteraction: isCritical || data.requireInteraction !== false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") {
    return;
  }

  // Sanitize destination URL to prevent obsolete hostnames or DNS NXDOMAIN:
  // Extract strictly the pathname + search and resolve against current self.location.origin
  let targetUrl;
  try {
    const rawUrl = event.notification.data?.url || "/alerts";
    const parsed = new URL(rawUrl, self.location.origin);
    targetUrl = new URL(parsed.pathname + parsed.search + parsed.hash, self.location.origin).href;
  } catch (e) {
    targetUrl = new URL("/alerts", self.location.origin).href;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes("/alerts") && "focus" in client) {
          if ("navigate" in client && targetUrl !== client.url) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

