"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/lib/api";
import type {
  BillingInvoice,
  DepartmentPatient,
  LaboratoryOrder,
  MedicationOrder,
  MedicationStockItem,
  TheatreProcedure,
} from "@/lib/api";

export type DepartmentModule = "pharmacy" | "laboratory" | "billing" | "theatre";

const moduleDepartment: Record<DepartmentModule, string> = {
  pharmacy: "PHARM",
  laboratory: "LAB",
  billing: "BILL",
  theatre: "THR",
};

const moduleTitles: Record<DepartmentModule, string> = {
  pharmacy: "Pharmacy",
  laboratory: "Laboratory",
  billing: "Billing & insurance",
  theatre: "Theatre",
};

function patientName(patient: Pick<DepartmentPatient, "first_name" | "last_name" | "other_names">) {
  return [patient.first_name, patient.other_names, patient.last_name].filter(Boolean).join(" ");
}

function moduleManager(role: string, assignedDepartment: string | null, module: DepartmentModule) {
  if (["admin", "facility_admin", "medical_director"].includes(role)) return true;
  if (role === "department_head") return assignedDepartment === moduleDepartment[module];
  const departmentRoles: Record<DepartmentModule, string[]> = {
    pharmacy: ["pharmacy", "pharmacist"],
    laboratory: ["laboratory"],
    billing: ["billing", "cashier"],
    theatre: ["theatre"],
  };
  return (
    departmentRoles[module].includes(role) &&
    assignedDepartment === moduleDepartment[module]
  );
}

export function canAccessDepartmentModule(
  module: DepartmentModule,
  role: string,
  assignedDepartment: string | null,
) {
  return (
    moduleManager(role, assignedDepartment, module) ||
    (role === "clinician" && module !== "billing")
  );
}

