import { supabase } from "@/integrations/supabase/client";

/**
 * Web Push for the bell: this browser's on/off switch.
 *
 * The server half is the `push-send` edge function, fired by a trigger on
 * `notifications`. This half asks the browser for a subscription and stores it
 * in `push_subscriptions`.
 */

/**
 * The VAPID public key that pairs with the VAPID_PRIVATE_KEY function secret.
 * It is public by design: browsers need it to subscribe. If the key pair is
 * ever replaced, change this to the new public key; existing subscriptions
 * stop working and people switch push on again.
 */
export const VAPID_PUBLIC_KEY =
  "BCkYm1kGXs_bdhhSPuxeZ4AiIJDF_FUoq--oUKGQdxpJPEvA1VHf9E-Y_Dx3YRUfr_zFmVjCEoRcAOGmBv7ehss";

export type PushState =
  /** This browser cannot do push at all (or the app is the Android wrapper). */
  | "unsupported"
  /** An iPhone or iPad in Safari: push works only from the Home Screen app. */
  | "needs-install"
  /** The person blocked notifications for this site in the browser. */
  | "blocked"
  | "off"
  | "on";

/** base64url → bytes, the form `pushManager.subscribe` wants the key in. */
export const urlBase64ToUint8Array = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

interface Environment {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | null;
  userAgent: string;
  standalone: boolean;
  subscribed: boolean;
}

/** The state for a given environment. Pure, so it can be tested. */
export const resolvePushState = (env: Environment): PushState => {
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) {
    const ios = /iPad|iPhone|iPod/.test(env.userAgent);
    return ios && !env.standalone ? "needs-install" : "unsupported";
  }
  if (env.permission === "denied") return "blocked";
  return env.subscribed && env.permission === "granted" ? "on" : "off";
};

/** What to tell the person when the switch cannot be used. */
export const pushStateHint = (state: PushState): string | null => {
  switch (state) {
    case "unsupported":
      return "This browser or app cannot show notifications. Open the portal in Chrome, Edge, Firefox or Safari.";
    case "needs-install":
      return "On iPhone and iPad, add the portal to your Home Screen (Share, then Add to Home Screen) and open it from there.";
    case "blocked":
      return "Notifications are blocked for this site. Allow them in your browser's site settings, then switch this on.";
    default:
      return null;
  }
};

const registration = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!("serviceWorker" in navigator)) return null;
  // `ready` never settles when no worker is registered (the dev server), so
  // look the registration up first.
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ? navigator.serviceWorker.ready : null;
};

export const getPushState = async (): Promise<PushState> => {
  const hasServiceWorker = "serviceWorker" in navigator;
  const hasPushManager = "PushManager" in window;
  const hasNotification = "Notification" in window;
  let subscribed = false;
  if (hasServiceWorker && hasPushManager) {
    try {
      const reg = await registration();
      subscribed = Boolean(await reg?.pushManager.getSubscription());
    } catch {
      subscribed = false;
    }
  }
  return resolvePushState({
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    permission: hasNotification ? Notification.permission : null,
    userAgent: navigator.userAgent,
    standalone:
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    subscribed,
  });
};

/** Asks permission, subscribes this browser and saves it for the signed-in user. */
export const enablePush = async (): Promise<PushState> => {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

  const reg = await registration();
  if (!reg) throw new Error("The portal is still setting up on this device. Reload the page and try again.");

  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const keys = subscription.toJSON().keys ?? {};
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh ?? "",
    p_auth: keys.auth ?? "",
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
  return "on";
};

/**
 * Stops push on this browser. Also run at sign-out, so the next person to use
 * a shared phone or computer does not receive the last person's notices.
 */
export const disablePush = async (): Promise<void> => {
  const reg = await registration().catch(() => null);
  const subscription = await reg?.pushManager?.getSubscription();
  if (!subscription) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
};
