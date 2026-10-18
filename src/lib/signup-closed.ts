/**
 * While applications are closed the database refuses new accounts (migration
 * 20261018120000_refuse_signup_when_closed). Supabase Auth does not pass the
 * trigger's message on: every database failure during signup reaches us as
 * "Database error saving new user". That is the only signal there is, so these
 * helpers read it, and callers confirm against the setting before telling
 * someone registration is closed rather than that something broke.
 */
const SIGNUP_DB_ERROR = "database error saving new user";

export const isSignupRefusal = (message: string | null | undefined) =>
  (message || "").toLowerCase().includes(SIGNUP_DB_ERROR);

/** Query flag Login reads after a refused Google signup. */
export const SIGNUP_REFUSED_PARAM = "signup";
export const SIGNUP_REFUSED_VALUE = "refused";

/**
 * A refused Google signup comes back as an error in the URL of the page the
 * button redirected to (the student dashboard). Its route guard sends a
 * signed-out visitor to /login and drops the fragment the error lives in, so
 * this has to run before React routes anything. It moves the visitor to /login
 * with a flag Login can explain.
 */
export const redirectRefusedOAuthSignup = () => {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = hash.get("error_description") || params.get("error_description");
  if (!isSignupRefusal(description)) return;
  window.history.replaceState(null, "", `/login?${SIGNUP_REFUSED_PARAM}=${SIGNUP_REFUSED_VALUE}`);
};
