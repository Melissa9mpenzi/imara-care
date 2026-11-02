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
    try {
      const result = await authClient.signIn.email({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        callbackURL: "/",
      });
      if (result.error) {
        setError("That email or password did not work. Try again or contact your administrator.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
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
        <p className="auth-footnote">Staff accounts are created by invitation only.</p>
      </section>
    </main>
  );
}
