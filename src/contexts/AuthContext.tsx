import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
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
  signOut: () => Promise<void>;
}

interface UserMetadata {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  phone?: string;
  role?: string;
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setAuthError('Session loading timed out. Please try logging in again.');
    }, AUTH_TIMEOUT_MS);
  };

  const getProfile = async (userId: string, userMeta?: UserMetadata): Promise<void> => {
    console.log('[Auth] Fetching profile for:', userId);
    try {
      let profileData = null;
      let retries = 0;
      const maxRetries = 3;

      const fetchWithTimeout = async (userId: string) => {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), 5000)
        );

        const queryPromise = supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        return Promise.race([queryPromise, timeoutPromise]);
      };

      while (retries < maxRetries && !profileData) {
        console.log('[Auth] Running Supabase query...');
        const result = await fetchWithTimeout(userId) as { data: Tables<'profiles'> | null, error: { message: string } | null };
        const { data, error } = result;
        console.log('[Auth] Query result:', { found: !!data, error: error?.message });

        if (data) {
          profileData = data;
          break;
        }

        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
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
        console.log('[Auth] Profile loaded, role:', profileData.role);

        const { data: studentData } = await supabase
          .from('students')
          .select('*')
          .eq('profile_id', userId)
          .maybeSingle();

        console.log('[Auth] Student record:', studentData ? 'found' : 'not found');

        if (studentData) {
          setStudent(studentData);
          setIsNewUser(false);
        } else {
          setStudent(null);
          // New user if role is student but no student record yet
          setIsNewUser(profileData.role === 'student');
        }
      } else {
        console.warn('[Auth] No profile found after retries, using metadata fallback');
        // Fallback: use user_metadata to keep user logged in
        const fallbackRole = userMeta?.role || 'student';
        const fallbackFirst = userMeta?.first_name || 'Student';
        const fallbackLast = userMeta?.last_name || 'User';

        setProfile(null);
        setRole(fallbackRole);
        setStudent(null);
        setIsNewUser(true);
        console.log('[Auth] Fallback role from metadata:', fallbackRole);
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
      console.log('[Auth] Profile fetch completed, clearing timeout');
      clearAuthTimeout();
      setIsLoading(false);
      console.log('DEBUG: Spinner stopped and timeout cleared');
    }
  };

  useEffect(() => {
    startAuthTimeout();

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
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Auth] Initialization error:', errorMessage);
        clearAuthTimeout();
        setIsLoading(false);
        setAuthError('Failed to initialize authentication.');
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] State change:', event);

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          startAuthTimeout();
          await getProfile(session.user.id, session.user.user_metadata as UserMetadata | undefined);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user);
          // Don't refetch profile on token refresh if already loaded
          if (!profile && !role) {
            startAuthTimeout();
            await getProfile(session.user.id, session.user.user_metadata as UserMetadata | undefined);
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('[Auth] Signed out — clearing state');
          setUser(null);
          setProfile(null);
          setStudent(null);
          setRole(null);
          setIsNewUser(false);
          setAuthError(null);
          clearAuthTimeout();
          setIsLoading(false);
        }
      }
    );

    return () => {
      clearAuthTimeout();
      subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Safety guard: if loading finished but user exists and profile is still null, just log warning
  useEffect(() => {
    if (!isLoading && user && profile == null) {
      console.warn('[Auth] Profile missing after load — setting loading to false and allowing user session to continue');
      setIsLoading(false);
    }
  }, [isLoading, user, profile]);

  const signOut = async (): Promise<void> => {
    console.log('[Auth] Signing out...');
    try {
      await supabase.auth.signOut();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during sign out';
      console.error('[Auth] Error during signOut:', errorMessage);
    }
    // Immediately clear client state and stop any spinner to avoid black screen
    setUser(null);
    setProfile(null);
    setStudent(null);
    setRole(null);
    setIsNewUser(false);
    setAuthError(null);
    setIsLoading(false);
    console.log('[Auth] Logged out successfully');
  };

  return (
    <AuthContext.Provider value={{ user, profile, student, role, isLoading, isNewUser, authError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
