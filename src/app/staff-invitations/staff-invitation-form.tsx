"use client";

import { useEffect, useState } from "react";

type CreatedInvitation = {
  id: string;
  email: string;
  departmentName: string;
  expiresAt: string;
  invitationUrl?: string;
};

type DepartmentOption = {
  code: string;
  name: string;
};

const staffRoles = [
  ["facility_admin", "Facility administrator"],
  ["medical_director", "Medical director"],
  ["department_head", "Department head"],
  ["clinician", "Doctor / clinician"],
  ["pharmacist", "Pharmacist"],
  ["reception", "Reception"],
  ["laboratory", "Laboratory"],
  ["pharmacy", "Pharmacy staff"],
  ["cashier", "Cashier"],
  ["billing", "Billing staff"],
  ["theatre", "Theatre staff"],
  ["nurse", "Nurse"],
  ["records", "Medical records"],
];

const roleDepartments: Record<string, string> = {
  pharmacist: "PHARM",
  pharmacy: "PHARM",
  laboratory: "LAB",
  cashier: "BILL",
  billing: "BILL",
  theatre: "THR",
};

export default function StaffInvitationForm() {
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffRole, setStaffRole] = useState("reception");
  const [departmentCode, setDepartmentCode] = useState("OPD");

  useEffect(() => {
    void fetch("/api/staff/invitations", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.detail ?? "Departments could not be loaded.");
        setDepartments(body.departments as DepartmentOption[]);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "Departments could not be loaded.");
      });
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/staff/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          fullName: form.get("fullName"),
          staffRole: form.get("staffRole"),
          departmentCode: form.get("departmentCode"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "The invitation could not be created.");
      setCreated(body as CreatedInvitation);
      formElement.reset();
      setStaffRole("reception");
      setDepartmentCode("OPD");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The invitation could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!created) return;
    const response = await fetch("/api/staff/invitations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: created.id }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.detail ?? "The invitation could not be revoked.");
      return;
    }
    setCreated(null);
  }

  return (
    <main className="auth-page">
      <section className="auth-card invitation-card">
        <a className="back-link" href="/">← Back to workspace</a>
        <div className="eyebrow">STAFF MANAGEMENT</div>
        <h1>Invite a staff member</h1>
        <p>Only invited people can create staff accounts. Invitations expire after 48 hours.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="fullName">Full name</label>
          <input id="fullName" name="fullName" autoComplete="name" maxLength={160} required />
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" maxLength={254} required />
          <label htmlFor="staffRole">Role</label>
          <select
            id="staffRole"
            name="staffRole"
            value={staffRole}
            onChange={(event) => {
              const nextRole = event.target.value;
              setStaffRole(nextRole);
              if (roleDepartments[nextRole]) setDepartmentCode(roleDepartments[nextRole]);
            }}
          >
            {staffRoles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="departmentCode">Primary department</label>
          <select
            id="departmentCode"
            name="departmentCode"
            value={departmentCode}
            onChange={(event) => setDepartmentCode(event.target.value)}
            required
            disabled={!departments.length}
          >
            {departments.map((department) => (
              <option key={department.code} value={department.code}>{department.name}</option>
            ))}
          </select>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Creating invitation..." : "Send invitation"}
          </button>
        </form>
        {created && (
          <div className="invitation-result" role="status">
            <strong>Invitation created for {created.email}</strong>
            <span>Department: {created.departmentName}.</span>
            <span>Expires {new Date(created.expiresAt).toLocaleString()}.</span>
            {created.invitationUrl ? (
              <>
                <label htmlFor="invite-link">Development invitation link</label>
                <input id="invite-link" readOnly value={created.invitationUrl} onFocus={(event) => event.target.select()} />
              </>
            ) : (
              <span>The invitation link was sent to the staff member’s email.</span>
            )}
            <button type="button" className="text-button" onClick={() => void revoke()}>
              Revoke invitation
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
