import { afterEach, describe, expect, it } from "vitest";
import { isSignupRefusal, redirectRefusedOAuthSignup } from "@/lib/signup-closed";

describe("signup refusal", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("recognises the message Supabase Auth gives for a refused signup", () => {
    expect(isSignupRefusal("Database error saving new user")).toBe(true);
    expect(isSignupRefusal("User already registered")).toBe(false);
    expect(isSignupRefusal(null)).toBe(false);
  });

  it("sends a refused Google signup to the login page, from the fragment", () => {
    window.history.replaceState(null, "", "/student/dashboard#error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user");
    redirectRefusedOAuthSignup();
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("?signup=refused");
  });

  it("sends a refused Google signup to the login page, from the query string", () => {
    window.history.replaceState(null, "", "/student/dashboard?error=server_error&error_description=Database%20error%20saving%20new%20user");
    redirectRefusedOAuthSignup();
    expect(window.location.pathname).toBe("/login");
  });

  it("leaves every other URL alone", () => {
    window.history.replaceState(null, "", "/student/dashboard#access_token=abc&type=bearer");
    redirectRefusedOAuthSignup();
    expect(window.location.pathname).toBe("/student/dashboard");
    window.history.replaceState(null, "", "/reset-password#error_description=Email+link+is+invalid+or+has+expired");
    redirectRefusedOAuthSignup();
    expect(window.location.pathname).toBe("/reset-password");
  });
});
