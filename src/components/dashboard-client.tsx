"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import type {
  AppNotification,
  Appointment,
  DashboardData,
  Department,
  Patient,
  QueueItem,
  Reminder,
} from "@/lib/api";

type Section = "overview" | "patients" | "appointments" | "queue" | "reminders" | "notifications";
type Modal = "patient" | "appointment" | "checkin" | "triage" | "reminder" | null;

type IconName =
  | "overview"
  | "patients"
  | "appointments"
  | "queue"
  | "pharmacy"
  | "laboratory"
  | "billing"
  | "theatre"
  | "security"
  | "staff"
  | "notifications"
  | "add"
  | "search"
  | "clock"
  | "logout";

const navigation: { id: Section; label: string; icon: IconName }[] = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "patients", label: "Patients", icon: "patients" },
  { id: "appointments", label: "Appointments", icon: "appointments" },
  { id: "queue", label: "Queue & triage", icon: "queue" },
];

const sectionLabels: Record<Section, string> = {
  overview: "Overview",
  patients: "Patients",
  appointments: "Appointments",
  queue: "Queue & triage",
  reminders: "My reminders",
  notifications: "Notifications",
};

const plannedModules: { label: string; icon: IconName }[] = [
  { label: "Pharmacy", icon: "pharmacy" },
  { label: "Laboratory", icon: "laboratory" },
  { label: "Billing & insurance", icon: "billing" },
  { label: "Theatre", icon: "theatre" },
];

function AppIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    patients: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="7.5" r="3.5" /><path d="M16 4.2a3.5 3.5 0 0 1 0 6.7M20 20v-1.5a3.5 3.5 0 0 0-2.7-3.4" /></>,
    appointments: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h3M8 17h6" /></>,
    queue: <><path d="M3 12h4l3-7 4 14 3-7h4" /><circle cx="3" cy="12" r="1" /><circle cx="21" cy="12" r="1" /></>,
    pharmacy: <><path d="m8 4 12 12a4.2 4.2 0 0 1-5.9 5.9l-12-12A4.2 4.2 0 0 1 8 4Z" /><path d="m7 13 6-6" /></>,
    laboratory: <><path d="M9 3h6M10 3v7l-5.5 8.2A2.5 2.5 0 0 0 6.6 22h10.8a2.5 2.5 0 0 0 2.1-3.8L14 10V3M8 16h8" /></>,
    billing: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    theatre: <><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M3 21h18M9 21v-5h6v5M12 7v5M9.5 9.5h5" /></>,
    security: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    staff: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6M17 11h6" /></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    add: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function displayName(patient: Patient) {
  return [patient.first_name, patient.other_names, patient.last_name]
    .filter(Boolean)
    .join(" ");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} day ago`;
}

function localDateTimeValue(value: Date) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function ageLabel(patient: Patient) {
  if (patient.date_of_birth) {
    const birth = new Date(patient.date_of_birth);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (
      now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
    ) {
      age -= 1;
    }
    return `${age} yrs`;
  }
  return patient.estimated_age == null ? "Age not set" : `~${patient.estimated_age} yrs`;
}

export default function DashboardClient() {
  const { data: session } = authClient.useSession();
  const [section, setSection] = useState<Section>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [facilityTimezone, setFacilityTimezone] = useState("Africa/Kampala");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<QueueItem | null>(null);
  const [search, setSearch] = useState("");
  const [queueDepartment, setQueueDepartment] = useState("all");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const globalSearchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [
        dashboardData,
        facilityData,
        patientData,
        appointmentData,
        queueData,
        reminderData,
        notificationData,
      ] =
        await Promise.all([
          api.get<DashboardData>("/dashboard"),
          api.get<{ departments: Department[]; timezone: string }>("/facility"),
          api.get<Patient[]>("/patients?limit=100"),
          api.get<Appointment[]>("/appointments"),
          api.get<QueueItem[]>("/queues?status=all"),
          api.get<Reminder[]>("/reminders?status=all"),
          api.get<{ items: AppNotification[]; unread_count: number }>("/notifications?limit=100"),
        ]);
      setDashboard(dashboardData);
      setDepartments(facilityData.departments);
      setPatients(patientData);
      setAppointments(appointmentData);
      setQueue(queueData);
      setReminders(reminderData);
      setNotifications(notificationData.items);
      setUnreadCount(notificationData.unread_count);
      setFacilityTimezone(facilityData.timezone);
      setConnected(true);
      setError("");
    } catch (reason) {
      setConnected(false);
      setError(reason instanceof Error ? reason.message : "Could not load the workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let lastGPressedAt = 0;
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (isTyping || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "/") {
        event.preventDefault();
        globalSearchRef.current?.focus();
      } else if (event.key.toLowerCase() === "g") {
        lastGPressedAt = Date.now();
      } else if (
        event.key.toLowerCase() === "p" &&
        Date.now() - lastGPressedAt < 1000
      ) {
        setSection("patients");
        lastGPressedAt = 0;
      } else if (event.key.toLowerCase() === "n") {
        if (section === "patients") setModal("patient");
        else if (section === "appointments") setModal("appointment");
        else setModal("reminder");
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [section]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const results = await api.get<Patient[]>(
          `/patients?q=${encodeURIComponent(search)}&limit=100`,
        );
        setPatients(results);
      } catch {
        // The connection banner is updated by the regular refresh.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const term = search.toLowerCase();
    return patients.filter((patient) =>
      [
        displayName(patient),
        patient.patient_number,
        patient.phone ?? "",
        patient.email ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [patients, search]);

  const visibleQueue = useMemo(
    () =>
      queue.filter(
        (item) =>
          (queueDepartment === "all" || item.department.id === queueDepartment) &&
          item.status !== "completed",
      ),
    [queue, queueDepartment],
  );

  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: (form: FormData) => Promise<void>,
  ) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await action(new FormData(event.currentTarget));
      setModal(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Please check the form and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function registerPatient(form: FormData) {
    const dob = String(form.get("date_of_birth") ?? "");
    const age = String(form.get("estimated_age") ?? "");
    const created = await api.post<Patient>("/patients", {
      first_name: form.get("first_name"),
      last_name: form.get("last_name"),
      other_names: form.get("other_names") || null,
      sex: form.get("sex"),
      date_of_birth: dob || null,
      estimated_age: age ? Number(age) : null,
      phone: form.get("phone") || null,
      alt_phone: form.get("alt_phone") || null,
      email: form.get("email") || null,
      national_id: form.get("national_id") || null,
      address: form.get("address") || null,
      next_of_kin_name: form.get("next_of_kin_name") || null,
      next_of_kin_relationship: form.get("next_of_kin_relationship") || null,
      next_of_kin_phone: form.get("next_of_kin_phone") || null,
      usual_payment_method: form.get("usual_payment_method"),
      allergies: String(form.get("allergies") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      sms_consent: form.get("sms_consent") === "on",
    });
    setSelectedPatient(created);
    setSuccess(`Patient ${created.patient_number} registered successfully.`);
  }

  async function bookAppointment(form: FormData) {
    const start = new Date(String(form.get("starts_at")));
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await api.post("/appointments", {
      patient_id: form.get("patient_id"),
      department_id: form.get("department_id"),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      appointment_type: form.get("appointment_type"),
      clinician: form.get("clinician") || null,
      reason: form.get("reason"),
      notes: form.get("notes") || null,
    });
    setSuccess("Appointment booked.");
  }

  async function checkIn(form: FormData) {
    const result = await api.post<QueueItem>("/visits/checkin", {
      patient_id: selectedPatient?.id,
      department_id: form.get("department_id"),
      reason: form.get("reason"),
      expected_payment_method: form.get("expected_payment_method"),
      priority: form.get("priority"),
    });
    setSuccess(`${result.patient.patient_number} checked in as ${result.queue_number}.`);
    setSection("queue");
  }

  async function saveTriage(form: FormData) {
    if (!selectedVisit) return;
    const optionalNumber = (name: string) => {
      const value = String(form.get(name) ?? "");
      return value ? Number(value) : null;
    };
    await api.post(`/triage/${selectedVisit.visit_id}`, {
      temperature: optionalNumber("temperature"),
      pulse: optionalNumber("pulse"),
      respiratory_rate: optionalNumber("respiratory_rate"),
      systolic: optionalNumber("systolic"),
      diastolic: optionalNumber("diastolic"),
      spo2: optionalNumber("spo2"),
      weight: optionalNumber("weight"),
      height: optionalNumber("height"),
      pain_score: optionalNumber("pain_score"),
      priority: form.get("priority"),
      notes: form.get("notes") || null,
      recorded_by: form.get("recorded_by") || "Triage Nurse",
    });
    setSuccess("Triage observations saved.");
  }

  async function callPatient(item: QueueItem) {
    try {
      await api.post(`/queues/${item.id}/call?staff_name=${encodeURIComponent("Triage Nurse")}`, {});
      setSuccess(`${item.queue_number} called.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not call the patient.");
    }
  }

  async function updateAppointment(appointment: Appointment, status: "confirmed" | "cancelled") {
    const reason =
      status === "cancelled" ? window.prompt("Reason for cancellation")?.trim() : undefined;
    if (status === "cancelled" && !reason) return;
    try {
      await api.patch(`/appointments/${appointment.id}`, {
        status,
        cancellation_reason: reason,
      });
      setSuccess(status === "cancelled" ? "Appointment cancelled." : "Appointment confirmed.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update appointment.");
    }
  }

  async function createReminder(form: FormData) {
    const dueAt = new Date(String(form.get("due_at")));
    const repeatUntilValue = String(form.get("repeat_until") ?? "");
    const earlierAlerts = form
      .getAll("alert_offsets")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    const reminder = await api.post<Reminder>("/reminders", {
      title: form.get("title"),
      note: form.get("note") || null,
      link_type: form.get("link_type") || null,
      link_id: form.get("link_id") || null,
      due_at: dueAt.toISOString(),
      timezone: facilityTimezone,
      repeat_frequency: form.get("repeat_frequency"),
      repeat_interval: Number(form.get("repeat_interval") || 1),
      repeat_until: repeatUntilValue
        ? new Date(`${repeatUntilValue}T23:59:59`).toISOString()
        : null,
      alert_offsets: [0, ...earlierAlerts],
      priority: form.get("priority"),
    });
    setSuccess(`Reminder "${reminder.title}" created.`);
  }

  async function updateReminder(reminder: Reminder, action: "done" | "cancel" | "snooze") {
    try {
      await api.patch(`/reminders/${reminder.id}`, {
        action,
        ...(action === "snooze"
          ? { snooze_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() }
          : {}),
      });
      setSuccess(
        action === "done"
          ? "Reminder completed."
          : action === "cancel"
            ? "Reminder cancelled."
            : "Reminder snoozed for 10 minutes.",
      );
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the reminder.");
    }
  }

  async function openNotification(notification: AppNotification) {
    try {
      await api.post("/notifications/read", { notification_ids: [notification.id] });
      setNotificationOpen(false);
      if (notification.link_type === "patient" && notification.link_id) {
        const patient = patients.find((item) => item.id === notification.link_id);
        if (patient) {
          setSearch(patient.patient_number);
          setSection("patients");
        }
      } else if (notification.link_type === "visit" && notification.link_id) {
        setSection("queue");
      } else if (notification.type === "personal_reminder") {
        setSection("reminders");
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the notification.");
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api.post("/notifications/read", {});
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update notifications.");
    }
  }

  const todayLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const firstName = session?.user.name?.trim().split(/\s+/)[0] ?? "there";
  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 18
        ? "Good afternoon"
        : "Good evening";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Image
            className="brand-logo"
            src="/images/Imara-Care%20Hospital%20Logo%20Banner.png"
            alt="Imara-Care Hospital Management"
            width={1800}
            height={1080}
            priority
          />
          <Image
            className="brand-icon"
            src="/images/Imara-Care%20Favicon.png"
            alt="Imara-Care"
            width={96}
            height={96}
            priority
          />
        </div>

        <div className="facility-switch">
          <div className="facility-icon">
            <Image
              src="/images/Imara-Care%20Favicon.png"
              alt=""
              width={28}
              height={28}
            />
          </div>
          <div className="facility-copy">
            <span>FACILITY</span>
            <strong>{dashboard?.facility_name ?? "Imara Care Clinic"}</strong>
          </div>
          <span className="chevron">⌄</span>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              className={`nav-item ${section === item.id ? "active" : ""}`}
              key={item.id}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="nav-icon"><AppIcon name={item.icon} size={19} /></span>
              <span>{item.label}</span>
              {item.id === "queue" && dashboard?.stats.waiting_now ? (
                <span className="nav-count">{dashboard.stats.waiting_now}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <section className="planned-modules" aria-labelledby="planned-modules-title">
          <div className="nav-label" id="planned-modules-title">COMING SOON</div>
          <div className="planned-module-list">
            {plannedModules.map((module) => (
              <div
                className="nav-item nav-item-disabled"
                key={module.label}
                aria-disabled="true"
                title={`${module.label} module coming soon`}
              >
                <span className="nav-icon"><AppIcon name={module.icon} size={19} /></span>
                <span>{module.label}</span>
                <span className="coming-soon-badge">Soon</span>
              </div>
            ))}
          </div>
        </section>

        <div className="sidebar-spacer" />
        <button
          className={`nav-item staff-invite-link ${section === "reminders" ? "active" : ""}`}
          onClick={() => setSection("reminders")}
        >
          <span className="nav-icon"><AppIcon name="clock" size={19} /></span>
          <span>My reminders</span>
          {reminders.filter((reminder) => reminder.status === "scheduled").length > 0 && (
            <span className="nav-count">{reminders.filter((reminder) => reminder.status === "scheduled").length}</span>
          )}
        </button>
        <a className="nav-item staff-invite-link" href="/security/two-factor">
          <span className="nav-icon"><AppIcon name="security" size={19} /></span>
          <span>My security</span>
        </a>
        <a className="nav-item staff-invite-link" href="/staff-invitations">
          <span className="nav-icon"><AppIcon name="staff" size={19} /></span>
          <span>Invite staff</span>
        </a>
        <div className="sidebar-help">
          <div className="help-mark" aria-hidden="true">?</div>
          <div>
            <strong>Need a hand?</strong>
            <span>Help &amp; support</span>
          </div>
          <span className="chevron">›</span>
        </div>
        <div className="user-profile">
          <div className="avatar">
            {(session?.user.name ?? "Staff")
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="user-copy">
            <strong>{session?.user.name ?? "Staff member"}</strong>
            <span>
              {(session?.user.staffRole ?? session?.user.role ?? "staff")
                .replaceAll("_", " ")
                .replace(/\b\w/g, (letter) => letter.toUpperCase())}
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void authClient.signOut().then(() => window.location.assign("/login"))}
          >
            <AppIcon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span><span className="crumb-slash">/</span>
            <strong>{sectionLabels[section]}</strong>
          </div>
          <div className="topbar-actions">
              <label className="global-search">
                <AppIcon name="search" size={17} />
                <input
                  ref={globalSearchRef}
                  aria-label="Search patients"
                  placeholder="Search patients…"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSection("patients");
                  }}
                />
                <kbd>/</kbd>
              </label>
              <div className={`connection ${connected ? "online" : "offline"}`}>
                <span className="connection-dot" /> {connected ? "Connected" : "Offline"}
              </div>
              <button className="button button-quiet topbar-reminder-button" onClick={() => setModal("reminder")}>
                <AppIcon name="add" size={17} /> <span>Reminder</span>
              </button>
              <div className="notification-menu-wrap">
                <button
                  className="icon-button notification-button"
                  aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
                  aria-expanded={notificationOpen}
                  onClick={() => setNotificationOpen((open) => !open)}
                >
                  <AppIcon name="notifications" size={20} />
                  {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
                </button>
                {notificationOpen && (
                  <NotificationPopover
                    items={notifications}
                    unreadCount={unreadCount}
                    onOpen={openNotification}
                    onMarkAllRead={markAllNotificationsRead}
                    onSeeAll={() => {
                      setSection("notifications");
                      setNotificationOpen(false);
                    }}
                  />
                )}
              </div>
              <div className="topbar-avatar">
              {(session?.user.name ?? "Staff")
                .split(/\s+/)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          </div>
        </header>

        <div className="content-area">
          {!connected && (
            <div className="alert alert-error">
              <strong>Backend connection lost.</strong> {error} Your changes have not been saved.
            </div>
          )}
          {connected && error && <div className="alert alert-error">{error}</div>}
          {success && (
            <div className="alert alert-success">
              <span>{success}</span>
              <button onClick={() => setSuccess("")} aria-label="Dismiss">×</button>
            </div>
          )}

          {section === "overview" && (
            <Overview
              todayLabel={todayLabel}
              greeting={`${greeting}, ${firstName}`}
              dashboard={dashboard}
              appointments={appointments}
              queue={queue}
              loading={loading}
              onNavigate={setSection}
              onBook={() => setModal("appointment")}
              onRegister={() => setModal("patient")}
              onCall={callPatient}
              onTriage={(item) => {
                setSelectedVisit(item);
                setModal("triage");
              }}
            />
          )}

          {section === "patients" && (
            <PatientsView
              patients={filteredPatients}
              search={search}
              onSearch={setSearch}
              onRegister={() => setModal("patient")}
              onCheckIn={(patient) => {
                setSelectedPatient(patient);
                setModal("checkin");
              }}
            />
          )}

          {section === "appointments" && (
            <AppointmentsView
              appointments={appointments}
              onBook={() => setModal("appointment")}
              onUpdate={updateAppointment}
            />
          )}

          {section === "queue" && (
            <QueueView
              items={visibleQueue}
              departments={departments}
              department={queueDepartment}
              onDepartmentChange={setQueueDepartment}
              onCall={callPatient}
              onTriage={(item) => {
                setSelectedVisit(item);
                setModal("triage");
              }}
            />
          )}
          {section === "reminders" && (
            <RemindersView
              reminders={reminders}
              timezone={facilityTimezone}
              onNew={() => setModal("reminder")}
              onAction={updateReminder}
            />
          )}
          {section === "notifications" && (
            <NotificationsView
              items={notifications}
              unreadCount={unreadCount}
              onOpen={openNotification}
              onMarkAllRead={markAllNotificationsRead}
            />
          )}
        </div>
      </main>

      {modal && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setModal(null);
        }}>
          {modal === "patient" && (
            <ModalFrame title="Register a patient" subtitle="Create a shared, lifelong patient record." onClose={() => setModal(null)}>
              <form className="form-grid" onSubmit={(event) => void submit(event, registerPatient)}>
                <label>First name<input name="first_name" required autoFocus /></label>
                <label>Last name<input name="last_name" required /></label>
                <label>Other names <span className="optional">(optional)</span><input name="other_names" /></label>
                <label>Sex<select name="sex" defaultValue="female"><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="not_specified">Prefer not to say</option></select></label>
                <label>Date of birth<input name="date_of_birth" type="date" /></label>
                <label>Estimated age <span className="optional">if DOB unknown</span><input name="estimated_age" type="number" min="0" max="125" /></label>
                <label>Phone<input name="phone" type="tel" /></label>
                <label>Alternative phone<input name="alt_phone" type="tel" /></label>
                <label>Email<input name="email" type="email" /></label>
                <label>National ID<input name="national_id" /></label>
                <label className="span-two">Address / village<input name="address" /></label>
                <div className="form-divider span-two">NEXT OF KIN</div>
                <label>Full name<input name="next_of_kin_name" /></label>
                <label>Relationship<input name="next_of_kin_relationship" /></label>
                <label>Phone<input name="next_of_kin_phone" type="tel" /></label>
                <label>Usual payment method<select name="usual_payment_method"><option value="cash">Cash</option><option value="insurance">Insurance</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
                <label className="span-two">Known allergies <span className="optional">separate with commas</span><input name="allergies" placeholder="e.g. penicillin, latex" /></label>
                <label className="check-label span-two"><input name="sms_consent" type="checkbox" /> Patient agrees to receive appointment reminders by SMS</label>
                <div className="modal-footer span-two">
                  <button type="button" className="button button-quiet" onClick={() => setModal(null)}>Cancel</button>
                  <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Register patient"}</button>
                </div>
                <p className="form-note span-two">Date of birth or estimated age is required. Potential duplicate records are flagged before saving.</p>
              </form>
            </ModalFrame>
          )}

          {modal === "appointment" && (
            <ModalFrame title="Book an appointment" subtitle="Choose a patient, department and time." onClose={() => setModal(null)}>
              <form className="form-grid" onSubmit={(event) => void submit(event, bookAppointment)}>
                <label className="span-two">Patient<select name="patient_id" required defaultValue=""><option value="" disabled>Select patient</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.patient_number} · {displayName(patient)}</option>)}</select></label>
                <label>Department<select name="department_id" required defaultValue="">{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
                <label>Visit type<select name="appointment_type"><option value="new">New visit</option><option value="review">Review</option><option value="procedure">Procedure</option><option value="antenatal">Antenatal visit</option><option value="physiotherapy">Physiotherapy</option></select></label>
                <label>Date &amp; time<input name="starts_at" type="datetime-local" required /></label>
                <label>Clinician <span className="optional">(optional)</span><input name="clinician" placeholder="e.g. Dr. A. Namara" /></label>
                <label className="span-two">Reason for visit<input name="reason" required /></label>
                <label className="span-two">Notes <span className="optional">(optional)</span><textarea name="notes" rows={3} /></label>
                <div className="modal-footer span-two">
                  <button type="button" className="button button-quiet" onClick={() => setModal(null)}>Cancel</button>
                  <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Book appointment"}</button>
                </div>
              </form>
            </ModalFrame>
          )}

          {modal === "checkin" && selectedPatient && (
            <ModalFrame title="Check in patient" subtitle={`${selectedPatient.patient_number} · ${displayName(selectedPatient)}`} onClose={() => setModal(null)}>
              <form className="form-grid" onSubmit={(event) => void submit(event, checkIn)}>
                <label className="span-two">Department<select name="department_id" required defaultValue="">{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
                <label className="span-two">Reason for visit<input name="reason" required autoFocus /></label>
                <label>Payment method<select name="expected_payment_method" defaultValue={selectedPatient.usual_payment_method}><option value="cash">Cash</option><option value="insurance">Insurance</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></label>
                <label>Priority<select name="priority"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
                <div className="modal-footer span-two">
                  <button type="button" className="button button-quiet" onClick={() => setModal(null)}>Cancel</button>
                  <button className="button button-primary" disabled={saving}>{saving ? "Checking in…" : "Check in & get queue number"}</button>
                </div>
              </form>
            </ModalFrame>
          )}

          {modal === "triage" && selectedVisit && (
            <ModalFrame title="Record triage" subtitle={`${selectedVisit.queue_number} · ${displayName(selectedVisit.patient)}`} onClose={() => setModal(null)}>
              <form className="form-grid" onSubmit={(event) => void submit(event, saveTriage)}>
                <label>Temperature °C<input name="temperature" type="number" min="25" max="45" step="0.1" defaultValue={selectedVisit.triage?.temperature ?? ""} /></label>
                <label>Pulse / min<input name="pulse" type="number" min="0" max="300" defaultValue={selectedVisit.triage?.pulse ?? ""} /></label>
                <label>Respiratory rate<input name="respiratory_rate" type="number" min="0" max="100" defaultValue={selectedVisit.triage?.respiratory_rate ?? ""} /></label>
                <label>Blood pressure (mmHg)<div className="split-input"><input aria-label="Systolic blood pressure" name="systolic" type="number" placeholder="Sys" defaultValue={selectedVisit.triage?.systolic ?? ""} /><span>/</span><input aria-label="Diastolic blood pressure" name="diastolic" type="number" placeholder="Dia" defaultValue={selectedVisit.triage?.diastolic ?? ""} /></div></label>
                <label>Oxygen saturation %<input name="spo2" type="number" min="0" max="100" defaultValue={selectedVisit.triage?.spo2 ?? ""} /></label>
                <label>Pain score (0–10)<input name="pain_score" type="number" min="0" max="10" defaultValue={selectedVisit.triage?.pain_score ?? ""} /></label>
                <label>Weight kg<input name="weight" type="number" min="0" max="500" step="0.1" defaultValue={selectedVisit.triage?.weight ?? ""} /></label>
                <label>Height cm<input name="height" type="number" min="0" max="260" step="0.1" defaultValue={selectedVisit.triage?.height ?? ""} /></label>
                <label>Priority<select name="priority" defaultValue={selectedVisit.triage?.priority ?? selectedVisit.priority}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
                <label>Recorded by<input name="recorded_by" defaultValue="Triage Nurse" /></label>
                <label className="span-two">Notes<textarea name="notes" rows={3} /></label>
                <div className="modal-footer span-two">
                  <button type="button" className="button button-quiet" onClick={() => setModal(null)}>Cancel</button>
                  <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save triage"}</button>
                </div>
              </form>
            </ModalFrame>
          )}

          {modal === "reminder" && (
            <ModalFrame
              title="Create a reminder"
              subtitle="Choose when to be reminded. Times use your facility timezone."
              onClose={() => setModal(null)}
            >
              <form className="form-grid" onSubmit={(event) => void submit(event, createReminder)}>
                <label className="span-two">Title<input name="title" required maxLength={160} autoFocus placeholder="e.g. Review tomorrow’s schedule" /></label>
                <label className="span-two">Note <span className="optional">(optional)</span><textarea name="note" maxLength={500} placeholder="Avoid clinical details. Use a link instead." rows={2} /></label>
                <label>Due date &amp; time<input name="due_at" type="datetime-local" required defaultValue={localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))} /></label>
                <label>Priority<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="high">High</option></select></label>
                <label>Repeat<select name="repeat_frequency" defaultValue="none"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Every N days</option></select></label>
                <label>Repeat interval<input name="repeat_interval" type="number" min="1" max="365" defaultValue="1" /></label>
                <label className="span-two">Repeat until <span className="optional">(optional)</span><input name="repeat_until" type="date" /></label>
                <div className="form-divider span-two">ALERT ME</div>
                <label className="check-label span-two"><input name="alert_offsets" type="checkbox" value="10" /> 10 minutes before</label>
                <label className="check-label span-two"><input name="alert_offsets" type="checkbox" value="60" /> 1 hour before</label>
                <label className="check-label span-two"><input name="alert_offsets" type="checkbox" value="1440" /> 1 day before</label>
                <div className="form-divider span-two">LINK (OPTIONAL)</div>
                <label>Link type<select name="link_type" defaultValue=""><option value="">No link</option><option value="patient">Patient</option><option value="visit">Visit</option><option value="order">Order</option><option value="invoice">Invoice</option><option value="page">Page</option></select></label>
                <label>Link ID<input name="link_id" maxLength={128} placeholder="Record ID" /></label>
                <div className="modal-footer span-two">
                  <button type="button" className="button button-quiet" onClick={() => setModal(null)}>Cancel</button>
                  <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Create reminder"}</button>
                </div>
                <p className="form-note span-two">High-priority reminders are highlighted. Reminders are private to your account.</p>
              </form>
            </ModalFrame>
          )}
        </div>
      )}
    </div>
  );
}

