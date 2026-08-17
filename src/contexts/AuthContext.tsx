import React, { createContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';

export interface AuthContextType {
  user: User | null;
  profile: Tables<'profiles'> | null;
  student: Tables<'students'> | null;
  role: string | null;
  isLoading: boolean;
  isNewUser: boolean;
  authError: string | null;
  isAuthReady: boolean;
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

const AUTH_TIMEOUT_MS = 30000;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [student, setStudent] = useState<Tables<'students'> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const profileLoadedRef = useRef(false);
  // Holds the running fetch so concurrent callers await the same work instead of
  // being dropped — a dropped call used to resolve instantly and let the caller
  // continue as if auth data were ready.
  const getProfileInFlightRef = useRef<Promise<void> | null>(null);
  const userIdRef = useRef<string | null>(null);

  const clearAuthTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const startAuthTimeout = () => {
    clearAuthTimeout();
    timeoutRef.current = setTimeout(() => {
      console.warn('[Auth] Timeout reached — forcing loading to false');
      setIsLoading(false);
      setIsAuthReady(true);
      setAuthError('Session loading timed out. Please try logging in again.');
    }, AUTH_TIMEOUT_MS);
  };

  const runProfileFetch = useCallback(async (
    userId: string,
    userMeta?: UserMetadata,
    opts?: { silent?: boolean },
  ): Promise<void> => {
    console.log('[Auth] Fetching profile for:', userId);
    // Mark loading before fetching. On a fresh sign-in the app is usually
    // already idle (isLoading=false), so without this the route guard would see
    // null profile/student mid-fetch and briefly bounce users to /complete-profile
    // before their dashboard appears. A silent refresh (post-save re-read) skips
    // this so the current screen stays put instead of blanking to a spinner.
    if (!opts?.silent) {
      setIsAuthReady(false);
      setIsLoading(true);
    }
    try {
      let profileData = null;
      let retries = 0;
      const maxRetries = 3;

      const fetchWithTimeout = async (uid: string) => {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), 5000)
        );
        const queryPromise = supabase
          .from('profiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();
        return Promise.race([queryPromise, timeoutPromise]);
      };

      while (retries < maxRetries && !profileData) {
        const result = await fetchWithTimeout(userId) as { data: Tables<'profiles'> | null, error: { message: string } | null };
        const { data, error } = result;
        console.log('[Auth] Query result:', { found: !!data, error: error?.message });

        if (data) {
          profileData = data;
          break;
        }
        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      if (profileData) {
        const safeProfile = {
          ...profileData,
          first_name: profileData.first_name || 'Student',
          last_name: profileData.last_name || 'User',
        };
        console.log('[Auth] Profile loaded, role:', profileData.role);

        let studentData = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data } = await supabase
            .from('students')
            .select('*')
            .eq('profile_id', userId)
            .maybeSingle();
          if (data) {
            studentData = data;
            break;
          }
          // Only students are expected to have a row — don't retry for staff.
          if (profileData.role !== 'student') break;
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 1500));
          }
        }

        // Publish profile + student together. Setting profile first would render
        // one frame with a profile but no student row, which the route guard
        // reads as "profile incomplete" and turns into a /complete-profile flash.
        setProfile(safeProfile);
        setRole(profileData.role);
        setStudent(studentData);
        setIsNewUser(!studentData && profileData.role === 'student');
        profileLoadedRef.current = true;
      } else {
        console.warn('[Auth] No profile found after retries, using metadata fallback');
        const fallbackRole = userMeta?.role || 'student';
        setProfile(null);
        setRole(fallbackRole);
        setStudent(null);
        setIsNewUser(true);
        profileLoadedRef.current = true;
      }
      setAuthError(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Auth] Error fetching profile:', errorMessage);
      // Keep whatever we already had — discarding a good profile because a
      // re-read failed would drop the user onto /complete-profile.
      if (!profileLoadedRef.current) {
        setProfile(null);
        setRole(null);
        setStudent(null);
        setIsNewUser(false);
      }
      setAuthError('Failed to load profile data.');
    } finally {
      clearAuthTimeout();
      setIsLoading(false);
      setIsAuthReady(true);
    }
  }, []);

  // Coalesce concurrent fetches (e.g. a TOKEN_REFRESHED event racing initSession
  // on page load) onto one promise every caller can await.
  const getProfile = useCallback((
    userId: string,
    userMeta?: UserMetadata,
    opts?: { silent?: boolean },
  ): Promise<void> => {
    if (getProfileInFlightRef.current) return getProfileInFlightRef.current;
    const run = runProfileFetch(userId, userMeta, opts).finally(() => {
      getProfileInFlightRef.current = null;
    });
    getProfileInFlightRef.current = run;
    return run;
  }, [runProfileFetch]);

  // Re-read profile + student without blanking the screen. Used after a save
  // (e.g. /complete-profile) so the app can navigate on fresh data instead of
  // doing a full page reload to pick it up.
  const refreshProfile = useCallback(async (): Promise<void> => {
    const userId = userIdRef.current;
    if (!userId) return;
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
    setUser(null);
    setProfile(null);
    setStudent(null);
    setRole(null);
    setIsNewUser(false);
    setAuthError(null);
    profileLoadedRef.current = false;
    clearAuthTimeout();
    setIsLoading(false);
    setIsAuthReady(true);
  }, []);

  useEffect(() => {
    // Set up auth timeout for initial load
    startAuthTimeout();

    // Set up listener BEFORE getSession to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] State change:', event);

        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          applyUser(session.user, event === 'USER_UPDATED');
          // Fetch profile if it's a new sign in or if user data was updated (like email)
          if (!profileLoadedRef.current || event === 'USER_UPDATED') {
            startAuthTimeout();
            // A re-read for an already-loaded user shouldn't blank the screen.
            await getProfile(
              session.user.id,
              session.user.user_metadata as UserMetadata | undefined,
              { silent: profileLoadedRef.current },
            );
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          console.log('[Auth] Token refreshed successfully');
          applyUser(session.user);
          // Update profile if not loaded yet
          if (!profileLoadedRef.current) {
            await getProfile(session.user.id, session.user.user_metadata as UserMetadata | undefined);
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('[Auth] Signed out — clearing state');
          clearState();
        }
      }
    );

    // Restore session from storage
    const initSession = async () => {
      try {
        console.log('[Auth] Initializing session...');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('[Auth] getSession error:', error.message);
          throw error;
        }

        if (session?.user) {
          console.log('[Auth] Existing session found for:', session.user.email);
          applyUser(session.user);
          await getProfile(session.user.id, session.user.user_metadata as UserMetadata | undefined);
        } else {
          console.log('[Auth] No existing session');
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
        if (getProfileInFlightRef.current) return;
        clearAuthTimeout();
        setIsLoading(false);
        setIsAuthReady(true);
        // Only set error if we don't have a user (might have been set by listener)
        setAuthError(prev => prev || 'Failed to initialize authentication.');
      }
    };

    initSession();

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
    <AuthContext.Provider value={{ user, profile, student, role, isLoading, isNewUser, authError, isAuthReady, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};