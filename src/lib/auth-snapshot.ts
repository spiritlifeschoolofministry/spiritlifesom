import type { Tables } from "@/integrations/supabase/types";

/**
 * Last known-good auth data, cached so a page refresh can render the portal
 * immediately instead of gating the whole app behind two Supabase round trips.
 *
 * Only ever a *head start*: the real profile/student rows are re-read in the
 * background on every load and overwrite whatever is here. Nothing security
 * relevant hangs off it — the access token (and therefore what the database
 * will actually hand back) still lives in Supabase's own session storage, and
 * a snapshot is only trusted for the user id the live session reports.
 */
export interface AuthSnapshot {
  v: 1;
  userId: string;
  role: string | null;
  profile: Tables<"profiles"> | null;
  student: Tables<"students"> | null;
  savedAt: number;
}

const KEY = "slsom.auth.snapshot.v1";
/** Beyond this a snapshot is ignored — a month-old idea of a profile is noise. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const storage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // Safari private mode / storage disabled
  }
};

export const readAuthSnapshot = (userId: string): AuthSnapshot | null => {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSnapshot;
    if (parsed?.v !== 1) return null;
    // A snapshot belonging to a different account is worse than none at all.
    if (parsed.userId !== userId) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeAuthSnapshot = (
  snapshot: Omit<AuthSnapshot, "v" | "savedAt">,
): void => {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify({ ...snapshot, v: 1, savedAt: Date.now() }));
  } catch {
    // Quota or private mode — the app works fine without the head start.
  }
};

export const clearAuthSnapshot = (): void => {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