function PatientPicker({
  departmentCode,
  onSelect,
}: {
  departmentCode: string;
  onSelect: (patient: DepartmentPatient | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<DepartmentPatient[]>([]);
  const [selected, setSelected] = useState<DepartmentPatient | null>(null);
  const [lookupError, setLookupError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selected || query.trim().length < 2) {
      setPatients([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLookupError("");
      try {
        const results = await api.get<DepartmentPatient[]>(
          `/departments/patients?department_code=${departmentCode}&q=${encodeURIComponent(query.trim())}&limit=10`,
        );
        if (active) setPatients(results);
      } catch (reason) {
        if (active) {
          setLookupError(
            reason instanceof Error ? reason.message : "Patient search failed.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [departmentCode, query, selected]);

  function choosePatient(patient: DepartmentPatient) {
    setSelected(patient);
    setQuery(patientName(patient));
    setPatients([]);
    onSelect(patient);
  }

  function clearPatient() {
    setSelected(null);
    setQuery("");
    onSelect(null);
  }

  return (
    <div className="department-patient-picker">
      <label>
        Patient
        <input
          value={query}
          onChange={(event) => {
            setSelected(null);
            onSelect(null);
            setQuery(event.target.value);
          }}
          placeholder="Search by name, number, or phone"
          autoComplete="off"
          required={!selected}
        />
      </label>
      {selected && (
        <div className="department-selected-patient">
          {selected.patient_number} · {patientName(selected)}
          <button type="button" className="text-button" onClick={clearPatient}>Change</button>
        </div>
      )}
      {!selected && loading && <span className="department-hint">Searching…</span>}
      {!selected && patients.length > 0 && (
        <div className="department-patient-results" role="listbox" aria-label="Patient matches">
          {patients.map((patient) => (
            <button type="button" key={patient.id} onClick={() => choosePatient(patient)}>
              <strong>{patientName(patient)}</strong>
              <span>{patient.patient_number}{patient.phone ? ` · ${patient.phone}` : ""}</span>
            </button>
          ))}
        </div>
      )}
      {lookupError && <span className="department-error" role="alert">{lookupError}</span>}
      {!selected && !loading && query.trim().length >= 2 && !patients.length && !lookupError && (
        <span className="department-hint">No matching patients found.</span>
      )}
    </div>
  );
}

function PatientLabel({ patient }: { patient: DepartmentPatient }) {
  return (
    <span>
      <strong>{patientName(patient)}</strong>
      <small>{patient.patient_number}</small>
    </span>
  );
}

function useAction(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const run = useCallback(
    async (action: () => Promise<unknown>, message: string) => {
      setBusy(true);
      setError("");
      setSuccess("");
      try {
        await action();
        setSuccess(message);
        await refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The action could not be completed.");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return { busy, error, success, run };
}

export default function DepartmentWorkspace({
  module,
  role,
  departmentCode,
}: {
  module: DepartmentModule;
  role: string;
  departmentCode: string | null;
}) {
  const [stock, setStock] = useState<MedicationStockItem[]>([]);
  const [medicationOrders, setMedicationOrders] = useState<MedicationOrder[]>([]);
  const [laboratoryOrders, setLaboratoryOrders] = useState<LaboratoryOrder[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [procedures, setProcedures] = useState<TheatreProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [patientPickerVersion, setPatientPickerVersion] = useState(0);

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      if (module === "pharmacy") {
        const [items, orders] = await Promise.all([
          api.get<MedicationStockItem[]>("/pharmacy/stock"),
          api.get<MedicationOrder[]>("/pharmacy/orders"),
        ]);
        setStock(items);
        setMedicationOrders(orders);
      } else if (module === "laboratory") {
        setLaboratoryOrders(await api.get<LaboratoryOrder[]>("/laboratory/orders"));
      } else if (module === "billing") {
        setInvoices(await api.get<BillingInvoice[]>("/billing/invoices"));
      } else {
        setProcedures(await api.get<TheatreProcedure[]>("/theatre/procedures"));
      }
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Department data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const action = useAction(refresh);
  const manager = moduleManager(role, departmentCode, module);
  const canCreateClinicalOrder = manager || role === "clinician";
  const [selectedPatient, setSelectedPatient] = useState<DepartmentPatient | null>(null);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    create: (form: FormData) => Promise<unknown>,
    message: string,
    requiresPatient = true,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (requiresPatient && !selectedPatient) {
      action.run(async () => {
        throw new Error("Select a patient before submitting.");
      }, message);
      return;
    }
    await action.run(async () => {
      await create(form);
      formElement.reset();
      setSelectedPatient(null);
      setPatientPickerVersion((version) => version + 1);
    }, message);
  }

  return (
    <section className="department-workspace">
      <div className="department-workspace-heading">
        <div>
          <span className="eyebrow">DEPARTMENT WORKSPACE</span>
          <h1>{moduleTitles[module]}</h1>
          <p>Manage {moduleTitles[module].toLowerCase()} activity for this facility.</p>
        </div>
        {loading && <span className="department-hint">Loading…</span>}
      </div>
      {(loadError || action.error) && (
        <div className="alert alert-error" role="alert">{loadError || action.error}</div>
      )}
      {action.success && <div className="alert alert-success" role="status">{action.success}</div>}

      {module === "pharmacy" && (
        <>
          {manager && (
            <section className="panel department-panel">
              <div className="panel-heading"><h3>Add medicine to stock</h3></div>
              <form className="department-form" onSubmit={(event) => void submit(
                event,
                (form) => api.post("/pharmacy/stock", {
                  name: form.get("name"),
                  strength: form.get("strength"),
                  form: form.get("form"),
                  unit: form.get("unit"),
                  quantity_on_hand: Number(form.get("quantity_on_hand")),
                  reorder_level: Number(form.get("reorder_level")),
                  unit_price: form.get("unit_price"),
                }),
                "Medicine stock item added.",
                false,
              )}>
                <label>Medicine name<input name="name" maxLength={160} required /></label>
                <label>Strength<input name="strength" maxLength={80} placeholder="e.g. 500 mg" required /></label>
                <label>Form<input name="form" maxLength={80} placeholder="e.g. tablet" required /></label>
                <label>Stock unit<input name="unit" maxLength={40} placeholder="e.g. tablet" required /></label>
                <label>Opening quantity<input name="quantity_on_hand" type="number" min="0" defaultValue="0" required /></label>
                <label>Reorder at<input name="reorder_level" type="number" min="0" defaultValue="0" required /></label>
                <label>Unit price<input name="unit_price" type="number" min="0" step="0.01" defaultValue="0" required /></label>
                <button className="button button-primary" type="submit" disabled={action.busy}>Add stock item</button>
              </form>
            </section>
          )}
          {canCreateClinicalOrder && (
            <section className="panel department-panel">
              <div className="panel-heading"><h3>Create medication order</h3></div>
              <form className="department-form" onSubmit={(event) => void submit(
                event,
                (form) => api.post("/pharmacy/orders", {
                  patient_id: selectedPatient?.id,
                  stock_item_id: form.get("stock_item_id"),
                  dosage: form.get("dosage"),
                  frequency: form.get("frequency"),
                  duration: form.get("duration") || null,
                  quantity: Number(form.get("quantity")),
                  instructions: form.get("instructions") || null,
                }),
                "Medication order created.",
              )}>
                <PatientPicker key={patientPickerVersion} departmentCode={moduleDepartment[module]} onSelect={setSelectedPatient} />
                <label>Medicine
                  <select name="stock_item_id" required defaultValue="">
                    <option value="" disabled>Select medicine</option>
                    {stock.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} {item.strength} · {item.quantity_on_hand} {item.unit} available
                      </option>
                    ))}
                  </select>
                </label>
                <label>Dosage<input name="dosage" maxLength={160} placeholder="e.g. 1 tablet" required /></label>
                <label>Frequency<input name="frequency" maxLength={160} placeholder="e.g. twice daily" required /></label>
                <label>Duration<input name="duration" maxLength={100} placeholder="e.g. 5 days" /></label>
                <label>Quantity<input name="quantity" type="number" min="1" required /></label>
                <label>Instructions<input name="instructions" maxLength={2000} /></label>
                <button className="button button-primary" type="submit" disabled={action.busy || stock.length === 0}>
                  Create order
                </button>
              </form>
            </section>
          )}
          <section className="panel department-panel">
            <div className="panel-heading"><h3>Medicine stock</h3><span>{stock.length} items</span></div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Medicine</th><th>Available</th><th>Unit price</th><th>Stock</th>{manager && <th>Receive</th>}</tr></thead>
                <tbody>
                  {stock.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong><small>{item.strength} · {item.form}</small></td>
                      <td>{item.quantity_on_hand} {item.unit}</td>
                      <td>{item.unit_price}</td>
                      <td><span className={`department-status ${item.low_stock ? "status-warning" : "status-done"}`}>{item.low_stock ? "Low" : "In stock"}</span></td>
                      {manager && <td>
                        <form className="department-inline-form" onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void action.run(
                            () => api.post(`/pharmacy/stock/${item.id}/receive`, {
                              quantity: Number(form.get("quantity")),
                              reference: form.get("reference") || null,
                            }),
                            "Stock received.",
                          );
                          event.currentTarget.reset();
                        }}>
                          <input aria-label={`Quantity received for ${item.name}`} name="quantity" type="number" min="1" placeholder="Qty" required />
                          <button className="button button-quiet" type="submit" disabled={action.busy}>Receive</button>
                        </form>
                      </td>}
                    </tr>
                  ))}
                  {!stock.length && <tr><td colSpan={manager ? 5 : 4} className="department-empty">No stock items have been added.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel department-panel">
            <div className="panel-heading"><h3>Medication orders</h3><span>{medicationOrders.length} recent</span></div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Patient</th><th>Medication & directions</th><th>Quantity</th><th>Status</th>{manager && <th>Action</th>}</tr></thead>
                <tbody>
                  {medicationOrders.map((order) => (
                    <tr key={order.id}>
                      <td><PatientLabel patient={order.patient} /></td>
                      <td><strong>{order.medication}</strong><small>{order.dosage} · {order.frequency}{order.duration ? ` · ${order.duration}` : ""}</small></td>
                      <td>{order.quantity}</td>
                      <td><span className={`department-status ${order.status === "dispensed" ? "status-done" : "status-pending"}`}>{order.status}</span></td>
                      {manager && <td>{order.status === "requested" ? (
                        <button className="button button-quiet" type="button" disabled={action.busy} onClick={() => void action.run(
                          () => api.post(`/pharmacy/orders/${order.id}/dispense`, {}),
                          "Medication order dispensed.",
                        )}>Dispense</button>
                      ) : "—"}</td>}
                    </tr>
                  ))}
                  {!medicationOrders.length && <tr><td colSpan={manager ? 5 : 4} className="department-empty">No medication orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {module === "laboratory" && (
        <>
          {canCreateClinicalOrder && (
            <section className="panel department-panel">
              <div className="panel-heading"><h3>Request a laboratory test</h3></div>
              <form className="department-form" onSubmit={(event) => void submit(
                event,
                (form) => api.post("/laboratory/orders", {
                  patient_id: selectedPatient?.id,
                  test_name: form.get("test_name"),
                  specimen: form.get("specimen"),
                  priority: form.get("priority"),
                  clinical_notes: form.get("clinical_notes") || null,
                }),
                "Laboratory test requested.",
              )}>
                <PatientPicker key={patientPickerVersion} departmentCode={moduleDepartment[module]} onSelect={setSelectedPatient} />
                <label>Test name<input name="test_name" maxLength={160} required /></label>
                <label>Specimen<input name="specimen" maxLength={100} placeholder="e.g. blood, urine" required /></label>
                <label>Priority<select name="priority" defaultValue="routine"><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="emergency">Emergency</option></select></label>
                <label>Clinical notes<input name="clinical_notes" maxLength={2000} /></label>
                <button className="button button-primary" type="submit" disabled={action.busy}>Request test</button>
              </form>
            </section>
          )}
          <section className="panel department-panel">
            <div className="panel-heading"><h3>Test orders & results</h3><span>{laboratoryOrders.length} recent</span></div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Patient</th><th>Test / specimen</th><th>Priority</th><th>Status / result</th>{manager && <th>Record result</th>}</tr></thead>
                <tbody>
                  {laboratoryOrders.map((order) => (
                    <tr key={order.id}>
                      <td><PatientLabel patient={order.patient} /></td>
                      <td><strong>{order.test_name}</strong><small>{order.specimen}</small></td>
                      <td>{order.priority}</td>
                      <td><span className={`department-status ${order.status === "resulted" ? "status-done" : "status-pending"}`}>{order.status}</span>{order.result && <small>{order.result}</small>}</td>
                      {manager && <td>{order.status === "requested" ? (
                        <form className="department-inline-form" onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void action.run(
                            () => api.post(`/laboratory/orders/${order.id}/result`, { result: form.get("result") }),
                            "Laboratory result recorded.",
                          );
                          event.currentTarget.reset();
                        }}>
                          <input name="result" aria-label={`Result for ${order.test_name}`} maxLength={10000} placeholder="Enter result" required />
                          <button className="button button-quiet" type="submit" disabled={action.busy}>Save</button>
                        </form>
                      ) : "—"}</td>}
                    </tr>
                  ))}
                  {!laboratoryOrders.length && <tr><td colSpan={manager ? 5 : 4} className="department-empty">No laboratory orders yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {module === "billing" && (
        <>
          {manager && (
            <section className="panel department-panel">
              <div className="panel-heading"><h3>Create invoice</h3></div>
              <form className="department-form" onSubmit={(event) => void submit(
                event,
                (form) => api.post("/billing/invoices", {
                  patient_id: selectedPatient?.id,
                  description: form.get("description"),
                  total_amount: form.get("total_amount"),
                }),
                "Invoice created.",
              )}>
                <PatientPicker key={patientPickerVersion} departmentCode={moduleDepartment[module]} onSelect={setSelectedPatient} />
                <label>Charge description<input name="description" maxLength={240} required /></label>
                <label>Amount<input name="total_amount" type="number" min="0.01" step="0.01" required /></label>
                <button className="button button-primary" type="submit" disabled={action.busy}>Create invoice</button>
              </form>
            </section>
          )}
          <section className="panel department-panel">
            <div className="panel-heading"><h3>Invoices & payments</h3><span>{invoices.length} recent</span></div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Invoice / patient</th><th>Description</th><th>Total</th><th>Paid / balance</th><th>Status</th>{manager && <th>Record payment</th>}</tr></thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td><strong>{invoice.invoice_number}</strong><PatientLabel patient={invoice.patient} /></td>
                      <td>{invoice.description}</td>
                      <td>{invoice.total_amount}</td>
                      <td>{invoice.paid_amount} paid<small>Balance: {invoice.balance}</small></td>
                      <td><span className={`department-status ${invoice.status === "paid" ? "status-done" : "status-pending"}`}>{invoice.status.replaceAll("_", " ")}</span></td>
                      {manager && <td>{invoice.status !== "paid" ? (
                        <form className="department-inline-form" onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void action.run(
                            () => api.post(`/billing/invoices/${invoice.id}/payments`, {
                              amount: form.get("amount"),
                              method: form.get("method"),
                              reference: form.get("reference") || null,
                            }),
                            "Payment recorded.",
                          );
                          event.currentTarget.reset();
                        }}>
                          <input name="amount" type="number" min="0.01" max={invoice.balance} step="0.01" placeholder="Amount" required />
                          <select name="method" aria-label="Payment method" defaultValue="cash"><option value="cash">Cash</option><option value="insurance">Insurance</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select>
                          <button className="button button-quiet" type="submit" disabled={action.busy}>Record</button>
                        </form>
                      ) : "—"}</td>}
                    </tr>
                  ))}
                  {!invoices.length && <tr><td colSpan={manager ? 6 : 5} className="department-empty">No invoices yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {module === "theatre" && (
        <>
          {canCreateClinicalOrder && (
            <section className="panel department-panel">
              <div className="panel-heading"><h3>Schedule a procedure</h3></div>
              <form className="department-form" onSubmit={(event) => void submit(
                event,
                (form) => {
                  const scheduledAt = new Date(String(form.get("scheduled_at")));
                  return api.post("/theatre/procedures", {
                    patient_id: selectedPatient?.id,
                    procedure_name: form.get("procedure_name"),
                    scheduled_at: scheduledAt.toISOString(),
                    lead_clinician: form.get("lead_clinician"),
                    notes: form.get("notes") || null,
                  });
                },
                "Procedure scheduled.",
              )}>
                <PatientPicker key={patientPickerVersion} departmentCode={moduleDepartment[module]} onSelect={setSelectedPatient} />
                <label>Procedure<input name="procedure_name" maxLength={160} required /></label>
                <label>Scheduled date & time<input name="scheduled_at" type="datetime-local" required /></label>
                <label>Lead clinician<input name="lead_clinician" maxLength={120} required /></label>
                <label>Notes<input name="notes" maxLength={4000} /></label>
                <button className="button button-primary" type="submit" disabled={action.busy}>Schedule procedure</button>
              </form>
            </section>
          )}
          <section className="panel department-panel">
            <div className="panel-heading"><h3>Procedure schedule</h3><span>{procedures.length} recent</span></div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Patient</th><th>Procedure</th><th>Scheduled</th><th>Lead clinician</th><th>Status</th>{manager && <th>Update status</th>}</tr></thead>
                <tbody>
                  {procedures.map((procedure) => (
                    <tr key={procedure.id}>
                      <td><PatientLabel patient={procedure.patient} /></td>
                      <td><strong>{procedure.procedure_name}</strong>{procedure.notes && <small>{procedure.notes}</small>}</td>
                      <td>{new Date(procedure.scheduled_at).toLocaleString()}</td>
                      <td>{procedure.lead_clinician}</td>
                      <td><span className={`department-status ${procedure.status === "completed" ? "status-done" : procedure.status === "cancelled" ? "status-cancelled" : "status-pending"}`}>{procedure.status.replaceAll("_", " ")}</span></td>
                      {manager && <td>
                        {procedure.status === "scheduled" && (
                          <>
                            <button className="button button-quiet" type="button" disabled={action.busy} onClick={() => void action.run(
                              () => api.patch(`/theatre/procedures/${procedure.id}`, { status: "in_progress" }),
                              "Procedure marked in progress.",
                            )}>Start</button>
                            <button className="text-button" type="button" disabled={action.busy} onClick={() => void action.run(
                              () => api.patch(`/theatre/procedures/${procedure.id}`, { status: "cancelled" }),
                              "Procedure cancelled.",
                            )}>Cancel</button>
                          </>
                        )}
                        {procedure.status === "in_progress" && <button className="button button-quiet" type="button" disabled={action.busy} onClick={() => void action.run(
                          () => api.patch(`/theatre/procedures/${procedure.id}`, { status: "completed" }),
                          "Procedure marked completed.",
                        )}>Complete</button>}
                        {["completed", "cancelled"].includes(procedure.status) && "—"}
                      </td>}
                    </tr>
                  ))}
                  {!procedures.length && <tr><td colSpan={manager ? 6 : 5} className="department-empty">No procedures scheduled.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
