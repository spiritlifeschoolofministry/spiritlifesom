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
  isNewUser: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const [student, setStudent] = useState<Tables<'students'> | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  const getProfile = async (userId: string) => {
    console.log("Triggering fetch for user:", userId);
    try {
      // Retry logic for fetching profile
      let profileData = null;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries && !profileData) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        console.log('Profile Fetch Result:', { data, error, retry: retries });

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
        // Provide fallbacks for first_name and last_name if null or empty
        const safeProfile = {
          ...profileData,
          first_name: profileData.first_name || 'Student',
          last_name: profileData.last_name || 'User',
        };
        setProfile(safeProfile);
        setRole(profileData.role);

        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('*')
          .eq('profile_id', userId)
          .limit(1)
          .maybeSingle();

        console.log('Student Fetch Result:', { data: studentData, error: studentError });

        if (studentData) {
          setStudent(studentData);
          setIsNewUser(false);
        } else {
          setStudent(null);
          setIsNewUser(true);
        }
      } else {
        setProfile(null);
        setRole(null);
        setStudent(null);
        setIsNewUser(true);
      }
    } catch (error) {
      console.error('Error fetching profile or student:', error);
      setProfile(null);
      setRole(null);
      setStudent(null);
      setIsNewUser(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          setIsLoading(true);
          await getProfile(session.user.id);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setIsLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth State Change:', event, session);

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          setIsLoading(true);
          await getProfile(session.user.id);
        } else if (session?.user) {
          setUser(session.user);
          // For other events with session, ensure data is loaded if not already
          if (!profile) {
            setIsLoading(true);
            await getProfile(session.user.id);
          }
        } else {
          setUser(null);
          setProfile(null);
          setStudent(null);
          setRole(null);
          setIsNewUser(false);
          setIsLoading(false);
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setStudent(null);
    setRole(null);
    setIsNewUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, profile, student, role, isLoading, isNewUser, signOut }}>
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
