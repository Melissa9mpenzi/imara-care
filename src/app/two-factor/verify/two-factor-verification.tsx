"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function TwoFactorVerification() {
  const router = useRouter();
  const busyRef = useRef(false);
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
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
        : await authClient.twoFactor.verifyTotp({ code: codeToVerify });
      if (result.error) {
        setCode("");
        setError("That verification code did not work. Try again or use a recovery code.");
        return;
      }
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
          : "Enter the six-digit code from your authenticator app."}
      </p>
      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="verification-code">
          {useRecoveryCode ? "Recovery code" : "Authenticator code"}
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
      </form>
      <button
        className="text-button"
        type="button"
        onClick={() => {
          setUseRecoveryCode(!useRecoveryCode);
          setCode("");
          setError("");
        }}
      >
        {useRecoveryCode ? "Use authenticator code instead" : "Use a recovery code"}
      </button>
      <p className="auth-footnote">For your security, this sign-in challenge expires after 10 minutes.</p>
    </section>
  );
}
