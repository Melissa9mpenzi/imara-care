"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function downloadRecoveryCodes(codes: string[]) {
  const file = new Blob([`IMARA-CARE recovery codes\n\n${codes.join("\n")}\n`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "imara-care-recovery-codes.txt";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TwoFactorSetup({
  email,
  username: initialUsername,
  enabled,
  required,
}: {
  email: string;
  username: string;
  enabled: boolean;
  required: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showNewCodes, setShowNewCodes] = useState(false);
  const [username, setUsername] = useState(initialUsername);
  const [newUsername, setNewUsername] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameBusy, setUsernameBusy] = useState(false);

  useEffect(() => {
    if (!totpUri) return;
    let active = true;
    QRCode.toDataURL(totpUri, { errorCorrectionLevel: "M", margin: 2, width: 220 })
      .then((image) => {
        if (active) setQrImage(image);
      })
      .catch(() => {
        if (active) setError("The QR code could not be displayed. Use the manual setup key below.");
      });
    return () => {
      active = false;
    };
  }, [totpUri]);

  async function beginSetup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.enable({
        password,
        method: "totp",
        issuer: "IMARA-CARE",
      });
      if (result.error || result.data?.method !== "totp") {
        setError("We could not start authenticator setup. Check your password and try again.");
        return;
      }
      setTotpUri(result.data.totpURI);
      setRecoveryCodes(result.data.backupCodes);
      setSavedCodes(false);
      setCode("");
    } catch {
      setError("Authenticator setup is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyAuthenticator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!savedCodes) {
      setError("Save your recovery codes before confirming the authenticator code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        setError("That authenticator code did not work. Check the code and try again.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Authenticator verification is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerateRecoveryCodes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.twoFactor.generateBackupCodes({ password });
      if (result.error || !result.data?.backupCodes) {
        setError("We could not create new recovery codes. Check your password and try again.");
        return;
      }
      setRecoveryCodes(result.data.backupCodes);
      setSavedCodes(false);
      setShowNewCodes(true);
      setPassword("");
    } catch {
      setError("Recovery codes are temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function saveUsername(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUsernameBusy(true);
    setUsernameError("");
    setUsernameSaved(false);
    try {
      const nextUsername = newUsername.trim().toLowerCase();
      const result = await authClient.updateUser({ username: nextUsername });
      if (result.error) {
        setUsernameError(
          "That username is unavailable or invalid. Choose another and try again.",
        );
        return;
      }
      setUsername(nextUsername);
      setNewUsername("");
      setUsernameSaved(true);
    } catch {
      setUsernameError("We could not save your username. Try again shortly.");
    } finally {
      setUsernameBusy(false);
    }
  }

  const manualSecret = totpUri ? new URL(totpUri).searchParams.get("secret") : null;

  return (
    <section className="auth-card">
      <div className="eyebrow">MY SECURITY</div>
      <h1>{enabled ? "Authenticator enabled" : "Secure your account"}</h1>
      <p>
        {enabled
          ? `An authenticator app protects ${email}.`
          : "Use an authenticator app to generate a six-digit sign-in code."}
      </p>
      <div className="auth-note">
        {username
        ? <>Username sign-in is enabled as <strong>{username}</strong>.</>
        : "Add a username to sign in without entering your email address."}
      </div>
      {!username && (
        <form className="auth-form" onSubmit={saveUsername}>
          <label htmlFor="staff-username">Choose a username</label>
          <input
            id="staff-username"
            autoComplete="username"
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9_.]+"
            required
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
          />
          <p className="auth-field-hint">
            Use 3-30 letters, numbers, periods, or underscores. Usernames cannot be changed later.
          </p>
          {usernameError && <p className="auth-error" role="alert">{usernameError}</p>}
          {usernameSaved && <p className="auth-success" role="status">Username saved.</p>}
          <button
            className="primary-button"
            type="submit"
            disabled={usernameBusy || newUsername.trim().length < 3}
          >
            {usernameBusy ? "Saving..." : "Save username"}
          </button>
        </form>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}

      {enabled && !showNewCodes && (
        <form className="auth-form" onSubmit={regenerateRecoveryCodes}>
          <div className="auth-note">
            Recovery codes are single-use. Generating new codes immediately replaces every
            previous code.
          </div>
          <label htmlFor="password">Confirm your password to replace recovery codes</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Creating codes..." : "Replace recovery codes"}
          </button>
        </form>
      )}

      {enabled && showNewCodes && (
        <>
          <div className="recovery-code-list" aria-label="New recovery codes">
            {recoveryCodes.map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className="auth-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => downloadRecoveryCodes(recoveryCodes)}
            >
              Download codes
            </button>
          </div>
          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={savedCodes}
              onChange={(event) => setSavedCodes(event.target.checked)}
            />
            <span>I saved these recovery codes somewhere safe.</span>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={!savedCodes}
            onClick={() => {
              setShowNewCodes(false);
              setRecoveryCodes([]);
              setSavedCodes(false);
            }}
          >
            Done
          </button>
        </>
      )}

      {!enabled && !totpUri && (
        <form className="auth-form" onSubmit={beginSetup}>
          <label htmlFor="password">Confirm your password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Preparing setup..." : "Set up authenticator"}
          </button>
        </form>
      )}

      {!enabled && totpUri && (
        <>
          <div className="auth-note">
            Scan this QR code in your authenticator app, then save all 10 recovery codes.
            Each recovery code works once.
          </div>
          {qrImage && <img className="totp-qr" src={qrImage} alt="Authenticator setup QR code" />}
          {manualSecret && (
            <>
              <p>Or enter this setup key manually:</p>
              <div className="totp-secret">{manualSecret}</div>
            </>
          )}
          <div className="recovery-code-list" aria-label="One-time recovery codes">
            {recoveryCodes.map((item) => <span key={item}>{item}</span>)}
          </div>
          <div className="auth-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => downloadRecoveryCodes(recoveryCodes)}
            >
              Download codes
            </button>
          </div>
          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={savedCodes}
              onChange={(event) => setSavedCodes(event.target.checked)}
            />
            <span>I saved these recovery codes somewhere safe.</span>
          </label>
          <form className="auth-form" onSubmit={verifyAuthenticator}>
            <label htmlFor="totp-code">Enter the six-digit authenticator code</label>
            <input
              id="totp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button className="primary-button" type="submit" disabled={busy || !savedCodes || code.length !== 6}>
              {busy ? "Verifying..." : "Verify and enable"}
            </button>
          </form>
        </>
      )}

      {required && !enabled && (
        <p className="auth-footnote">
          Authenticator setup is required for this staff role before accessing staff data.
        </p>
      )}
      {!required && !enabled && (
        <p className="auth-footnote">You can return to your dashboard without setting this up.</p>
      )}
      {!enabled && (
        <button
          className="text-button"
          type="button"
          onClick={() => void authClient.signOut().then(() => window.location.assign("/login"))}
        >
          Sign out
        </button>
      )}
      {!enabled && !required && <a className="back-link" href="/">Back to dashboard</a>}
      {enabled && !showNewCodes && <a className="back-link" href="/">Back to dashboard</a>}
    </section>
  );
}
