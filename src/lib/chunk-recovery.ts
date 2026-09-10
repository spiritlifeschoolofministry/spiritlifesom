/**
 * Recovery for the "blank screen until I reload" failure.
 *
 * The app is code-split, so a page only exists as a chunk URL that the running
 * build knows about. Two things invalidate those URLs underneath a live tab:
 * a deploy (the old hashed chunks stop being served) and the service worker
 * activating a new build (autoUpdate, which drops the previous precache). The
 * next `import()` — a first paint, or a click onto another page — then rejects,
 * and an unhandled rejection inside Suspense unmounts the whole tree: a blank
 * page that comes back only because reloading fetches the current index.html.
 *
 * So: treat a failed chunk load as "this tab is running a build that no longer
 * exists" and reload once to pick up the new one.
 */

const RELOAD_MARK = "slsom:stale-build-reload";
/** Long enough that a genuinely broken build can't put us in a reload loop. */
const RELOAD_COOLDOWN_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "failed to load module script",
  "chunkloaderror",
  "dynamically imported module",
];

/** Is this the browser telling us a JS chunk URL is gone, rather than a bug? */
export const isChunkLoadError = (error: unknown): boolean => {
  if (!error) return false;
  if (typeof error === "object" && (error as { name?: string }).name === "ChunkLoadError") return true;
  const message = error instanceof Error ? error.message : String(error);
  const haystack = message.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => haystack.includes(pattern));
};

/**
 * Reload to pick up the current build. Returns false if we already tried
 * recently — a second blank screen is better than an endless reload loop, and
 * the caller shows a real error instead.
 */
export const recoverFromStaleBuild = (): boolean => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_MARK)) || 0;
  } catch {
    // Private mode / blocked storage: without a mark we can't rule out a loop.
    return false;
  }

  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;

  try {
    sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
  } catch {
    return false;
  }

  // Reload from the server, not from the tab's own cached shell.
  window.location.reload();
  return true;
};
