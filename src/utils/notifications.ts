/**
 * Browser Notification API helpers.
 *
 * Strategy:
 *  - We request permission only when there's a clear intent (user already in
 *    a chat for >2s — that's a strong signal they care about this match).
 *    Asking on page load would be aggressive and most browsers warn about it.
 *  - Notifications fire only when the tab is HIDDEN (background). If the user
 *    is looking at the chat, the in-app UI already tells them.
 *  - No service worker / no Firebase. Works only while the tab is alive.
 *    For real push (closed-tab notifications) we'd need FCM + service worker —
 *    a separate, larger project.
 *  - iOS Safari < 16.4 silently no-ops. Android Chrome / Desktop work great.
 */

let cached: { state: NotificationPermission } | null = null;

/** Reads (and caches) current permission state. */
export function getNotificationPermission(): NotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (cached) return cached.state;
  cached = { state: Notification.permission };
  return cached.state;
}

/**
 * Asks the user for notification permission. Idempotent — calling it more than
 * once after a "denied" answer just returns the same state without re-prompting
 * (browsers don't re-prompt anyway).
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    cached = { state: result };
    return result;
  }
  cached = { state: Notification.permission };
  return cached.state;
}

interface NotifyOptions {
  title: string;
  body: string;
  /** Used as the click target — when the user clicks the notification, the
   *  window comes to focus and we navigate to this match's chat. */
  matchId?: string;
  /** Coalesces repeats: a second notification with the same tag replaces the
   *  first instead of stacking. Use the matchId so multiple new comments in
   *  the same match collapse into one notification. */
  tag?: string;
}

/**
 * Shows a system notification — only when:
 *  - permission was granted, AND
 *  - the document is currently hidden (tab in background or window minimized)
 * If the tab is visible, the in-app UI already shows badges/unread counts.
 */
export function showNotification(opts: NotifyOptions): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  // Don't bug the user when they're literally looking at the page already.
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });
    n.onclick = () => {
      // Bring the window/tab back to front, then dispatch a custom event the
      // app listens for to navigate. Keeps this helper decoupled from React.
      window.focus();
      if (opts.matchId) {
        window.dispatchEvent(new CustomEvent("copabolao:open-match-chat", { detail: { matchId: opts.matchId } }));
      }
      n.close();
    };
  } catch {
    // Some browsers throw on iOS or in private mode. Swallow — feature is
    // best-effort, no need to break the app over a missing notification.
  }
}
