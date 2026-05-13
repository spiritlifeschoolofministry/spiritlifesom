import { useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Session Manager Hook
 * 
 * Keeps the session alive and forces logout on truly stale sessions.
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

  // Verify session is actually valid on route change
  useEffect(() => {
    if (!user) return;
    if (lastRouteRef.current === location.pathname) return;
    lastRouteRef.current = location.pathname;

    // Use getUser() instead of getSession() — getUser validates the token server-side
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        // Only force logout if it's a definitive auth error (400, 401, 403)
        // Network errors or 500s shouldn't kick the user out
        const isDefinitiveAuthError = error.status && [400, 401, 403].includes(error.status);
        
        if (isDefinitiveAuthError) {
          console.warn('[SessionManager] Definitive auth error on route change:', error.message, 'Status:', error.status);
          handleForceLogout();
        } else {
          console.log('[SessionManager] Transient or server error on route change (ignoring force logout):', error.message);
        }
        return;
      }
      
      if (!data.user) {
        console.warn('[SessionManager] No user found on route change');
        handleForceLogout();
      }
    });
  }, [location.pathname, user, handleForceLogout]);

  // Visibility change + proactive token refresh
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('[SessionManager] Tab visible, validating session');
        try {
          // First check if we have a valid session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError || !session) {
            console.warn('[SessionManager] No valid session on tab return');
            await handleForceLogout();
            return;
          }

          // Try to refresh
          const { error } = await supabase.auth.refreshSession();
          if (error) {
            console.warn('[SessionManager] Refresh failed on tab return:', error.message);
            // If refresh fails, validate with server
            const { error: userError } = await supabase.auth.getUser();
            if (userError) {
              await handleForceLogout();
              return;
            }
          }
          console.log('[SessionManager] Session validated successfully');
        } catch (err) {
          console.error('[SessionManager] Failed to validate session:', err);
          await handleForceLogout();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const scheduleTokenRefresh = () => {
      if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);
      
      // Schedule next check in 10 minutes
      tokenRefreshRef.current = setTimeout(async () => {
        // Only refresh if tab is visible to avoid unnecessary calls
        if (!document.hidden) {
          try {
            console.log('[SessionManager] Scheduled token refresh check...');
            const { data, error } = await supabase.auth.refreshSession();
            if (error) {
              console.warn('[SessionManager] Scheduled refresh failed:', error.message);
              // Validate server-side before force logout
              const { error: userError } = await supabase.auth.getUser();
              if (userError && userError.status && [400, 401, 403].includes(userError.status)) {
                await handleForceLogout();
                return;
              }
            }
          } catch (err) {
            console.error('[SessionManager] Token refresh error:', err);
          }
        }
        // Always reschedule the next check regardless of success/failure/visibility
        scheduleTokenRefresh();
      }, 10 * 60 * 1000); // Check every 10 mins
    };

    scheduleTokenRefresh();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (tokenRefreshRef.current) clearTimeout(tokenRefreshRef.current);
    };
  }, [user, handleForceLogout]);
};
