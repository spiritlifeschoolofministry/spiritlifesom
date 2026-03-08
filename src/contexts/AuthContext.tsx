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
  const initializedRef = useRef(false);
  const profileLoadedRef = useRef(false);

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

  const getProfile = useCallback(async (userId: string, userMeta?: UserMetadata): Promise<void> => {
    console.log('[Auth] Fetching profile for:', userId);
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
        setProfile(safeProfile);
        setRole(profileData.role);
        profileLoadedRef.current = true;
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
          if (attempt < 2 && profileData.role === 'student') {
            await new Promise(r => setTimeout(r, 1500));
          }
        }

        if (studentData) {
          setStudent(studentData);
          setIsNewUser(false);
        } else {
          setStudent(null);
          setIsNewUser(profileData.role === 'student');
        }
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
      setProfile(null);
      setRole(null);
      setStudent(null);
      setIsNewUser(false);
      setAuthError('Failed to load profile data.');
    } finally {
      clearAuthTimeout();
      setIsLoading(false);
      setIsAuthReady(true);
    }
  }, []);

  const clearState = useCallback(() => {
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
    if (initializedRef.current) return;
    initializedRef.current = true;

    startAuthTimeout();

    // Set up listener BEFORE getSession to avoid missing events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] State change:', event);

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          // Only fetch profile if not already loaded for this user
          if (!profileLoadedRef.current) {
            startAuthTimeout();
            await getProfile(session.user.id, session.user.user_metadata as UserMetadata | undefined);
          }
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          console.log('[Auth] Token refreshed successfully');
          setUser(session.user);
          // Don't re-fetch profile on token refresh — just update the user object
        } else if (event === 'SIGNED_OUT') {
          console.log('[Auth] Signed out — clearing state');
          clearState();
        }
      }
    );

    // Restore session from storage
    (async () => {
      try {
        console.log('[Auth] Initializing session...');
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          console.log('[Auth] Existing session found for:', session.user.email);
          setUser(session.user);
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
        clearAuthTimeout();
        setIsLoading(false);
        setIsAuthReady(true);
        setAuthError('Failed to initialize authentication.');
      }
    })();

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
    <AuthContext.Provider value={{ user, profile, student, role, isLoading, isNewUser, authError, isAuthReady, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};