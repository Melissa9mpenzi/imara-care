"use client";

import Image from "next/image";
import type { FacilityStaffMember } from "@/lib/staff-directory";

function formatRole(staffRole: string | null, role: string) {
  const value = staffRole ?? role;
  return value === "admin" ? "Administrator" : value.replaceAll("_", " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "Africa/Kampala",
  }).format(new Date(value));
}

export default function StaffProfile({
  member,
  onBack,
}: {
  member: FacilityStaffMember | null;
  onBack: () => void;
}) {
  if (!member) {
    return (
      <section className="staff-profile-view">
        <button className="back-link" type="button" onClick={onBack}>
          ← Back to staff directory
        </button>
        <div className="staff-directory-empty">
          <strong>This staff profile is unavailable.</strong>
          <span>It may have been removed or may not belong to this facility.</span>
        </div>
      </section>
    );
  }

  const accountStatus = member.banned
    ? "Suspended"
    : member.emailVerified
      ? "Active"
      : "Email not verified";

  return (
    <section className="staff-profile-view">
      <button className="back-link" type="button" onClick={onBack}>
        ← Back to staff directory
      </button>
      <section className="staff-profile-card">
        <header className="staff-profile-header">
          <div className="staff-profile-avatar">
            {member.image ? (
              <Image src={member.image} alt="" width={96} height={96} unoptimized />
            ) : (
              member.name
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()
            )}
          </div>
          <div className="staff-profile-heading">
            <div className="eyebrow">STAFF PROFILE</div>
            <h1>{member.name}</h1>
            <p>{member.email}</p>
            <div className="staff-profile-badges">
              <span className="staff-profile-badge">
                {formatRole(member.staffRole, member.role)}
              </span>
              <span className="staff-profile-badge">{accountStatus}</span>
            </div>
          </div>
        </header>

        <div className="staff-profile-sections">
          <section className="staff-profile-section" aria-labelledby="staff-details-title">
            <h2 id="staff-details-title">Account details</h2>
            <dl className="staff-detail-grid">
              <div>
                <dt>Work email</dt>
                <dd>{member.email}</dd>
              </div>
              <div>
                <dt>Staff role</dt>
                <dd>{formatRole(member.staffRole, member.role)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{member.departmentName ?? "Not assigned"}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>{formatDate(member.createdAt)}</dd>
              </div>
              <div>
                <dt>Email verification</dt>
                <dd>{member.emailVerified ? "Verified" : "Not verified"}</dd>
              </div>
              <div>
                <dt>Multi-factor authentication</dt>
                <dd>{member.twoFactorEnabled ? "Enabled" : "Not enabled"}</dd>
              </div>
            </dl>
          </section>

          <aside className="staff-profile-note">
            <strong>Access is role-based</strong>
            <p>
              Staff permissions and department access are assigned by the facility.
              Contact an administrator if this profile needs to be updated.
            </p>
          </aside>
        </div>
      </section>
    </section>
  );
}
