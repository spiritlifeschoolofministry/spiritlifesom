# 🔐 Session Persistence & Auth Stability Guide

## Problem Summary
Users were experiencing premature logouts and session losses when:
- Navigating between routes
- Switching browser tabs
- Page refresh cycles
- Token expiration without automatic refresh

## Solutions Implemented

### 1. ✅ Supabase Client Configuration
**File:** `/src/integrations/supabase/client.ts`

Your client already has the correct persistence settings:
```typescript
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,           // Session persisted to localStorage
    persistSession: true,             // Automatically restore session on page load
    autoRefreshToken: true,           // Automatically refresh token before expiry
    detectSessionInUrl: true,         // Handle OAuth redirect parameters
  }
});
```

### 2. ✅ Auth Provider with Session Listener
**File:** `/src/contexts/AuthContext.tsx`

Enhanced the AuthProvider to:
- Use `supabase.auth.onAuthStateChange()` listener for all auth events
- Handle `SIGNED_IN`, `TOKEN_REFRESHED`, and `SIGNED_OUT` events
- Initialize session only once (using `initializedRef`) to prevent re-initialization on navigation
- Gracefully handle profile loading failures with metadata fallback

**Key Event Handling:**
```typescript
// TOKEN_REFRESHED: Supabase automatically refreshes tokens
// This event fires when token is successfully renewed
// SIGNED_IN: User successfully logged in
// SIGNED_OUT: User logged out
```

### 3. ✅ Protected Route Optimization
**File:** `/src/components/ProtectedRoute.tsx`

Fixed the loading spinner behavior:
- Only shows spinner on **initial page load**, not on every route navigation
- Uses `didInitialLoad` ref to track first load completion
- Navigation between authenticated routes is now instant
- Error recovery no longer clears `localStorage`

**Before:** Spinner appeared on every route change → confusing UX
**After:** Spinner only on app startup → smooth navigation

### 4. ✅ Session Manager Hook (New!)
**File:** `/src/hooks/use-session-manager.ts`

Active session management that:
- ⏱️ **Proactive Token Refresh** - Refreshes token every 50 minutes (before 1-hour expiry)
- 👁️ **Tab Visibility Awareness** - Refreshes session when you return to the tab
- 🔄 **Automatic Recovery** - Handles tab switches without losing session

**Lifecycle:**
1. Tab becomes hidden → pause token refresh (save CPU)
2. Tab becomes visible → immediately refresh session
3. Every 50 minutes → refresh token proactively

### 5. ✅ Session Manager Provider (New!)
**File:** `/src/components/SessionManagerProvider.tsx` & `/src/App.tsx`

Wraps all routes to enable global session management:
```typescript
<BrowserRouter>
  <AuthProvider>
    <SessionManagerProvider>  {/* ← Enables session management */}
      <Routes>...</Routes>
    </SessionManagerProvider>
  </AuthProvider>
</BrowserRouter>
```

## Testing the Fixes

### Test 1: Session Persistence on Refresh
```
1. Login to /student/dashboard
2. Refresh the page (Cmd+R)
3. ✅ Should stay logged in without spinner
4. Session restored from localStorage
```

### Test 2: Smooth Navigation
```
1. Login to admin
2. Click between /admin/students, /admin/materials, /admin/fees
3. ✅ No loading spinner between routes
4. Instant transitions between pages
```

### Test 3: Tab Switching
```
1. Login to /student/assignments
2. Keep app open 30 minutes
3. Switch to another tab and back
4. ✅ Session automatically refreshed
5. Token valid for another hour
```

### Test 4: Long Session (>1 hour)
```
1. Login at 2:00 PM
2. Keep tab open and active
3. Check at 3:30 PM
4. ✅ Still logged in
5. Token has been refreshed multiple times automatically
```

### Test 5: Error Recovery
```
1. Login and browse
2. Open DevTools → Network tab
3. Throttle to "Offline"
4. Try to navigate
5. Shows error message with retry option
6. ✅ Session NOT cleared from localStorage
7. Go back online, click retry
8. ✅ Session restored
```

