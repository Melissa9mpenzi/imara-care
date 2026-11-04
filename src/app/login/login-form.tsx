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
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">IMARA-CARE STAFF</div>
        <h1>Welcome back</h1>
        <p>Sign in with the email address linked to your staff invitation.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <a className="back-link forgot-password-link" href="/forgot-password">
          Forgot password?
        </a>
        <p className="auth-footnote">Staff accounts are created by invitation only.</p>
      </section>
    </main>
  );
}
