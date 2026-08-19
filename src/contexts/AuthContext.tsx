import React, { createContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';
import { clearAuthSnapshot, readAuthSnapshot, writeAuthSnapshot } from '@/lib/auth-snapshot';

export interface AuthContextType {
  user: User | null;
  profile: Tables<'profiles'> | null;
  student: Tables<'students'> | null;
  role: string | null;
  isLoading: boolean;
  isNewUser: boolean;
  authError: string | null;
  isAuthReady: boolean;
  /**
   * True once a profile read has come back with a definitive answer for the
   * current user — including "this user has no profile row". Guards must not
   * act on a missing profile until this flips, or they redirect people who are
   * merely mid-fetch.
   */
  isProfileResolved: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface UserMetadata {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  phone?: string;
  role?: string;
  full_name?: string;
  [key: string]: string | undefined;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };

/** Backstop so a wedged network can never pin the app on a spinner forever. */
const AUTH_TIMEOUT_MS = 15000;
/** Per-query ceiling. Well above a healthy round trip, well below users giving up. */
const QUERY_TIMEOUT_MS = 6000;
/** A just-signed-up user can arrive before the signup trigger has written their rows. */
const FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T,>(work: PromiseLike<T>, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), QUERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [student, setStudent] = useState<Tables<'students'> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProfileResolved, setIsProfileResolved] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const profileLoadedRef = useRef(false);
  // Holds the running fetch so concurrent callers await the same work instead of
  // being dropped — a dropped call used to resolve instantly and let the caller
  // continue as if auth data were ready. Keyed by user so an account switch
  // never reuses the previous account's in-flight read.
  const inFlightRef = useRef<{ userId: string; silent: boolean; promise: Promise<void> } | null>(null);
  const userIdRef = useRef<string | null>(null);
  // Whichever of the auth listener / getSession restore arrives first owns the
  // bootstrap; the other becomes a no-op instead of racing it.
  const bootstrappedRef = useRef(false);

  const clearAuthTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const startAuthTimeout = useCallback(() => {
    clearAuthTimeout();
    timeoutRef.current = setTimeout(() => {
      console.warn('[Auth] Timeout reached — forcing loading to false');
      setIsLoading(false);
      setIsAuthReady(true);
      // Deliberately NOT marking the profile resolved: we still don't know
      // what this user has, so nothing downstream should act on the blank.
      setAuthError((prev) => prev || 'Session loading timed out. Please try again.');
    }, AUTH_TIMEOUT_MS);
  }, []);

  /** Publish cached rows for a returning user so the portal paints at once. */
  const hydrateFromSnapshot = useCallback((userId: string): boolean => {
    const snap = readAuthSnapshot(userId);
    if (!snap) return false;
    console.log('[Auth] Hydrated from cached snapshot');
    setProfile(snap.profile);
    setStudent(snap.student);
    setRole(snap.role);
    setIsNewUser(!snap.student && snap.role === 'student');
    profileLoadedRef.current = true;
    setIsProfileResolved(true);
    setIsAuthReady(true);
    setIsLoading(false);
    clearAuthTimeout();
    return true;
  }, []);

  const runProfileFetch = useCallback(async (
    userId: string,
    userMeta?: UserMetadata,
    opts?: { silent?: boolean },
  ): Promise<void> => {
    console.log('[Auth] Fetching profile for:', userId);
    // Mark loading before fetching. On a fresh sign-in the app is usually
    // already idle (isLoading=false), so without this the route guard would see
    // null profile/student mid-fetch and briefly bounce users to /complete-profile
    // before their dashboard appears. A silent fetch (cached hydration already
    // painted, or a post-save re-read) skips this so the screen stays put.
    if (!opts?.silent) {
      setIsAuthReady(false);
      setIsLoading(true);
    }

    let profileData: Tables<'profiles'> | null = null;
    let studentData: Tables<'students'> | null = null;
    let resolved = false;
    let lastError: string | null = null;

    try {
      for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
        // Both rows in parallel: the student row used to wait on the profile
        // round trip, doubling every cold load for no reason.
        const [profileRes, studentRes] = await Promise.all([
          profileData
            ? Promise.resolve({ data: profileData, error: null })
            : withTimeout(
                supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
                'profile query',
              ),
          studentData
            ? Promise.resolve({ data: studentData, error: null })
            : withTimeout(
                supabase.from('students').select('*').eq('profile_id', userId).maybeSingle(),
                'student query',
              ),
        ]);

        if (profileRes.error) lastError = profileRes.error.message;
        if (studentRes.error) lastError = studentRes.error.message;
        profileData = (profileRes.data as Tables<'profiles'> | null) ?? null;
        studentData = (studentRes.data as Tables<'students'> | null) ?? null;

        // A clean response — even an empty one — is an answer, not a failure.
        const answered = !profileRes.error && !studentRes.error;
        if (answered) resolved = true;

        const staffOrDone =
          profileData && (profileData.role !== 'student' || studentData);
        if (answered && staffOrDone) break;
        // Nothing yet (or only half): give the signup trigger a moment.
        if (attempt < FETCH_ATTEMPTS - 1) await wait(RETRY_DELAY_MS);
      }

      // A newer sign-in overtook this fetch — its result is the current truth.
      if (userIdRef.current !== userId) {
        console.log('[Auth] Discarding stale profile fetch for:', userId);
        return;
      }

      if (profileData) {
        const safeProfile = {
          ...profileData,
          first_name: profileData.first_name || 'Student',
          last_name: profileData.last_name || 'User',
        };
        console.log('[Auth] Profile loaded, role:', profileData.role);
        // Publish profile + student together. Setting profile first would render
        // one frame with a profile but no student row, which the route guard
        // reads as "profile incomplete" and turns into a /complete-profile flash.
        setProfile(safeProfile);
        setRole(profileData.role);
        setStudent(studentData);
        setIsNewUser(!studentData && profileData.role === 'student');
        profileLoadedRef.current = true;
        writeAuthSnapshot({ userId, role: profileData.role, profile: safeProfile, student: studentData });
        setAuthError(null);
        setIsProfileResolved(true);
      } else if (resolved) {
        // Definitive: this account genuinely has no profile row yet.
        console.warn('[Auth] No profile row for user, treating as new signup');
        const fallbackRole = userMeta?.role || 'student';
        setProfile(null);
        setRole(fallbackRole);
        setStudent(null);
        setIsNewUser(true);
        profileLoadedRef.current = true;
        clearAuthSnapshot();
        setAuthError(null);
        setIsProfileResolved(true);
      } else {
        throw new Error(lastError || 'Could not read your profile.');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Auth] Error fetching profile:', errorMessage);
      if (userIdRef.current !== userId) return;
      // Keep whatever we already had — discarding a good profile because a
      // re-read failed would drop the user onto /complete-profile.
      if (!profileLoadedRef.current) {
        setProfile(null);
        setRole(null);
        setStudent(null);
        setIsNewUser(false);
        setAuthError('We could not load your profile. Check your connection and try again.');
      }
    } finally {
      if (userIdRef.current === userId) {
        clearAuthTimeout();
        setIsLoading(false);
        setIsAuthReady(true);
      }
    }
  }, []);

  // Coalesce concurrent fetches (e.g. a TOKEN_REFRESHED event racing the session
  // restore on page load) onto one promise every caller can await. A loud caller
  // arriving behind a silent one still gets the loading state it asked for.
  const getProfile = useCallback((
    userId: string,
    userMeta?: UserMetadata,
    opts?: { silent?: boolean },
  ): Promise<void> => {
    const inFlight = inFlightRef.current;
    if (inFlight && inFlight.userId === userId) {
      if (!opts?.silent && inFlight.silent) {
        inFlight.silent = false;
        setIsAuthReady(false);
        setIsLoading(true);
      }
      return inFlight.promise;
    }
    const promise = runProfileFetch(userId, userMeta, opts).finally(() => {
      if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
    });
    inFlightRef.current = { userId, silent: !!opts?.silent, promise };
    return promise;
  }, [runProfileFetch]);

  // Re-read profile + student without blanking the screen. Used after a save
  // (e.g. /complete-profile) so the app can navigate on fresh data instead of
  // doing a full page reload to pick it up.
  const refreshProfile = useCallback(async (): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;
    // A refresh must not be answered by an older in-flight read that started
    // before the save landed.
    inFlightRef.current = null;
    await getProfile(userId, undefined, { silent: true });
  }, [getProfile]);

  // Keep the same User object when a token refresh returns the same identity.
  // Pages key data fetches off `user`, so handing them a fresh object on every
  // tab focus / hourly refresh made them re-fetch and flash their skeletons.
  const applyUser = useCallback((next: User, force = false) => {
    userIdRef.current = next.id;
    setUser(prev => (!force && prev && prev.id === next.id ? prev : next));
  }, []);

  const clearState = useCallback(() => {
    userIdRef.current = null;
    inFlightRef.current = null;
    setUser(null);
    setProfile(null);
    setStudent(null);
    setRole(null);
    setIsNewUser(false);
    setAuthError(null);
    profileLoadedRef.current = false;
    clearAuthSnapshot();
    clearAuthTimeout();
    setIsProfileResolved(false);
    setIsLoading(false);
    setIsAuthReady(true);
  }, []);

  /**
   * One entry point for "we have a session" — used by the initial restore and
   * by every listener event, so there is a single ordering to reason about:
   * adopt the user, paint from cache if we can, then reconcile with the server.
   */
  const adoptSession = useCallback(async (
    nextUser: User,
    opts?: { force?: boolean; refetch?: boolean },
  ): Promise<void> => {
    const switchedUser = userIdRef.current !== nextUser.id;
    if (switchedUser) profileLoadedRef.current = false;
    applyUser(nextUser, opts?.force);

    if (profileLoadedRef.current && !opts?.refetch) return;

    // Cached rows let the portal render now; the fetch below still runs and
    // corrects anything that changed since.
    const painted = profileLoadedRef.current || hydrateFromSnapshot(nextUser.id);
    if (!painted) startAuthTimeout();
    await getProfile(
      nextUser.id,
      nextUser.user_metadata as UserMetadata | undefined,
      { silent: painted },
    );
  }, [applyUser, getProfile, hydrateFromSnapshot, startAuthTimeout]);

  useEffect(() => {
    startAuthTimeout();

    // Set up listener BEFORE getSession to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] State change:', event);

        if (event === 'SIGNED_OUT') {
          console.log('[Auth] Signed out — clearing state');
          bootstrappedRef.current = true;
          clearState();
          return;
        }

        if (!session?.user) {
          // INITIAL_SESSION with no session: nobody is signed in.
          if (event === 'INITIAL_SESSION') {
            bootstrappedRef.current = true;
            clearAuthTimeout();
            setIsLoading(false);
            setIsAuthReady(true);
          }
          return;
        }

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          bootstrappedRef.current = true;
          void adoptSession(session.user, {
            force: event === 'USER_UPDATED',
            refetch: event === 'USER_UPDATED',
          });
        } else if (event === 'TOKEN_REFRESHED') {
          // Routine background refresh: same person, same data. Only adopt the
          // new token; re-reading the profile here made every tab re-render.
          console.log('[Auth] Token refreshed successfully');
          void adoptSession(session.user);
        }
      }
    );

    // Restore session from storage — a fallback for clients that never emit
    // INITIAL_SESSION. Whichever path runs first marks the bootstrap done.
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (bootstrappedRef.current) return;
        if (error) throw error;

        if (session?.user) {
          console.log('[Auth] Existing session found for:', session.user.email);
          bootstrappedRef.current = true;
          await adoptSession(session.user);
        } else {
          console.log('[Auth] No existing session');
          bootstrappedRef.current = true;
          clearAuthTimeout();
          setIsLoading(false);
          setIsAuthReady(true);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Auth] Initialization error:', errorMessage);
        // The listener may already be resolving this user's profile. Declaring
        // auth "ready" here would expose a signed-in user with no profile yet,
        // which the route guard turns into a /complete-profile flash.
        if (inFlightRef.current || userIdRef.current) return;
        clearAuthTimeout();
        setIsLoading(false);
        setIsAuthReady(true);
        setAuthError(prev => prev || 'Failed to initialize authentication.');
      }
    };

    void initSession();

    return () => {
      clearAuthTimeout();
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    console.log('[Auth] Signing out...');
    try {
      await supabase.auth.signOut();
    } catch (err: unknown) {
      console.error('[Auth] Error during signOut:', err instanceof Error ? err.message : 'Unknown error');
    }
    clearState();
    console.log('[Auth] Logged out successfully');
  }, [clearState]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        student,
        role,
        isLoading,
        isNewUser,
        authError,
        isAuthReady,
        isProfileResolved,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
