"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function TwoFactorVerification() {
  const router = useRouter();
  const busyRef = useRef(false);
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [useEmailCode, setUseEmailCode] = useState(false);
  const [localEmailCode, setLocalEmailCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(codeToVerify: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = useRecoveryCode
        ? await authClient.twoFactor.verifyBackupCode({ code: codeToVerify })
        : useEmailCode
          ? await authClient.twoFactor.verifyOtp({ code: codeToVerify })
          : await authClient.twoFactor.verifyTotp({ code: codeToVerify });
      if (result.error) {
        setCode("");
        setError("That verification code did not work. Try again or choose another method.");
        return;
      }
      sessionStorage.removeItem("imara-pending-auth-email");
      router.replace("/");
      router.refresh();
    } catch {
      setCode("");
      setError("Verification is temporarily unavailable. Try again shortly.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function sendEmailCode() {
    setError("");
    setLocalEmailCode("");
    setBusy(true);
    try {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) {
        setError("We could not send a sign-in code. Check your email settings or try another method.");
        return;
      }

      setUseEmailCode(true);
      setUseRecoveryCode(false);
      setCode("");
      if (process.env.NODE_ENV === "development") {
        const email = sessionStorage.getItem("imara-pending-auth-email");
        if (email) {
          const mailbox = await fetch(
            `/api/dev/auth/reset-code?purpose=two-factor&email=${encodeURIComponent(email)}`,
            { cache: "no-store" },
          );
          if (mailbox.ok) {
            const data = (await mailbox.json()) as { code: string };
            setLocalEmailCode(data.code);
          }
        }
      }
    } catch {
      setError("Email verification is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void verify(code);
  }

  return (
    <section className="auth-card">
      <div className="eyebrow">SECOND-STEP VERIFICATION</div>
      <h1>Verify it’s you</h1>
      <p>
        {useRecoveryCode
          ? "Enter one of the recovery codes you saved when setting up your authenticator."
          : useEmailCode
            ? "Enter the six-digit sign-in code sent to your email."
            : "Enter the six-digit code from your authenticator app."}
      </p>
      {localEmailCode && (
        <p className="auth-note" role="status">
          Local development sign-in code: <strong>{localEmailCode}</strong>
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="verification-code">
          {useRecoveryCode
            ? "Recovery code"
            : useEmailCode
              ? "Email verification code"
              : "Authenticator code"}
        </label>
        <input
          id="verification-code"
          autoFocus
          autoComplete={useRecoveryCode ? "off" : "one-time-code"}
          inputMode={useRecoveryCode ? "text" : "numeric"}
          maxLength={useRecoveryCode ? 11 : 6}
          pattern={useRecoveryCode ? "[A-Za-z0-9-]{10,11}" : "[0-9]{6}"}
          required
          value={code}
          onChange={(event) => {
            const next = useRecoveryCode
              ? event.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 11)
              : event.target.value.replace(/\D/g, "").slice(0, 6);
            setCode(next);
            if (!useRecoveryCode && next.length === 6) void verify(next);
          }}
        />
        {error && <p className="auth-error" role="alert">{error}</p>}
        {useRecoveryCode && (
          <button className="primary-button" type="submit" disabled={busy || code.length < 10}>
            {busy ? "Verifying..." : "Use recovery code"}
          </button>
        )}
        {useEmailCode && !useRecoveryCode && (
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => void sendEmailCode()}
          >
            Resend email code
          </button>
        )}
      </form>
      {!useRecoveryCode && !useEmailCode && (
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={() => void sendEmailCode()}
        >
          Email me a sign-in code instead
        </button>
      )}
      {!useRecoveryCode && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setUseRecoveryCode(true);
            setCode("");
            setError("");
          }}
        >
          Use a recovery code
        </button>
      )}
      {useEmailCode && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setUseEmailCode(false);
            setLocalEmailCode("");
            setCode("");
            setError("");
          }}
        >
          Use authenticator app instead
        </button>
      )}
      {useRecoveryCode && (
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setUseRecoveryCode(false);
            setCode("");
            setError("");
          }}
        >
          Use authenticator app instead
        </button>
      )}
      <p className="auth-footnote">For your security, this sign-in challenge expires after 10 minutes.</p>
    </section>
  );
}
