"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const isEmail = identifier.includes("@");
    sessionStorage.removeItem("imara-pending-auth-email");
    sessionStorage.removeItem("imara-pending-auth-username");
    if (isEmail) {
      sessionStorage.setItem("imara-pending-auth-email", identifier.toLowerCase());
    } else {
      sessionStorage.setItem("imara-pending-auth-username", identifier.toLowerCase());
    }
    try {
      const password = String(form.get("password") ?? "");
      const result = isEmail
        ? await authClient.signIn.email({
            email: identifier,
            password,
            callbackURL: "/",
          })
        : await authClient.signIn.username({
            username: identifier,
            password,
            callbackURL: "/",
          });
      if (result.error) {
        sessionStorage.removeItem("imara-pending-auth-email");
        sessionStorage.removeItem("imara-pending-auth-username");
        setError("That email or password did not work. Try again or contact your administrator.");
        return;
      }
      const response = result.data;
      if (
        typeof response === "object" &&
        response !== null &&
        "twoFactorRedirect" in response &&
        response.twoFactorRedirect === true
      ) {
        return;
      }
      sessionStorage.removeItem("imara-pending-auth-email");
      sessionStorage.removeItem("imara-pending-auth-username");
      router.replace("/");
      router.refresh();
    } catch {
      sessionStorage.removeItem("imara-pending-auth-email");
      sessionStorage.removeItem("imara-pending-auth-username");
      setError("Sign in is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError("");
    setBusy(true);
    sessionStorage.removeItem("imara-pending-auth-email");
    sessionStorage.removeItem("imara-pending-auth-username");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) {
        setError("Google sign-in could not be started. Use your work account or contact your administrator.");
        setBusy(false);
      }
    } catch {
      setError("Google sign-in is temporarily unavailable. Try again shortly.");
      setBusy(false);
    }
  }

  return (
    <main className="auth-page login-page">
      <section className="auth-story" aria-label="IMARA-CARE">
        <div className="auth-story-orbit auth-story-orbit-one" aria-hidden="true" />
        <div className="auth-story-orbit auth-story-orbit-two" aria-hidden="true" />
        <div className="auth-story-content">
          <div className="auth-story-copy">
            <span className="auth-story-kicker">
              <span className="auth-kicker-dot" />
              HOSPITAL MANAGEMENT
            </span>
            <h2>Better care starts with a clearer picture.</h2>
            <p>
              One thoughtful workspace for the people and moments that matter
              most in patient care.
            </p>
            <div className="auth-feature-visual">
              <div className="auth-feature-orbit" aria-hidden="true" />
              <div className="auth-feature-card">
                <span className="auth-feature-emblem">
                  <img src="/images/Imara-Care%20Favicon.png" alt="" />
                </span>
                <span className="auth-feature-copy">
                  <small>IMARA-CARE WORKSPACE</small>
                  <strong>Care, connected.</strong>
                  <span>One team. One shared picture.</span>
                  <svg aria-hidden="true" viewBox="0 0 240 34" fill="none">
                    <path d="M2 18h61l13-1 12-11 16 24 15-20 11 8h108" />
                  </svg>
                </span>
              </div>
              <span className="auth-feature-chip">
                <span className="auth-feature-chip-dot" />
                Patient-first workflows
              </span>
            </div>
          </div>
          <div className="auth-story-footer">
            <span className="auth-story-shield" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <span>
              <strong>Private staff access</strong>
              <small>For your care team, wherever care happens.</small>
            </span>
          </div>
        </div>
        <span className="auth-story-caption">BETTER CARE. HEALTHIER TOMORROW.</span>
      </section>

      <section className="auth-panel" aria-label="Staff sign in">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <img src="/images/Imara-Care%20Favicon.png" alt="" />
            <span>IMARA<span>-CARE</span></span>
          </div>
          <div className="auth-mobile-visual">
            <img src="/images/Imara-Care%20Favicon.png" alt="" />
            <span>
              <small>BETTER CARE</small>
              <strong>Connected around you.</strong>
            </span>
            <span className="auth-mobile-visual-plus" aria-hidden="true">+</span>
          </div>
          <div className="auth-heading">
            <span className="auth-welcome-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span className="eyebrow">STAFF PORTAL</span>
            <h1>Welcome back</h1>
            <p>Sign in with your work email or username.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="identifier">Work email or username</label>
            <div className="auth-input-wrap">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                placeholder="you@hospital.org or username"
                required
              />
            </div>
            <div className="auth-password-label">
              <label htmlFor="password">Password</label>
              <a href="/forgot-password">Forgot password?</a>
            </div>
            <div className="auth-input-wrap">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="10" width="16" height="11" rx="3" />
                <path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3" />
              </svg>
              <input
                id="password"
                name="password"
                type={passwordVisible ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={passwordVisible ? "Hide password" : "Show password"}
                aria-controls="password"
                aria-pressed={passwordVisible}
                onClick={() => setPasswordVisible((visible) => !visible)}
              >
                {passwordVisible ? "Hide" : "Show"}
              </button>
            </div>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in to your account"}
              {!busy && (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              )}
            </button>
          </form>
          {googleEnabled && (
            <>
              <div className="auth-or-divider"><span>or</span></div>
              <button
                className="google-sign-in-button"
                type="button"
                disabled={busy}
                onClick={() => void signInWithGoogle()}
              >
                <svg
                  aria-hidden="true"
                  className="google-sign-in-icon"
                  viewBox="0 0 18 18"
                  width="18"
                  height="18"
                >
                  <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.614Z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.037-3.711H.956v2.332A9 9 0 0 0 9 18Z" />
                  <path fill="#FBBC05" d="M3.963 10.71A5.41 5.41 0 0 1 3.671 9c0-.593.102-1.17.292-1.71V4.958H.956A9 9 0 0 0 0 9c0 1.452.348 2.827.956 4.042l3.007-2.332Z" />
                  <path fill="#EA4335" d="M9 3.579c1.321 0 2.507.454 3.441 1.345l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.958L3.963 7.29C4.672 5.163 6.656 3.579 9 3.579Z" />
                </svg>
                Continue with Google
              </button>
            </>
          )}
          <div className="auth-access-note">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 19 6v5c0 4.5-2.9 8-7 10-4.1-2-7-5.5-7-10V6l7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>Secure access for authorized care team members</span>
          </div>
          <p className="auth-footnote">
            Need an account? Ask your administrator for a staff invitation.
          </p>
        </div>
        <span className="auth-panel-copyright">© IMARA-CARE · BETTER CARE. HEALTHIER TOMORROW.</span>
      </section>
    </main>
  );
}
