import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Tables } from '@/integrations/supabase/types';

export interface AuthContextType {
  user: User | null;
  profile: Tables<'profiles'> | null;
  student: Tables<'students'> | null;
  role: string | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [student, setStudent] = useState<Tables<'students'> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cleanupTimeout: NodeJS.Timeout | null = null;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);

          // Retry logic for fetching profile
          let profileData = null;
          let retries = 0;
          const maxRetries = 3;

          while (retries < maxRetries && !profileData) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();

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
            setProfile(profileData);
            setRole(profileData.role);

            const { data: studentData } = await supabase
              .from('students')
              .select('*')
              .eq('profile_id', session.user.id)
              .maybeSingle();

            setStudent(studentData || null);
          } else {
            // No profile found after all retries
            cleanupTimeout = setTimeout(() => {
              localStorage.clear();
              setUser(null);
              setProfile(null);
              setStudent(null);
              setRole(null);
            }, 5000);
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Auth initialization error:', error);
        setIsLoading(false);
      }
    })();

    return () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);

          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileData) {
            setProfile(profileData);
            setRole(profileData.role);

            const { data: studentData } = await supabase
              .from('students')
              .select('*')
              .eq('profile_id', session.user.id)
              .maybeSingle();

            setStudent(studentData || null);
          }
        } else {
          setUser(null);
          setProfile(null);
          setStudent(null);
          setRole(null);
        }
      }
    );

    return () => subscription?.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setStudent(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, student, role, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
