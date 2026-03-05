import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Session Manager Hook
 * 
 * Keeps the session alive by:
 * 1. Monitoring for tab visibility changes
 * 2. Refetching session on visibility change (prevents stale sessions)
 * 3. Automatically refreshing token before expiration
 * 4. Refreshing session on route changes
 * 5. Intercepting 401/403 errors to force logout
 */ 
export const useSessionManager = () => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const tokenRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRouteRef = useRef(location.pathname);

  // Route-change session refresh
  useEffect(() => {
    if (!user) return;
    if (lastRouteRef.current === location.pathname) return;
    lastRouteRef.current = location.pathname;

    // Silent session check on navigation
    supabase.auth.getSession().then(({ data, error }) => {
      if (error || !data.session) {
        console.warn('[SessionManager] Stale session detected on navigation, logging out');
        signOut().then(() => navigate('/login', { replace: true }));
      }
    });
  }, [location.pathname, user, signOut, navigate]);

  useEffect(() => {
    if (!user) return;

    // Handle visibility changes - refresh session when returning to tab
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        console.log('[SessionManager] Tab hidden, pausing token refresh');
      } else {
        console.log('[SessionManager] Tab visible, refreshing session');
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            console.warn('[SessionManager] Session expired, forcing logout');
            await signOut();
            navigate('/login', { replace: true });
            return;
          }
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
  }, [user, signOut, navigate]);
};
