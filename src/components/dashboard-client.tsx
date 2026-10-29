"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { api } from "@/lib/api";
import type {
  Appointment,
  DashboardData,
  Department,
  Patient,
  QueueItem,
} from "@/lib/api";

type Section = "overview" | "patients" | "appointments" | "queue";
type Modal = "patient" | "appointment" | "checkin" | "triage" | null;

const navigation: { id: Section; label: string; short: string }[] = [
  { id: "overview", label: "Overview", short: "O" },
  { id: "patients", label: "Patients", short: "P" },
  { id: "appointments", label: "Appointments", short: "A" },
  { id: "queue", label: "Queue & triage", short: "Q" },
];

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
  const [section, setSection] = useState<Section>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedVisit, setSelectedVisit] = useState<QueueItem | null>(null);
  const [search, setSearch] = useState("");
  const [queueDepartment, setQueueDepartment] = useState("all");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [dashboardData, facilityData, patientData, appointmentData, queueData] =
        await Promise.all([
          api.get<DashboardData>("/dashboard"),
          api.get<{ departments: Department[] }>("/facility"),
          api.get<Patient[]>("/patients?limit=100"),
          api.get<Appointment[]>("/appointments"),
          api.get<QueueItem[]>("/queues?status=all"),
        ]);
      setDashboard(dashboardData);
      setDepartments(facilityData.departments);
      setPatients(patientData);
      setAppointments(appointmentData);
      setQueue(queueData);
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

  const todayLabel = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">I</div>
          <div>
            <div className="brand-name">IMARA<span>CARE</span></div>
            <div className="brand-caption">CARE, CONNECTED</div>
          </div>
        </div>

        <div className="facility-switch">
          <div className="facility-icon">IC</div>
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
              onClick={() => setSection(item.id)}
            >
              <span className="nav-icon">{item.short}</span>
              <span>{item.label}</span>
              {item.id === "queue" && dashboard?.stats.waiting_now ? (
                <span className="nav-count">{dashboard.stats.waiting_now}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <div className="help-mark">?</div>
          <div>
            <strong>Need a hand?</strong>
            <span>Help &amp; support</span>
          </div>
          <span className="chevron">›</span>
        </div>
        <div className="user-profile">
          <div className="avatar">FM</div>
          <div className="user-copy">
            <strong>Facility Manager</strong>
            <span>Administrator</span>
          </div>
          <button className="icon-button" aria-label="User menu">···</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span><span className="crumb-slash">/</span>
            <strong>{navigation.find((item) => item.id === section)?.label}</strong>
          </div>
          <div className="topbar-actions">
            <div className={`connection ${connected ? "online" : "offline"}`}>
              <span className="connection-dot" /> {connected ? "Connected" : "Offline"}
            </div>
            <button className="icon-button notification-button" aria-label="Notifications">
              <span className="bell-shape">◔</span>
              <i />
            </button>
            <div className="topbar-avatar">FM</div>
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
        </div>
      )}
    </div>
  );
}

function Overview({
  todayLabel,
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
      <div className="page-heading">
        <div>
          <div className="eyebrow">{todayLabel}</div>
          <h1>Good morning, Facility Manager</h1>
          <p>Here&apos;s what&apos;s happening at your facility today.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-quiet" onClick={onRegister}><span className="button-plus">+</span> Register patient</button>
          <button className="button button-primary" onClick={onBook}><span className="button-plus">+</span> Book appointment</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Patients today" value={stats?.patients_today ?? 0} note="New registrations" symbol="P" color="green" />
        <StatCard label="Visits today" value={stats?.visits_today ?? 0} note="Checked in today" symbol="V" color="blue" />
        <StatCard label="Waiting now" value={stats?.waiting_now ?? 0} note="Across all departments" symbol="Q" color="orange" />
        <StatCard label="Appointments" value={stats?.appointments_today ?? 0} note="Scheduled for today" symbol="A" color="purple" />
      </div>

      <div className="section-title-row">
        <div><h2>Today at a glance</h2><p>Live activity across your facility</p></div>
        <span className="live-tag"><i /> LIVE</span>
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
                <div className={`department-badge badge-${index % 5}`}>{department.code.slice(0, 2)}</div>
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
          <button className="quick-action" onClick={onRegister}><span className="quick-icon quick-green">+</span><span><strong>Register a patient</strong><small>Create a new patient record</small></span><b>→</b></button>
          <button className="quick-action" onClick={() => onNavigate("patients")}><span className="quick-icon quick-blue">⌕</span><span><strong>Find a patient</strong><small>Search the patient directory</small></span><b>→</b></button>
          <button className="quick-action" onClick={onBook}><span className="quick-icon quick-purple">◷</span><span><strong>Book an appointment</strong><small>Reserve a visit time</small></span><b>→</b></button>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value, note, symbol, color }: { label: string; value: number; note: string; symbol: string; color: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon icon-${color}`}>{symbol}</div>
      <div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
      <span className="stat-trend">↗</span>
    </div>
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