function Overview({
  todayLabel,
  greeting,
  dashboard,
  appointments,
  queue,
  loading,
  onNavigate,
  onBook,
  onRegister,
  onCall,
  onTriage,
}: {
  todayLabel: string;
  greeting: string;
  dashboard: DashboardData | null;
  appointments: Appointment[];
  queue: QueueItem[];
  loading: boolean;
  onNavigate: (section: Section) => void;
  onBook: () => void;
  onRegister: () => void;
  onCall: (item: QueueItem) => void;
  onTriage: (item: QueueItem) => void;
}) {
  const stats = dashboard?.stats;
  const nextAppointments = appointments
    .filter((appointment) => ["booked", "confirmed"].includes(appointment.status))
    .slice(0, 4);
  const waiting = queue
    .filter((item) => item.status === "waiting")
    .slice(0, 5);

  return (
    <>
      <div className="page-heading overview-heading">
        <div className="overview-welcome">
          <div className="eyebrow">{todayLabel}</div>
          <h1>{greeting}</h1>
          <p>Here&apos;s your facility snapshot for today. Let&apos;s make it a great one.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-quiet" onClick={onRegister}><AppIcon name="patients" size={18} /> Register patient</button>
          <button className="button button-primary" onClick={onBook}><AppIcon name="add" size={18} /> Book appointment</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Patients today" value={stats?.patients_today ?? 0} note="New registrations" icon="patients" color="green" />
        <StatCard label="Visits today" value={stats?.visits_today ?? 0} note="Checked in today" icon="queue" color="blue" />
        <StatCard label="Waiting now" value={stats?.waiting_now ?? 0} note="Across all departments" icon="clock" color="orange" />
        <StatCard label="Appointments" value={stats?.appointments_today ?? 0} note="Scheduled for today" icon="appointments" color="purple" />
      </div>

      <div className="section-title-row overview-section-heading">
        <div><h2>Facility overview</h2><p>A live look at patient flow and today&apos;s schedule</p></div>
        <span className="live-tag"><i /> UPDATES EVERY 15 SEC</span>
      </div>

      <div className="dashboard-grid">
        <section className="panel department-panel">
          <div className="panel-heading">
            <div><h3>Department queues</h3><span className="panel-subtitle">Patients waiting to be seen</span></div>
            <button className="text-button" onClick={() => onNavigate("queue")}>View all <span>→</span></button>
          </div>
          <div className="department-list">
            {(dashboard?.departments ?? []).slice(0, 6).map((department, index) => (
              <div className="department-row" key={department.id}>
                <div className={`department-badge badge-${index % 5}`}><AppIcon name="queue" size={18} /></div>
                <div className="department-name"><strong>{department.name}</strong><span>{department.code} department</span></div>
                <div className="department-wait"><strong>{department.waiting ?? 0}</strong><span>waiting</span></div>
                <div className="mini-bar"><i style={{ width: `${Math.min(100, (department.waiting ?? 0) * 13)}%` }} /></div>
              </div>
            ))}
            {!loading && !dashboard?.departments.length && <EmptyState title="No departments configured" detail="Check the backend seed setup." />}
          </div>
        </section>

        <section className="panel appointments-panel">
          <div className="panel-heading">
            <div><h3>Upcoming appointments</h3><span className="panel-subtitle">Today&apos;s schedule</span></div>
            <button className="text-button" onClick={() => onNavigate("appointments")}>View all <span>→</span></button>
          </div>
          <div className="appointment-list">
            {nextAppointments.map((appointment) => (
              <div className="appointment-row" key={appointment.id}>
                <div className="appointment-time">{formatTime(appointment.starts_at)}</div>
                <div className="appointment-details"><strong>{displayName(appointment.patient)}</strong><span>{appointment.department.name} · {appointment.reason}</span></div>
                <span className={`status-pill status-${appointment.status}`}>{appointment.status}</span>
              </div>
            ))}
            {!nextAppointments.length && <EmptyState title="No upcoming appointments" detail="New bookings will appear here." />}
          </div>
          <button className="panel-bottom-action" onClick={onBook}>+ Schedule an appointment</button>
        </section>

        <section className="panel queue-panel">
          <div className="panel-heading">
            <div><h3>Waiting room</h3><span className="panel-subtitle">{stats?.waiting_now ?? 0} patients are waiting</span></div>
            <button className="text-button" onClick={() => onNavigate("queue")}>Open queue <span>→</span></button>
          </div>
          {waiting.map((item) => (
            <div className="waiting-row" key={item.id}>
              <div className={`queue-chip priority-${item.priority}`}>{item.queue_number}</div>
              <div className="waiting-person"><strong>{displayName(item.patient)}</strong><span>{item.department.name} · {item.reason}</span></div>
              <div className="waiting-actions">
                <button className="small-outline" onClick={() => onTriage(item)}>Triage</button>
                <button className="small-primary" onClick={() => onCall(item)}>Call</button>
              </div>
            </div>
          ))}
          {!waiting.length && <EmptyState title="Waiting room is clear" detail="Checked-in patients appear here." />}
        </section>

        <section className="panel quick-panel">
          <div className="panel-heading"><div><h3>Quick actions</h3><span className="panel-subtitle">Common front desk tasks</span></div></div>
          <button className="quick-action" onClick={onRegister}><span className="quick-icon quick-green"><AppIcon name="patients" /></span><span><strong>Register a patient</strong><small>Create a new patient record</small></span><b aria-hidden="true">→</b></button>
          <button className="quick-action" onClick={() => onNavigate("patients")}><span className="quick-icon quick-blue"><AppIcon name="search" /></span><span><strong>Find a patient</strong><small>Search the patient directory</small></span><b aria-hidden="true">→</b></button>
          <button className="quick-action" onClick={onBook}><span className="quick-icon quick-purple"><AppIcon name="appointments" /></span><span><strong>Book an appointment</strong><small>Reserve a visit time</small></span><b aria-hidden="true">→</b></button>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value, note, icon, color }: { label: string; value: number; note: string; icon: IconName; color: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon icon-${color}`}><AppIcon name={icon} size={21} /></div>
      <div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </div>
  );
}

function NotificationPopover({
  items,
  unreadCount,
  onOpen,
  onMarkAllRead,
  onSeeAll,
}: {
  items: AppNotification[];
  unreadCount: number;
  onOpen: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  onSeeAll: () => void;
}) {
  const recent = items.slice(0, 10);
  const todayKey = new Date().toLocaleDateString();
  const todayItems = recent.filter((item) => new Date(item.created_at).toLocaleDateString() === todayKey);
  const earlierItems = recent.filter((item) => new Date(item.created_at).toLocaleDateString() !== todayKey);

  return (
    <section className="notification-popover" aria-label="Recent notifications">
      <header className="notification-popover-heading">
        <div><strong>Notifications</strong><span>{unreadCount} unread</span></div>
        {unreadCount > 0 && <button className="text-button" onClick={onMarkAllRead}>Mark all as read</button>}
      </header>
      {items.length ? (
        <div className="notification-items">
          {todayItems.length > 0 && <div className="notification-group-label">Today</div>}
          {todayItems.map((item) => (
            <button
              className={`notification-item ${item.status === "unread" ? "unread" : ""} priority-${item.priority}`}
              key={item.id}
              onClick={() => onOpen(item)}
            >
              <span className="notification-item-icon"><AppIcon name={item.type === "personal_reminder" ? "clock" : "notifications"} size={18} /></span>
              <span className="notification-item-copy">
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <time dateTime={item.created_at}>{formatRelativeTime(item.created_at)}</time>
              </span>
              {item.status === "unread" && <i className="unread-dot" />}
            </button>
          ))}
          {earlierItems.length > 0 && <div className="notification-group-label">Earlier</div>}
          {earlierItems.map((item) => (
            <button
              className={`notification-item ${item.status === "unread" ? "unread" : ""} priority-${item.priority}`}
              key={item.id}
              onClick={() => onOpen(item)}
            >
              <span className="notification-item-icon"><AppIcon name={item.type === "personal_reminder" ? "clock" : "notifications"} size={18} /></span>
              <span className="notification-item-copy">
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <time dateTime={item.created_at}>{formatRelativeTime(item.created_at)}</time>
              </span>
              {item.status === "unread" && <i className="unread-dot" />}
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="You’re all caught up" detail="New notifications will appear here." />
      )}
      <button className="notification-see-all" onClick={onSeeAll}>See all notifications <span>→</span></button>
    </section>
  );
}

function NotificationsView({
  items,
  unreadCount,
  onOpen,
  onMarkAllRead,
}: {
  items: AppNotification[];
  unreadCount: number;
  onOpen: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "unread" | "tasks" | "alerts" | "system">("all");
  const filtered = items.filter((item) => {
    if (filter === "unread") return item.status === "unread";
    if (filter === "tasks") return item.type === "personal_reminder";
    if (filter === "alerts") return ["high", "critical"].includes(item.priority);
    if (filter === "system") return item.type !== "personal_reminder";
    return true;
  });

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">YOUR UPDATES</div><h1>Notifications</h1><p>Personal reminders and important updates for your workspace.</p></div>
        {unreadCount > 0 && <button className="button button-quiet" onClick={onMarkAllRead}>Mark all as read</button>}
      </div>
      <section className="panel notification-page-list">
        <div className="panel-heading"><div><h3>Recent notifications</h3><span className="panel-subtitle">{unreadCount} unread</span></div></div>
        <div className="notification-filter-tabs" role="tablist" aria-label="Notification type">
          {(["all", "unread", "tasks", "alerts", "system"] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={filter === item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        {filtered.length ? filtered.map((item) => (
          <button
            className={`notification-item ${item.status === "unread" ? "unread" : ""} priority-${item.priority}`}
            key={item.id}
            onClick={() => onOpen(item)}
          >
            <span className="notification-item-icon"><AppIcon name={item.type === "personal_reminder" ? "clock" : "notifications"} size={18} /></span>
            <span className="notification-item-copy">
              <strong>{item.title}</strong>
              <small>{item.body}</small>
              <time dateTime={item.created_at}>{formatRelativeTime(item.created_at)}</time>
            </span>
            {item.status === "unread" && <i className="unread-dot" />}
          </button>
        )) : <EmptyState title={filter === "all" ? "No notifications yet" : `No ${filter} notifications`} detail="When something needs your attention, it will show up here." />}
      </section>
    </>
  );
}

function RemindersView({
  reminders,
  timezone,
  onNew,
  onAction,
}: {
  reminders: Reminder[];
  timezone: string;
  onNew: () => void;
  onAction: (reminder: Reminder, action: "done" | "cancel" | "snooze") => void;
}) {
  const [filter, setFilter] = useState<"upcoming" | "today" | "overdue" | "completed">("upcoming");
  const now = Date.now();
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  function reminderDay(reminder: Reminder) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: reminder.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(reminder.due_at));
  }
  const filtered = reminders.filter((reminder) => {
    if (filter === "completed") return reminder.status !== "scheduled";
    if (reminder.status !== "scheduled") return false;
    const due = new Date(reminder.due_at).getTime();
    if (filter === "overdue") return due < now;
    if (filter === "today") return reminderDay(reminder) === todayKey && due >= now;
    return due >= now && reminderDay(reminder) !== todayKey;
  });

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">PERSONAL TASKS</div><h1>My reminders</h1><p>Keep track of follow-ups and tasks you don’t want to miss.</p></div>
        <button className="button button-primary" onClick={onNew}><AppIcon name="add" size={18} /> Add reminder</button>
      </div>
      <section className="panel reminder-page-list">
        <div className="reminder-tabs" role="tablist" aria-label="Reminder status">
          {(["upcoming", "today", "overdue", "completed"] as const).map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              role="tab"
              aria-selected={filter === item}
              onClick={() => setFilter(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        {filtered.length ? filtered.map((reminder) => (
          <div className="reminder-row" key={reminder.id}>
            <span className={`reminder-priority-dot ${reminder.priority}`} />
            <div className="reminder-copy">
              <strong>{reminder.title}</strong>
              <span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: reminder.timezone }).format(new Date(reminder.due_at))} · {reminder.timezone}</span>
              {reminder.note && <small>{reminder.note}</small>}
            </div>
            {reminder.status === "scheduled" ? (
              <div className="reminder-actions">
                <button className="small-outline" onClick={() => onAction(reminder, "snooze")}>Snooze 10 min</button>
                <button className="small-primary" onClick={() => onAction(reminder, "done")}>Done</button>
                <button className="icon-button" aria-label={`Cancel ${reminder.title}`} onClick={() => onAction(reminder, "cancel")}>×</button>
              </div>
            ) : <span className="reminder-completed-label">{reminder.status}</span>}
          </div>
        )) : (
          <EmptyState
            title={filter === "completed" ? "No completed reminders" : filter === "overdue" ? "No overdue reminders" : filter === "today" ? "No reminders due today" : "Nothing on your list"}
            detail={filter === "upcoming" ? "Create a reminder to keep an important task on track." : "Reminders in this category will appear here."}
          />
        )}
      </section>
      <p className="reminder-privacy-note">Reminders are private to your account. Avoid including clinical details in reminder titles or notes.</p>
    </>
  );
}

function PatientsView({ patients, search, onSearch, onRegister, onCheckIn }: { patients: Patient[]; search: string; onSearch: (value: string) => void; onRegister: () => void; onCheckIn: (patient: Patient) => void }) {
  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">PATIENT RECORDS</div><h1>Patients</h1><p>Find returning patients or create a new record.</p></div>
        <button className="button button-primary" onClick={onRegister}><span className="button-plus">+</span> Register patient</button>
      </div>
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <div className="search-field"><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, patient number or phone…" autoComplete="off" /></div>
          <span className="result-count">{patients.length} records</span>
        </div>
        <PatientTable patients={patients} onCheckIn={onCheckIn} />
      </section>
    </>
  );
}

function PatientTable({ patients, onCheckIn }: { patients: Patient[]; onCheckIn: (patient: Patient) => void }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Patient</th><th>Patient number</th><th>Age / sex</th><th>Phone</th><th>Payment</th><th>Allergies</th><th /></tr></thead>
        <tbody>
          {patients.map((patient) => (
            <tr key={patient.id}>
              <td><div className="table-person"><div className="person-avatar">{patient.first_name[0]}{patient.last_name[0]}</div><span><strong>{displayName(patient)}</strong><small>Registered {formatDate(patient.created_at)}</small></span></div></td>
              <td><span className="patient-id">{patient.patient_number}</span></td>
              <td>{ageLabel(patient)} <span className="muted">/ {patient.sex.replace("_", " ")}</span></td>
              <td>{patient.phone || <span className="muted">—</span>}</td>
              <td><span className="payment-tag">{patient.usual_payment_method.replace("_", " ")}</span></td>
              <td>{patient.allergies.length ? <span className="allergy-tag">{patient.allergies.join(", ")}</span> : <span className="muted">None recorded</span>}</td>
              <td><button className="small-outline" onClick={() => onCheckIn(patient)}>Check in</button></td>
            </tr>
          ))}
          {!patients.length && <tr><td colSpan={7}><EmptyState title="No patients found" detail="Try another search or register a new patient." /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function AppointmentsView({ appointments, onBook, onUpdate }: { appointments: Appointment[]; onBook: () => void; onUpdate: (appointment: Appointment, status: "confirmed" | "cancelled") => void }) {
  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">SCHEDULE</div><h1>Appointments</h1><p>Manage upcoming visits and keep the day moving.</p></div>
        <button className="button button-primary" onClick={onBook}><span className="button-plus">+</span> Book appointment</button>
      </div>
      <section className="panel directory-panel">
        <div className="panel-heading appointment-view-heading"><div><h3>Upcoming schedule</h3><span className="panel-subtitle">Today and the next seven days</span></div><span className="result-count">{appointments.length} appointments</span></div>
        {!appointments.length && <EmptyState title="No appointments scheduled" detail="Use Book appointment to add a visit." />}
        {appointments.map((appointment) => (
          <div className="schedule-row" key={appointment.id}>
            <div className="schedule-date"><strong>{new Intl.DateTimeFormat("en", { day: "2-digit" }).format(new Date(appointment.starts_at))}</strong><span>{new Intl.DateTimeFormat("en", { month: "short" }).format(new Date(appointment.starts_at))}</span></div>
            <div className="schedule-time">{formatTime(appointment.starts_at)}<span>30 min</span></div>
            <div className="table-person schedule-person"><div className="person-avatar">{appointment.patient.first_name[0]}{appointment.patient.last_name[0]}</div><span><strong>{displayName(appointment.patient)}</strong><small>{appointment.patient.patient_number} · {appointment.reason}</small></span></div>
            <div className="schedule-department">{appointment.department.name}{appointment.clinician && <small>{appointment.clinician}</small>}</div>
            <span className={`status-pill status-${appointment.status}`}>{appointment.status}</span>
            <div className="schedule-actions">
              {appointment.status === "booked" && <button className="small-outline" onClick={() => onUpdate(appointment, "confirmed")}>Confirm</button>}
              {["booked", "confirmed"].includes(appointment.status) && <button className="icon-button" aria-label="Cancel appointment" onClick={() => onUpdate(appointment, "cancelled")}>×</button>}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function QueueView({ items, departments, department, onDepartmentChange, onCall, onTriage }: { items: QueueItem[]; departments: Department[]; department: string; onDepartmentChange: (value: string) => void; onCall: (item: QueueItem) => void; onTriage: (item: QueueItem) => void }) {
  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">PATIENT FLOW</div><h1>Queue &amp; triage</h1><p>Prioritise arrivals and keep every department in sync.</p></div>
        <div className="live-tag"><i /> AUTO-REFRESH 15S</div>
      </div>
      <section className="panel directory-panel">
        <div className="directory-toolbar">
          <div><h3 className="toolbar-title">Today&apos;s waiting room</h3><span className="panel-subtitle">{items.length} open queue entries</span></div>
          <select className="filter-select" value={department} onChange={(event) => onDepartmentChange(event.target.value)}><option value="all">All departments</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </div>
        {!items.length && <EmptyState title="No patients in this queue" detail="Patients appear here after front desk check-in." />}
        {items.map((item) => (
          <div className="queue-list-row" key={item.id}>
            <div className={`queue-chip priority-${item.priority}`}>{item.queue_number}</div>
            <div className="table-person queue-person"><div className="person-avatar">{item.patient.first_name[0]}{item.patient.last_name[0]}</div><span><strong>{displayName(item.patient)}</strong><small>{item.patient.patient_number} · {ageLabel(item.patient)} · {item.patient.sex}</small></span></div>
            <div className="queue-reason"><strong>{item.reason}</strong><span>{item.department.name}</span></div>
            <div className={`priority-label priority-text-${item.priority}`}><i />{item.priority}</div>
            <div className="queue-arrival">{Math.max(0, Math.floor((Date.now() - new Date(item.arrived_at).getTime()) / 60000))} min<span>waiting</span></div>
            <div className="schedule-actions"><button className="small-outline" onClick={() => onTriage(item)}>{item.triage ? "Edit triage" : "Triage"}</button>{item.status === "waiting" && <button className="small-primary" onClick={() => onCall(item)}>Call patient</button>}</div>
          </div>
        ))}
      </section>
      <div className="queue-footnote"><span className="connection-dot" /> Queue refreshes automatically. Emergency and urgent visits are prioritised.</div>
    </>
  );
}

function ModalFrame({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog">×</button></div>
      {children}
    </section>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-symbol">—</div><strong>{title}</strong><span>{detail}</span></div>;
}
