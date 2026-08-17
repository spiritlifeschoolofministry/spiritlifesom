import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Session Manager Hook
 *
 * Keeps the session alive and forces logout on truly stale sessions.
 *
 * Deliberately quiet: supabase-js already auto-refreshes tokens in the
 * background. Extra validation here is a safety net, so it runs on a timer
 * rather than on every navigation, and only refreshes a token that is actually
 * close to expiring. Over-eager refreshing churned the token (which the auth
 * context broadcasts to every page) and turned momentary network failures into
 * surprise logouts that looked like the app reloading itself.
 */

// Don't re-validate more often than this, no matter how many tabs/focus events.
const VALIDATE_INTERVAL_MS = 5 * 60 * 1000;
// Refresh only when the access token expires within this window.
const REFRESH_LEEWAY_S = 120;

export const useSessionManager = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastValidatedRef = useRef(0);

  const handleForceLogout = useCallback(async () => {
    console.warn('[SessionManager] Forcing logout due to stale session');
    await signOut();
    navigate('/login', { replace: true });
  }, [signOut, navigate]);

  /**
   * Returns false only when the session is definitively gone — never for
   * network blips or 5xx responses.
   */
  const validateSession = useCallback(async (): Promise<boolean> => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.log('[SessionManager] getSession failed, keeping user signed in:', error.message);
      return true;
    }
    if (!session) {
      console.warn('[SessionManager] No session in storage');
      return false;
    }

    const expiresAt = session.expires_at ?? 0;
    const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
    if (secondsLeft > REFRESH_LEEWAY_S) return true;

    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && data.session) return true;

    // Refresh failed on an (almost) expired token — confirm with the server
    // before kicking anyone out.
    const { error: userError } = await supabase.auth.getUser();
    if (userError && userError.status && [400, 401, 403].includes(userError.status)) {
      console.warn('[SessionManager] Session rejected by server:', userError.message);
      return false;
    }
    console.log('[SessionManager] Refresh failed transiently, keeping user signed in');
    return true;
  }, []);

  const maybeValidate = useCallback(async (force = false) => {
    if (document.hidden) return;
    const now = Date.now();
    if (!force && now - lastValidatedRef.current < VALIDATE_INTERVAL_MS) return;
    lastValidatedRef.current = now;
    try {
      if (!(await validateSession())) await handleForceLogout();
    } catch (err) {
      // Throwing here means we couldn't reach anything — not a reason to log out.
      console.error('[SessionManager] Validation error (ignored):', err);
    }
  }, [validateSession, handleForceLogout]);

  useEffect(() => {
    if (!user) return;
    lastValidatedRef.current = Date.now();

    const handleVisibilityChange = () => { void maybeValidate(); };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await maybeValidate(true);
        schedule();
      }, VALIDATE_INTERVAL_MS);
    };
    schedule();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, maybeValidate]);
};
