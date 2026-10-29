const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export interface Department {
  id: string;
  name: string;
  code: string;
  type: string;
  waiting?: number;
}

export interface Patient {
  id: string;
  patient_number: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  sex: string;
  date_of_birth: string | null;
  estimated_age: number | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  usual_payment_method: string;
  allergies: string[];
  sms_consent: boolean;
  created_at: string;
}

export interface QueueItem {
  id: string;
  queue_number: string;
  priority: "routine" | "urgent" | "emergency";
  status: string;
  arrived_at: string;
  visit_id: string;
  visit_number: string;
  visit_status: string;
  reason: string;
  patient: Patient;
  department: Pick<Department, "id" | "name" | "code">;
  triage: {
    temperature: number | null;
    pulse: number | null;
    respiratory_rate: number | null;
    systolic: number | null;
    diastolic: number | null;
    spo2: number | null;
    weight: number | null;
    height: number | null;
    bmi: number | null;
    pain_score: number | null;
    priority: string;
  } | null;
}

export interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  appointment_type: string;
  clinician: string | null;
  reason: string;
  notes: string | null;
  status: string;
  patient: Patient;
  department: Pick<Department, "id" | "name">;
}

export interface DashboardData {
  facility_name: string;
  date: string;
  stats: {
    patients_today: number;
    visits_today: number;
    waiting_now: number;
    appointments_today: number;
  };
  departments: Department[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("The API is unavailable. Start the backend and try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ?? "The request could not be completed.";
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, payload: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(payload) }),
  patch: <T>(path: string, payload: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(payload) }),
};
