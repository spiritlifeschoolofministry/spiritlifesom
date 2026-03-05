import { useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Session Manager Hook
 * 
 * All hooks are declared unconditionally at the top level.
 * Session logic is handled inside useEffect callbacks.
 */ 
export const useSessionManager = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const tokenRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRouteRef = useRef(location.pathname);

  const handleForceLogout = useCallback(async () => {
    console.warn('[SessionManager] Forcing logout due to stale session');
    await signOut();
    navigate('/login', { replace: true });
  }, [signOut, navigate]);

  // Route-change session refresh
  useEffect(() => {
    if (!user) return;
    if (lastRouteRef.current === location.pathname) return;
    lastRouteRef.current = location.pathname;

    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        handleForceLogout();
      }
    });
  }, [location.pathname, user, handleForceLogout]);

  // Visibility change + proactive token refresh
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('[SessionManager] Tab visible, refreshing session');
        try {
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            await handleForceLogout();
            return;
          }
          console.log('[SessionManager] Session refreshed successfully');
        } catch (err) {
          console.error('[SessionManager] Failed to refresh session:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const scheduleTokenRefresh = () => {
      if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);
      tokenRefreshRef.current = setTimeout(async () => {
        if (!document.hidden) {
          try {
            const { data, error } = await supabase.auth.refreshSession();
            if (error) throw error;
            if (data?.session) scheduleTokenRefresh();
          } catch (err) {
            console.error('[SessionManager] Token refresh failed:', err);
          }
        }
      }, 50 * 60 * 1000);
    };

    scheduleTokenRefresh();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);
    };
  }, [user, handleForceLogout]);
};
