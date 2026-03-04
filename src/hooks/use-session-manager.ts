import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Session Manager Hook
 * 
 * Keeps the session alive by:
 * 1. Monitoring for tab visibility changes
 * 2. Refetching session on visibility change (prevents stale sessions)
 * 3. Automatically refreshing token before expiration
 */ 
export const useSessionManager = () => {
  const { user } = useAuth();
  const tokenRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Handle visibility changes - refresh session when returning to tab
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log('[SessionManager] Tab hidden, pausing token refresh');
      } else {
        console.log('[SessionManager] Tab visible, refreshing session');
        try {
          const { data } = await supabase.auth.refreshSession();
          if (data?.session) {
            console.log('[SessionManager] Session refreshed successfully');
          }
        } catch (err) {
          console.error('[SessionManager] Failed to refresh session:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Schedule token refresh - refresh every 50 minutes (before 1 hour expiry)
    const scheduleTokenRefresh = () => {
      if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);
      
      tokenRefreshRef.current = setTimeout(async () => {
        if (!document.hidden) {
          try {
            console.log('[SessionManager] Proactive token refresh');
            const { data, error } = await supabase.auth.refreshSession();
            if (error) throw error;
            if (data?.session) {
              console.log('[SessionManager] Token refreshed successfully');
              scheduleTokenRefresh(); // Schedule next refresh
            }
          } catch (err) {
            console.error('[SessionManager] Token refresh failed:', err);
          }
        }
      }, 50 * 60 * 1000); // 50 minutes
    };

    scheduleTokenRefresh();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);
    };
  }, [user]);
};
