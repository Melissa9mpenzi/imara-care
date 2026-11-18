"use client";

import { useMemo, useState } from "react";
import type { FacilityStaffMember } from "@/lib/staff-directory";

function displayRole(member: FacilityStaffMember) {
  const role = member.staffRole ?? member.role;
  if (role === "admin") return "Administrator";
  return role.replaceAll("_", " ");
}

function accountStatus(member: FacilityStaffMember) {
  if (member.banned) return "Suspended";
  return member.emailVerified ? "Active" : "Email not verified";
}

export default function StaffDirectory({
  staff,
}: {
  staff: FacilityStaffMember[];
}) {
  const [search, setSearch] = useState("");
  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return staff;
    return staff.filter((member) =>
      [
        member.name,
        member.email,
        member.staffRole,
        member.departmentName,
        member.departmentCode,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query)),
    );
  }, [search, staff]);

  return (
    <main className="staff-directory-page">
      <a className="back-link" href="/">← Back to workspace</a>
      <header className="staff-page-heading">
        <div>
          <div className="eyebrow">STAFF MANAGEMENT</div>
          <h1>Staff directory</h1>
          <p>View staff accounts, roles, departments, and account security.</p>
        </div>
        <a className="button button-primary" href="/staff-invitations">
          Invite staff
        </a>
      </header>

      <section className="staff-directory-card" aria-labelledby="staff-list-title">
        <div className="staff-directory-toolbar">
          <div>
            <h2 id="staff-list-title">Facility staff</h2>
            <p>{staff.length} {staff.length === 1 ? "account" : "accounts"}</p>
          </div>
          <label className="staff-search">
            <span className="sr-only">Search staff</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, email, role, or department"
            />
          </label>
        </div>

        {filteredStaff.length ? (
          <div className="staff-table-scroll">
            <div className="staff-table" role="table" aria-label="Facility staff">
              <div className="staff-table-header" role="row">
                <span role="columnheader">Staff member</span>
                <span role="columnheader">Role & department</span>
                <span role="columnheader">Account</span>
                <span role="columnheader">MFA</span>
                <span aria-hidden="true" />
              </div>
              {filteredStaff.map((member) => (
                <a
                  className="staff-table-row"
                  href={`/staff/${encodeURIComponent(member.id)}`}
                  key={member.id}
                  role="row"
                >
                  <span className="staff-identity" role="cell">
                    <span className="staff-avatar" aria-hidden="true">
                      {member.name
                        .split(/\s+/)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="staff-identity-copy">
                      <strong>{member.name}</strong>
                      <small>{member.email}</small>
                    </span>
                  </span>
                  <span className="staff-role-cell" role="cell">
                    <strong>{displayRole(member)}</strong>
                    <small>{member.departmentName ?? "Department not assigned"}</small>
                  </span>
                  <span role="cell">
                    <span className={`staff-status ${member.banned ? "is-suspended" : ""}`}>
                      {accountStatus(member)}
                    </span>
                  </span>
                  <span role="cell">{member.twoFactorEnabled ? "Enabled" : "Not enabled"}</span>
                  <span className="staff-row-arrow" aria-hidden="true">→</span>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="staff-directory-empty">
            <strong>{staff.length ? "No staff match that search." : "No staff accounts yet."}</strong>
            <span>
              {staff.length
                ? "Try a different name, email, role, or department."
                : "Invite staff to add their accounts to this facility."}
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
