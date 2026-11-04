"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type ResetStep = "request" | "verify" | "complete";

export default function ForgotPasswordForm() {
  const [step, setStep] = useState<ResetStep>("request");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [localResetCode, setLocalResetCode] = useState("");

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  async function requestCode(nextEmail = email) {
    setError("");
    setNotice("");
    setLocalResetCode("");
    setBusy(true);
    try {
      const result = await authClient.emailOtp.requestPasswordReset({ email: nextEmail });
      if (result.error) {
        setError("Password reset email is temporarily unavailable. Please try again later or contact your administrator.");
        return false;
      }
      setEmail(nextEmail);
      setStep("verify");
      setResendSeconds(60);
      setNotice("If this address belongs to an account, a six-digit reset code has been emailed. Check your inbox and spam folder.");
      if (process.env.NODE_ENV === "development") {
        const mailbox = await fetch(
          `/api/dev/auth/reset-code?email=${encodeURIComponent(nextEmail)}`,
          { cache: "no-store" },
        );
        if (mailbox.ok) {
          const data = (await mailbox.json()) as { code: string };
          setLocalResetCode(data.code);
        }
      }
      return true;
    } catch {
      setError("Password reset email is temporarily unavailable. Please try again later or contact your administrator.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get("email") ?? "").trim().toLowerCase();
    setEmail(value);
    await requestCode(value);
  }

  async function submitReset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const otp = String(form.get("otp") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the six-digit code from your email.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const result = await authClient.emailOtp.resetPassword({ email, otp, password });
      if (result.error) {
        setError(
          "The code or password could not be accepted. Check the code, choose a password that meets the requirements, and try again.",
        );
        return;
      }
      setStep("complete");
      setLocalResetCode("");
    } catch {
      setError("Password reset is temporarily unavailable. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="back-link" href="/login">← Back to sign in</Link>
        <div className="eyebrow">ACCOUNT RECOVERY</div>

        {step === "request" && (
          <>
            <h1>Reset your password</h1>
            <p>Enter your work email and we’ll send a one-time reset code if it matches an account.</p>
            <form className="auth-form" onSubmit={submitRequest}>
              <label htmlFor="email">Work email</label>
              <input
                autoComplete="email"
                id="email"
                maxLength={254}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? "Sending code..." : "Email me a reset code"}
              </button>
            </form>
          </>
        )}

        {step === "verify" && (
          <>
            <h1>Check your email</h1>
            <p>{notice}</p>
            {localResetCode && (
              <p className="auth-note" role="status">
                Local development reset code: <strong>{localResetCode}</strong>
              </p>
            )}
            <form className="auth-form" onSubmit={submitReset}>
              <label htmlFor="otp">Six-digit email code</label>
              <input
                autoComplete="one-time-code"
                id="otp"
                inputMode="numeric"
                maxLength={6}
                name="otp"
                pattern="[0-9]{6}"
                required
              />
              <label htmlFor="password">New password</label>
              <input
                autoComplete="new-password"
                id="password"
                maxLength={128}
                minLength={12}
                name="password"
                required
                type="password"
              />
              <span className="password-hint">Use at least 12 characters. Known breached passwords are not accepted.</span>
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                autoComplete="new-password"
                id="confirmPassword"
                maxLength={128}
                minLength={12}
                name="confirmPassword"
                required
                type="password"
              />
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="primary-button" disabled={busy} type="submit">
                {busy ? "Updating password..." : "Set new password"}
              </button>
            </form>
            <button
              className="text-button resend-code"
              disabled={busy || resendSeconds > 0}
              onClick={() => void requestCode()}
              type="button"
            >
              {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}
            </button>
          </>
        )}

        {step === "complete" && (
          <>
            <h1>Password updated</h1>
            <p>Your password has been changed and other active sessions have been signed out. Sign in again to continue.</p>
            <p className="auth-note">Authenticator verification remains required for administrator and other protected staff accounts.</p>
            <Link className="primary-button auth-submit-link" href="/login">Return to sign in</Link>
          </>
        )}

        {step !== "complete" && (
          <p className="auth-footnote">Reset codes expire after 10 minutes and can only be used once. Never share a code with anyone.</p>
        )}
      </section>
    </main>
  );
}
