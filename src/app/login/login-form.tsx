"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    sessionStorage.setItem("imara-pending-auth-email", email.trim().toLowerCase());
    try {
      const result = await authClient.signIn.email({
        email,
        password: String(form.get("password") ?? ""),
        callbackURL: "/",
      });
      if (result.error) {
        sessionStorage.removeItem("imara-pending-auth-email");
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
      router.replace("/");
      router.refresh();
    } catch {
      sessionStorage.removeItem("imara-pending-auth-email");
      setError("Sign in is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page login-page">
      <section className="auth-story" aria-label="IMARA-CARE">
        <div className="auth-story-orbit auth-story-orbit-one" aria-hidden="true" />
        <div className="auth-story-orbit auth-story-orbit-two" aria-hidden="true" />
        <div className="auth-story-content">
          <a className="auth-brand" href="/" aria-label="IMARA-CARE home">
            <img src="/images/Imara-Care%20Favicon.png" alt="" />
            <span>IMARA<span>-CARE</span></span>
          </a>
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
            <p>Sign in with the work email linked to your staff account.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="email">Work email</label>
            <div className="auth-input-wrap">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="3" />
                <path d="m4 7 8 6 8-6" />
              </svg>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@hospital.org"
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
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                required
              />
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
