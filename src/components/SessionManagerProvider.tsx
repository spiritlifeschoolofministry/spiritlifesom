import { ReactNode } from 'react';
import { useSessionManager } from '@/hooks/use-session-manager';

/**
 * Session Manager Provider
 * 
 * Wraps the app routes to enable active session management
 * Prevents premature logout and handles tab visibility changes
 */
export const SessionManagerProvider = ({ children }: { children: ReactNode }) => {
  useSessionManager();
  return <>{children}</>;
};
