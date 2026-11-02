"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Invitation = {
  email: string;
  fullName: string;
  staffRole: string;
  facilityName: string;
  expiresAt: string;
};

const checklist = [
  "At least 12 characters",
  "Not found in known data breaches",
  "A passphrase is okay; symbols and mixed case are not required",
];

export default function InviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/staff/invitations/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Invitation unavailable");
        return (await response.json()) as Invitation;
      })
      .then((data) => {
        if (active) setInvitation(data);
      })
      .catch(() => {
        if (active) setInvalid(true);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-up/email", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "x-imara-invite-token": token,
        },
        body: JSON.stringify({
          name: invitation?.fullName ?? "",
          email: invitation?.email ?? "",
          password,
          callbackURL: "/",
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 403
            ? "This invitation is invalid or expired. Ask your administrator for a new one."
            : "We could not activate your account. Check your password and try again.",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Account activation is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Invitation unavailable</h1>
          <p>This invitation is invalid or expired. Ask your administrator for a new one.</p>
          <a href="/login">Go to staff sign in</a>
        </section>
      </main>
    );
  }

  if (!invitation) {
    return <main className="auth-page"><section className="auth-card">Checking invitation…</section></main>;
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">STAFF INVITATION</div>
        <h1>Join {invitation.facilityName}</h1>
        <p>
          You were invited as <strong>{invitation.staffRole.replaceAll("_", " ")}</strong>.
          Confirm the invitation by creating a password for {invitation.email}.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="password">Create password</label>
          <div className="password-field">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" className="text-button" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          <ul className="password-checklist">
            {checklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy || password.length < 12}>
            {busy ? "Activating account..." : "Create account"}
          </button>
        </form>
        <p className="auth-footnote">
          This invitation expires {new Date(invitation.expiresAt).toLocaleString()}.
        </p>
      </section>
    </main>
  );
}