## Configuration Details

### Token Expiry & Refresh
- **Supabase token expiry:** 1 hour (default)
- **Refresh interval:** 50 minutes (before expiry)
- **During idle:** Token refresh paused if tab hidden
- **On tab switch:** Immediate refresh to prevent stale tokens

### Storage
- **Where:** Browser localStorage
- **Key:** `sb-<supabase-url>-auth-token`
- **Cleared on:** User logs out only
- **Persisted on:** Errors (with retry option)

### Error Handling
- **No immediate logout on error** → Allow retry first
- **Session data kept** → Can recover without re-login
- **Clear UX** → Shows error with "Retry" and "Logout & Retry" options

## Console Logging

The auth system logs all events for debugging:
```
[Auth] Initializing session...
[Auth] Existing session found for: user@example.com
[Auth] Profile loaded, role: admin
[Auth] State change: TOKEN_REFRESHED
[SessionManager] Tab visible, refreshing session
[SessionManager] Session refreshed successfully
```

Monitor these logs in DevTools Console to verify session is active.

## Best Practices for Users

1. **Don't manually clear localStorage** - Let Supabase manage it
2. **Keep browser tab open** - Session stays alive as long as tab is open
3. **Network connectivity** - Ensure stable internet connection
4. **Browser settings** - Don't block cookies (localStorage relies on this)

## Best Practices for Developers

1. **Always use `useAuth()` hook** - Don't directly check localStorage
2. **Wrap routes with `ProtectedRoute`** - Ensures auth state is checked
3. **Use `SessionManagerProvider`** - Enables automatic token refresh
4. **Error handling** - Don't clear localStorage unnecessarily

## Architecture Diagram

```
┌─────────────────────────────────────────┐
│          Browser Page Load              │
└──────────────────┬──────────────────────┘
                   ▼
         ┌─────────────────────────┐
         │   AuthProvider          │
         │ - Load persisted session│
         │ - Setup auth listener   │
         │ - Initialize once only  │
         └────────────┬────────────┘
                      ▼
         ┌─────────────────────────┐
         │ SessionManagerProvider  │
         │ - Visibility tracking   │
         │ - Token refresh timer   │
         │ - Proactive refresh     │
         └────────────┬────────────┘
                      ▼
         ┌─────────────────────────┐
         │     Routes              │
         │ - ProtectedRoute checks │
         │ - No loading spinner    │
         │ - Smooth navigation     │
         └─────────────────────────┘
```

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Loading..." on every page | Route re-initializing auth | ✅ Fixed - use `didInitialLoad` ref |
| Session lost on refresh | localStorage not persisted | ✅ Fixed - Supabase persists automatically |
| Token expired after 1h | No refresh mechanism | ✅ Fixed - 50-min refresh interval |
| Logout on tab switch | Stale session detected | ✅ Fixed - Session Manager refreshes on tab visibility |
| localStorage cleared | Manual error handling | ✅ Fixed - Only clear on explicit logout |

## Files Modified

- ✅ `/src/contexts/AuthContext.tsx` - Added `initializedRef` to prevent re-init
- ✅ `/src/components/ProtectedRoute.tsx` - Fixed loading spinner, improved error handling
- ✅ `/src/hooks/use-session-manager.ts` - NEW: Active session management
- ✅ `/src/components/SessionManagerProvider.tsx` - NEW: Provider wrapper
- ✅ `/src/App.tsx` - Added SessionManagerProvider

## Next Steps

1. Test the fixes using the test cases above
2. Monitor console logs for auth events
3. Deploy and verify in production
4. Adjust token refresh interval (currently 50 min) if needed

## Support

For issues with session persistence:
1. Check browser DevTools Console for `[Auth]` logs
2. Verify localStorage has session data: `localStorage.getItem('sb-...-auth-token')`
3. Check Supabase dashboard for token expiration settings
4. Ensure cookies are not blocked by browser privacy settings
