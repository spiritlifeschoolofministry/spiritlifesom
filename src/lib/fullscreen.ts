/**
 * Fullscreen, for browsers that have it and the ones that do not.
 *
 * iOS Safari and iPadOS have no element fullscreen at all — the API exists for
 * <video> and nowhere else, so `documentElement.requestFullscreen` is simply
 * undefined. Calling it throws a TypeError rather than rejecting a promise,
 * which is the trap: `requestFullscreen().catch(...)` looks defensive and
 * catches nothing, because the throw happens before a promise exists.
 *
 * That combination stranded students. The lobby asked for fullscreen, ignored
 * the failure and sent them into the paper; the runner saw no fullscreen
 * element and covered the questions with a blocking overlay whose only escape
 * was a button that threw the same TypeError on click. Every iPhone and iPad in
 * a cohort allowed to sit on mobile was locked out of an exam it could see.
 *
 * So support is something to test for, not to assume, and "this device cannot
 * do fullscreen" has to be answerable before a student commits to a sitting.
 */

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

/**
 * Whether this browser can put the page into fullscreen at all.
 *
 * `fullscreenEnabled` is the second half of the question: a browser can ship
 * the API and still refuse it, most often inside an iframe without the
 * allow-fullscreen permission. Both have to hold for the request to stand a
 * chance, and neither is worth asking twice — treat a false here as permanent
 * for this device.
 */
export const fullscreenSupported = (): boolean => {
  if (typeof document === "undefined") return false;
  const doc = document as FullscreenDocument;
  const el = document.documentElement as FullscreenElement;
  const hasApi =
    typeof el.requestFullscreen === "function" ||
    typeof el.webkitRequestFullscreen === "function";
  if (!hasApi) return false;
  // Only trust these when the browser actually reports them; an older WebKit
  // exposes the request method without either flag.
  if (doc.fullscreenEnabled === false && doc.webkitFullscreenEnabled !== true) return false;
  return true;
};

/** The element currently held fullscreen, across the prefixed and standard names. */
export const fullscreenElement = (): Element | null => {
  if (typeof document === "undefined") return null;
  const doc = document as FullscreenDocument;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
};

export const isFullscreen = (): boolean => fullscreenElement() !== null;

/**
 * Ask for fullscreen, reporting whether it was granted rather than throwing.
 *
 * Callers need to tell three outcomes apart — granted, refused, impossible —
 * and a thrown TypeError conflates the last two. Refusal is recoverable: the
 * student can allow it and press the button again. Impossibility is not, and
 * gating a paper on it locks the student out for good.
 */
export const requestFullscreen = async (): Promise<boolean> => {
  if (!fullscreenSupported()) return false;
  const el = document.documentElement as FullscreenElement;
  try {
    const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
    await req.call(el);
    return isFullscreen();
  } catch {
    // Refused: no user gesture, a permissions policy, or the student dismissing
    // the prompt. Unlike the unsupported case this is worth offering again.
    return false;
  }
};

/** Leave fullscreen if we are in it. Never throws. */
export const exitFullscreen = async (): Promise<void> => {
  if (!isFullscreen()) return;
  const doc = document as FullscreenDocument;
  try {
    const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
    if (exit) await exit.call(doc);
  } catch {
    /* Leaving fullscreen is never worth interrupting a student over. */
  }
};

/** Subscribe to fullscreen changes under both event names. Returns an unsubscribe. */
export const onFullscreenChange = (handler: () => void): (() => void) => {
  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
  return () => {
    document.removeEventListener("fullscreenchange", handler);
    document.removeEventListener("webkitfullscreenchange", handler);
  };
};
