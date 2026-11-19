"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/lib/api";
import type { SupportRequest } from "@/lib/api";

const SUPPORT_EMAIL = "melissampeenzi@gmail.com";
const supportStatuses: SupportRequest["status"][] = ["open", "in_progress", "resolved"];

const supportCategories: { value: SupportRequest["category"]; label: string }[] = [
  { value: "access", label: "Sign-in or access" },
  { value: "account", label: "My account" },
  { value: "workflow", label: "Using a workflow" },
  { value: "technical", label: "Technical problem" },
  { value: "other", label: "Other" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kampala",
  }).format(new Date(value));
}

function statusLabel(status: SupportRequest["status"]) {
  return status.replaceAll("_", " ");
}

export default function HelpSupport({
  isManager,
}: {
  isManager: boolean;
}) {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setRequests(await api.get<SupportRequest[]>("/support/requests?limit=100"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Support requests could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const request = await api.post<SupportRequest>("/support/requests", {
        category: data.get("category"),
        subject: data.get("subject"),
        message: data.get("message"),
      });
      form.reset();
      setSuccess(`Your request ${request.ticket_number} has been sent.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your request could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(
    request: SupportRequest,
    status: SupportRequest["status"],
  ) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api.patch<SupportRequest>(`/support/requests/${request.id}`, { status });
      setSuccess(`${request.ticket_number} marked ${statusLabel(status)}.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request status could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="support-view">
      <header className="support-heading">
        <div>
          <div className="eyebrow">STAFF RESOURCES</div>
          <h1>Help &amp; support</h1>
          <p>Find help with common tasks or send a request to the support team.</p>
        </div>
        <a className="button button-quiet" href={`mailto:${SUPPORT_EMAIL}`}>
          Email support
        </a>
      </header>

      <div className="support-grid">
        <section className="support-card" aria-labelledby="help-topics-title">
          <div className="support-card-heading">
            <h2 id="help-topics-title">Help topics</h2>
            <p>Quick guidance for common tasks in the workspace.</p>
          </div>
          <div className="support-faq">
            <details>
              <summary>How do I register or find a patient?</summary>
              <p>
                Open <strong>Patients</strong> to register a patient or search by name,
                patient number, or phone. Review possible duplicate matches before
                creating another record.
              </p>
            </details>
            <details>
              <summary>How do appointments and the queue work?</summary>
              <p>
                Book or update appointments from <strong>Appointments</strong>. When a
                patient arrives, check them in to a department. The patient then
                appears in <strong>Queue &amp; triage</strong> for triage and calling.
              </p>
            </details>
            <details>
              <summary>Why can&apos;t I open a department?</summary>
              <p>
                Department access depends on your assigned role and department. Ask a
                facility administrator to check your assignment if a workspace is
                missing or access is denied.
              </p>
            </details>
            <details>
              <summary>How does a staff invitation work?</summary>
              <p>
                An administrator sends an invitation to your work email. Open the
                invitation link before it expires and complete account setup. Contact
                your administrator if the link has expired.
              </p>
            </details>
            <details>
              <summary>What should I do if sign-in or MFA fails?</summary>
              <p>
                Confirm you are using the work email linked to your account. Use a
                recovery code if you cannot access your authenticator, or contact your
                administrator for account help. Never send a password or MFA code to
                support.
              </p>
            </details>
          </div>
        </section>

        <section className="support-card" aria-labelledby="support-request-title">
          <div className="support-card-heading">
            <h2 id="support-request-title">Send a support request</h2>
            <p>Requests are visible to facility administrators and to you.</p>
          </div>
          <form className="support-request-form" onSubmit={(event) => void submitRequest(event)}>
            <label>
              Category
              <select name="category" required defaultValue="technical">
                {supportCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <input
                name="subject"
                required
                minLength={3}
                maxLength={120}
                placeholder="Briefly describe the issue"
              />
            </label>
            <label>
              What happened?
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={2000}
                rows={5}
                placeholder="Include the page and steps to reproduce the issue."
              />
            </label>
            <div className="support-privacy-note" role="note">
              Do not include patient names, IDs, clinical information, passwords, or
              authentication codes in support requests.
            </div>
            <label className="support-confirmation">
              <input type="checkbox" required />
              <span>I confirm this message contains no patient or login information.</span>
            </label>
            {error && <div className="alert alert-error" role="alert">{error}</div>}
            {success && <div className="alert alert-success" role="status">{success}</div>}
            <button className="button button-primary" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </button>
          </form>
          <p className="support-contact">
            Prefer email? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </section>
      </div>

      <section className="support-card support-requests-card" aria-labelledby="support-requests-title">
        <div className="support-card-heading">
          <h2 id="support-requests-title">
            {isManager ? "Facility support requests" : "My support requests"}
          </h2>
          <p>
            {isManager
              ? "Review staff requests and update their status."
              : "Track the status of requests you have sent."}
          </p>
        </div>
        {error && <div className="alert alert-error support-list-error" role="alert">{error}</div>}
        {loading ? (
          <div className="empty-state">Loading support requests…</div>
        ) : requests.length ? (
          <div className="support-request-list">
            {requests.map((request) => (
              <article className="support-request-item" key={request.id}>
                <div className="support-request-copy">
                  <div className="support-request-meta">
                    <strong>{request.ticket_number}</strong>
                    <span className={`support-status is-${request.status}`}>
                      {statusLabel(request.status)}
                    </span>
                    <span>{formatDate(request.created_at)}</span>
                  </div>
                  <h3>{request.subject}</h3>
                  <p>{request.message}</p>
                  {isManager && (
                    <small>
                      {request.requester_name} · {request.requester_email} ·{" "}
                      {request.requester_role.replaceAll("_", " ")} · {request.category}
                    </small>
                  )}
                </div>
                {isManager && (
                  <label className="support-status-control">
                    <span className="sr-only">Update {request.ticket_number} status</span>
                    <select
                      value={request.status}
                      disabled={busy}
                      onChange={(event) => {
                        const nextStatus = supportStatuses.find(
                          (status) => status === event.target.value,
                        );
                        if (nextStatus) void updateStatus(request, nextStatus);
                      }}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>No support requests yet.</strong>
            <span>Requests you send will appear here.</span>
          </div>
        )}
      </section>
      <p className="support-emergency-note">
        This support channel is not monitored for emergencies or urgent patient-care
        decisions. Follow your facility&apos;s emergency procedures and contact the
        appropriate clinician.
      </p>
    </section>
  );
}
