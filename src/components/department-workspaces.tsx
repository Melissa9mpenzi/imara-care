"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "@/lib/api";
import SpreadsheetImport from "@/components/spreadsheet-import";
import type {
  BillingInvoice,
  DepartmentQueueEntry,
  DepartmentPatient,
  LaboratoryOrder,
  MedicationOrder,
  MedicationStockItem,
  TheatreProcedure,
} from "@/lib/api";

export type DepartmentModule = "pharmacy" | "laboratory" | "billing" | "theatre";

type DraftInvoiceLine = {
  id: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 2,
  }).format(value);
}

function invoiceLineAmountCents(line: DraftInvoiceLine) {
  const quantity = Number(line.quantity);
  const unitPrice = Number(line.unitPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice) || quantity <= 0 || unitPrice <= 0) {
    return 0;
  }
  const quantityHundredths = Math.round(quantity * 100);
  const unitPriceCents = Math.round(unitPrice * 100);
  return Math.floor((quantityHundredths * unitPriceCents) / 100 + 0.5);
}

function effectiveInvoiceStatus(invoice: BillingInvoice, today: string) {
  const dueDate = invoice.billing_details?.due_date;
  if (invoice.status !== "paid" && dueDate && dueDate < today && Number(invoice.balance) > 0) {
    return "overdue";
  }
  return invoice.status;
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

function InvoicePrintSheet({ invoice }: { invoice: BillingInvoice }) {
  const details = invoice.billing_details;
  return (
    <article className="billing-print-sheet" aria-hidden="true">
      <header className="billing-print-header">
        <div><strong>IMARA-CARE</strong><span>Healthcare services</span></div>
        <h1>Invoice</h1>
      </header>
      <div className="billing-print-summary">
        <p><span>Invoice number</span><strong>{invoice.invoice_number}</strong></p>
        <p><span>Issue date</span><strong>{new Date(invoice.created_at).toLocaleDateString()}</strong></p>
        <p><span>Patient</span><strong>{patientName(invoice.patient)}</strong></p>
        <p><span>Patient number</span><strong>{invoice.patient.patient_number}</strong></p>
        <p><span>Bill to</span><strong>{details?.bill_to_name || patientName(invoice.patient)}</strong></p>
        <p><span>Contact</span><strong>{details?.bill_to_phone || invoice.patient.phone || "—"}</strong></p>
        <p><span>Payer</span><strong>{details?.payer_type.replaceAll("_", " ") || "—"}</strong></p>
        {details?.insurer_name && <p><span>Insurer</span><strong>{details.insurer_name}</strong></p>}
        {details?.payer_reference && <p><span>Payer reference</span><strong>{details.payer_reference}</strong></p>}
        {details?.service_date && <p><span>Service date</span><strong>{details.service_date}</strong></p>}
        {details?.due_date && <p><span>Due date</span><strong>{details.due_date}</strong></p>}
      </div>
      <table className="billing-print-items">
        <thead><tr><th>Charge</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead>
        <tbody>
          {invoice.items.length ? invoice.items.map((item) => (
            <tr key={item.id}>
              <td>{item.description}</td>
              <td>{item.quantity} {item.unit}</td>
              <td>{formatCurrency(Number(item.unit_price))}</td>
              <td>{formatCurrency(Number(item.amount))}</td>
            </tr>
          )) : (
            <tr><td>{invoice.description}</td><td>—</td><td>—</td><td>{formatCurrency(Number(invoice.total_amount))}</td></tr>
          )}
        </tbody>
      </table>
      <div className="billing-print-totals">
        <p><span>Total</span><strong>{formatCurrency(Number(invoice.total_amount))}</strong></p>
        <p><span>Paid</span><strong>{formatCurrency(Number(invoice.paid_amount))}</strong></p>
        <p><span>Balance</span><strong>{formatCurrency(Number(invoice.balance))}</strong></p>
      </div>
      {details?.notes && <p className="billing-print-notes"><strong>Notes:</strong> {details.notes}</p>}
      {invoice.payments.length > 0 && (
        <section className="billing-print-payments">
          <h2>Payments recorded</h2>
          {invoice.payments.map((payment) => (
            <p key={payment.id}>
              {new Date(payment.paid_at).toLocaleDateString()} · {payment.method.replaceAll("_", " ")}
              {payment.reference ? ` · Ref: ${payment.reference}` : ""}
              <strong>{formatCurrency(Number(payment.amount))}</strong>
            </p>
          ))}
        </section>
      )}
    </article>
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
  const [departmentPatients, setDepartmentPatients] = useState<DepartmentPatient[]>([]);
  const [departmentQueue, setDepartmentQueue] = useState<DepartmentQueueEntry[]>([]);
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
      if (role === "department_head") {
        const code = moduleDepartment[module];
        const [patients, queue] = await Promise.all([
          api.get<DepartmentPatient[]>(
            `/departments/patients?department_code=${code}&limit=50`,
          ),
          api.get<DepartmentQueueEntry[]>(
            `/departments/queues?department_code=${code}&status=all`,
          ),
        ]);
        setDepartmentPatients(patients);
        setDepartmentQueue(queue);
      }
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : "Department data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [module, role]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const action = useAction(refresh);
  const manager = moduleManager(role, departmentCode, module);
  const canIssueInvoice =
    module === "billing" &&
    manager &&
    ["admin", "facility_admin", "medical_director", "department_head", "billing"].includes(role);
  const canCreateClinicalOrder = manager || role === "clinician";
  const [selectedPatient, setSelectedPatient] = useState<DepartmentPatient | null>(null);
  const [billToName, setBillToName] = useState("");
  const [billToPhone, setBillToPhone] = useState("");
  const [payerType, setPayerType] = useState<"self_pay" | "insurance" | "other">("self_pay");
  const [invoiceLines, setInvoiceLines] = useState<DraftInvoiceLine[]>([
    { id: 0, description: "", quantity: "1", unit: "service", unitPrice: "" },
  ]);
  const [nextInvoiceLineId, setNextInvoiceLineId] = useState(1);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<
    "all" | "unpaid" | "partially_paid" | "paid" | "overdue"
  >("all");
  const [printInvoiceId, setPrintInvoiceId] = useState<string | null>(null);
  const invoiceToPrint = invoices.find((invoice) => invoice.id === printInvoiceId);
  const currentDate = new Date();
  const today = [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");
  const visibleInvoices = invoices.filter((invoice) => {
    const status = effectiveInvoiceStatus(invoice, today);
    if (invoiceStatusFilter !== "all" && status !== invoiceStatusFilter) return false;
    const search = invoiceSearch.trim().toLowerCase();
    if (!search) return true;
    return [
      invoice.invoice_number,
      invoice.description,
      patientName(invoice.patient),
      invoice.patient.patient_number,
      invoice.patient.phone ?? "",
      invoice.billing_details?.insurer_name ?? "",
      ...invoice.items.map((item) => item.description),
    ].some((value) => value.toLowerCase().includes(search));
  });

  useEffect(() => {
    if (!invoiceToPrint) return;
    const timer = window.setTimeout(() => window.print(), 100);
    const finishPrint = () => setPrintInvoiceId(null);
    window.addEventListener("afterprint", finishPrint);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", finishPrint);
    };
  }, [invoiceToPrint]);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    create: (form: FormData) => Promise<unknown>,
    message: string,
    requiresPatient = true,
    onSuccess?: () => void,
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
      onSuccess?.();
    }, message);
  }

  return (
    <section className="department-workspace">
      <div className="department-workspace-heading">
        <div>
          <span className="eyebrow">
            {["admin", "facility_admin", "medical_director"].includes(role)
              ? "FACILITY DEPARTMENT OVERVIEW"
              : role === "department_head"
                ? "YOUR DEPARTMENT"
                : "DEPARTMENT WORKSPACE"}
          </span>
          <h1>{moduleTitles[module]}</h1>
          <p>
            {role === "department_head"
              ? "Department activity and patient flow for your assigned department."
              : ["admin", "facility_admin", "medical_director"].includes(role)
                ? "Review department operations, activity, and outstanding work."
                : `Manage ${moduleTitles[module].toLowerCase()} activity for your assigned department.`}
          </p>
        </div>
        {loading && <span className="department-hint">Loading…</span>}
      </div>
      {(loadError || action.error) && (
        <div className="alert alert-error" role="alert">{loadError || action.error}</div>
      )}
      {action.success && <div className="alert alert-success" role="status">{action.success}</div>}

      {role === "department_head" && (
        <div className="department-head-overview">
          <section className="panel department-panel">
            <div className="panel-heading">
              <div><h3>Patients linked to this department</h3><span>{departmentPatients.length} shown</span></div>
            </div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Patient</th><th>Patient number</th></tr></thead>
                <tbody>
                  {departmentPatients.map((patient) => (
                    <tr key={patient.id}>
                      <td><strong>{patientName(patient)}</strong></td>
                      <td>{patient.patient_number}</td>
                    </tr>
                  ))}
                  {!departmentPatients.length && (
                    <tr><td colSpan={2} className="department-empty">No active patients are linked to this department yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel department-panel">
            <div className="panel-heading">
              <div><h3>Department queue</h3><span>{departmentQueue.length} entries</span></div>
            </div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Queue</th><th>Patient</th><th>Reason</th><th>Priority / status</th></tr></thead>
                <tbody>
                  {departmentQueue.map((entry) => (
                    <tr key={entry.id}>
                      <td><strong>{entry.queue_number}</strong></td>
                      <td><PatientLabel patient={entry.patient} /></td>
                      <td>{entry.reason}</td>
                      <td><span className={`department-status ${entry.priority === "emergency" ? "status-warning" : "status-pending"}`}>{entry.priority}</span><small>{entry.status.replaceAll("_", " ")}</small></td>
                    </tr>
                  ))}
                  {!departmentQueue.length && (
                    <tr><td colSpan={4} className="department-empty">No queue entries for this department.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

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
          {manager && (
            <SpreadsheetImport
              endpoint="/pharmacy/stock/import"
              title="Bulk import medicine stock"
              description="Preview a CSV or Excel inventory list before adding or receiving stock."
              templateName="medicine-stock-template.csv"
              headers={[
                "name",
                "strength",
                "form",
                "unit",
                "quantity_on_hand",
                "reorder_level",
                "unit_price",
              ]}
              requireReference
              confirmRestock
              onImported={() => void refresh()}
            />
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
          <section className="billing-overview">
            <div className="billing-metric">
              <span>Recent invoices</span>
              <strong>{invoices.length}</strong>
            </div>
            <div className="billing-metric">
              <span>Collected (recent)</span>
              <strong>{formatCurrency(invoices.reduce((sum, invoice) => sum + Number(invoice.paid_amount), 0))}</strong>
            </div>
            <div className="billing-metric">
              <span>Outstanding (recent)</span>
              <strong>{formatCurrency(invoices.reduce((sum, invoice) => sum + Number(invoice.balance), 0))}</strong>
            </div>
          </section>
          <section className="billing-guide" aria-label="Billing workflow">
            <strong>How billing works</strong>
            <ol>
              <li>Billing staff select a registered patient, review the prefilled bill-to contact, and add itemized charges.</li>
              <li>Billing staff or cashiers record cash, insurance, mobile money, or bank-transfer payments against that invoice.</li>
              <li>Partial payments reduce the balance. Staff can search invoices, review their details, and print an invoice.</li>
            </ol>
            <p>
              Record payment references where available and reconcile payments
              against the facility&apos;s finance records. Insurance details can be
              recorded, but this workflow does not submit insurer claims or
              calculate tax, refunds, or accounting exports.
            </p>
          </section>
          {canIssueInvoice && (
            <section className="panel department-panel">
              <div className="panel-heading">
                <div><h3>Create invoice</h3><span>Itemize each service, medicine, or other charge.</span></div>
              </div>
              <form className="department-form billing-invoice-form" onSubmit={(event) => void submit(
                event,
                (form) => {
                  const descriptions = invoiceLines.map((line) => line.description.trim());
                  return api.post("/billing/invoices", {
                    patient_id: selectedPatient?.id,
                    description: descriptions.length === 1
                      ? descriptions[0]
                      : `${descriptions[0]} + ${descriptions.length - 1} more`,
                    items: invoiceLines.map((line) => ({
                      description: line.description.trim(),
                      quantity: Number(line.quantity),
                      unit: line.unit.trim(),
                      unit_price: Number(line.unitPrice),
                    })),
                    bill_to_name: form.get("bill_to_name"),
                    bill_to_phone: form.get("bill_to_phone") || null,
                    payer_type: form.get("payer_type"),
                    insurer_name: form.get("insurer_name") || null,
                    payer_reference: form.get("payer_reference") || null,
                    service_date: form.get("service_date") || null,
                    due_date: form.get("due_date") || null,
                    notes: form.get("notes") || null,
                  });
                },
                "Invoice created.",
                true,
                () => {
                  setBillToName("");
                  setBillToPhone("");
                  setPayerType("self_pay");
                  setInvoiceLines([{ id: 0, description: "", quantity: "1", unit: "service", unitPrice: "" }]);
                  setNextInvoiceLineId(1);
                },
              )}>
                <PatientPicker
                  key={patientPickerVersion}
                  departmentCode={moduleDepartment[module]}
                  onSelect={(patient) => {
                    setSelectedPatient(patient);
                    setBillToName(patient ? patientName(patient) : "");
                    setBillToPhone(patient?.phone ?? "");
                  }}
                />
                <div className="billing-patient-summary" aria-live="polite">
                  <p><span>Patient number</span><strong>{selectedPatient?.patient_number || "Select a patient"}</strong></p>
                  <p><span>Patient phone</span><strong>{selectedPatient?.phone || "No phone on record"}</strong></p>
                </div>
                <div className="billing-form-section billing-bill-to">
                  <h4>Bill-to details</h4>
                  <div className="billing-form-grid">
                    <label>Bill-to name<input name="bill_to_name" maxLength={160} value={billToName} onChange={(event) => setBillToName(event.target.value)} required /></label>
                    <label>Bill-to phone<input name="bill_to_phone" type="tel" maxLength={32} value={billToPhone} onChange={(event) => setBillToPhone(event.target.value)} /></label>
                    <label>Payer type
                      <select name="payer_type" value={payerType} onChange={(event) => setPayerType(event.target.value as typeof payerType)}>
                        <option value="self_pay">Self-pay</option>
                        <option value="insurance">Insurance</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    {payerType === "insurance" && (
                      <>
                        <label>Insurer name<input name="insurer_name" maxLength={160} required /></label>
                        <label>Member / payer reference<input name="payer_reference" maxLength={80} /></label>
                      </>
                    )}
                    <label>Service date<input name="service_date" type="date" /></label>
                    <label>Due date<input name="due_date" type="date" /></label>
                  </div>
                </div>
                <div className="billing-form-section billing-charge-section">
                  <div className="billing-charge-heading">
                    <div><h4>Itemized charges</h4><p>Enter a quantity and unit price for each line.</p></div>
                    <button className="button button-quiet" type="button" onClick={() => {
                      setInvoiceLines((lines) => [...lines, {
                        id: nextInvoiceLineId,
                        description: "",
                        quantity: "1",
                        unit: "service",
                        unitPrice: "",
                      }]);
                      setNextInvoiceLineId((id) => id + 1);
                    }} disabled={invoiceLines.length >= 50}>Add charge</button>
                  </div>
                  <div className="billing-line-items">
                    {invoiceLines.map((line, index) => (
                      <div className="billing-line-row" key={line.id}>
                        <label>Charge description<input value={line.description} onChange={(event) => setInvoiceLines((lines) => lines.map((item) => item.id === line.id ? { ...item, description: event.target.value } : item))} maxLength={240} required /></label>
                        <label>Quantity<input value={line.quantity} onChange={(event) => setInvoiceLines((lines) => lines.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))} type="number" min="0.01" max="1000000" step="0.01" required /></label>
                        <label>Unit<input value={line.unit} onChange={(event) => setInvoiceLines((lines) => lines.map((item) => item.id === line.id ? { ...item, unit: event.target.value } : item))} maxLength={40} placeholder="service, item, day…" required /></label>
                        <label>Unit price (UGX)<input value={line.unitPrice} onChange={(event) => setInvoiceLines((lines) => lines.map((item) => item.id === line.id ? { ...item, unitPrice: event.target.value } : item))} type="number" min="0.01" step="0.01" required /></label>
                        <div className="billing-line-total"><span>Line total</span><strong>{formatCurrency(invoiceLineAmountCents(line) / 100)}</strong></div>
                        <button className="text-button billing-remove-line" type="button" onClick={() => setInvoiceLines((lines) => lines.filter((item) => item.id !== line.id))} disabled={invoiceLines.length === 1} aria-label={`Remove charge ${index + 1}`}>Remove</button>
                      </div>
                    ))}
                  </div>
                  <div className="billing-invoice-total">
                    <span>Invoice total</span>
                    <strong>{formatCurrency(invoiceLines.reduce((sum, line) => sum + invoiceLineAmountCents(line), 0) / 100)}</strong>
                  </div>
                </div>
                <label className="billing-invoice-notes">Invoice notes<textarea name="notes" maxLength={2000} rows={3} placeholder="Optional notes for the billing record" /></label>
                <button className="button button-primary billing-submit" type="submit" disabled={action.busy}>Create invoice</button>
              </form>
            </section>
          )}
          <section className="panel department-panel">
            <div className="panel-heading">
              <h3>Invoices & payments</h3>
              <span>{visibleInvoices.length} shown · {invoices.length} recent</span>
            </div>
            <div className="billing-invoice-filters">
              <label>Search invoices
                <input value={invoiceSearch} onChange={(event) => setInvoiceSearch(event.target.value)} placeholder="Invoice, patient, phone, or insurer" />
              </label>
              <label>Invoice status
                <select value={invoiceStatusFilter} onChange={(event) => setInvoiceStatusFilter(event.target.value as typeof invoiceStatusFilter)}>
                  <option value="all">All statuses</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partially_paid">Partially paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
            </div>
            <div className="department-table-wrap">
              <table className="department-table">
                <thead><tr><th>Invoice / patient</th><th>Charges</th><th>Payer / due</th><th>Total</th><th>Paid / balance</th><th>Status</th>{manager && <th>Record payment</th>}<th>Invoice details</th><th>Payments</th></tr></thead>
                <tbody>
                  {visibleInvoices.map((invoice) => {
                    const details = invoice.billing_details;
                    const status = effectiveInvoiceStatus(invoice, today);
                    return (
                    <tr key={invoice.id}>
                      <td><strong>{invoice.invoice_number}</strong><PatientLabel patient={invoice.patient} /></td>
                      <td>{invoice.description}<small>{invoice.items.length} charge{invoice.items.length === 1 ? "" : "s"}</small></td>
                      <td>{details?.payer_type.replaceAll("_", " ") || "—"}{details?.insurer_name && <small>{details.insurer_name}</small>}{details?.due_date && <small>Due {details.due_date}</small>}</td>
                      <td>{formatCurrency(Number(invoice.total_amount))}</td>
                      <td>{formatCurrency(Number(invoice.paid_amount))} paid<small>Balance: {formatCurrency(Number(invoice.balance))}</small></td>
                      <td><span className={`department-status ${status === "paid" ? "status-done" : status === "overdue" || status === "partially_paid" ? "status-warning" : "status-pending"}`}>{status.replaceAll("_", " ")}</span></td>
                      {manager && <td>{invoice.status !== "paid" ? (
                        <form className="department-inline-form" onSubmit={(event) => {
                          event.preventDefault();
                          const formElement = event.currentTarget;
                          const form = new FormData(event.currentTarget);
                          void action.run(
                            async () => {
                              const result = await api.post(`/billing/invoices/${invoice.id}/payments`, {
                                amount: form.get("amount"),
                                method: form.get("method"),
                                reference: form.get("reference") || null,
                              });
                              formElement.reset();
                              return result;
                            },
                            "Payment recorded.",
                          );
                        }}>
                          <input name="amount" type="number" min="0.01" max={invoice.balance} step="0.01" placeholder="Amount" required />
                          <select name="method" aria-label="Payment method" defaultValue="cash"><option value="cash">Cash</option><option value="insurance">Insurance</option><option value="mobile_money">Mobile money</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select>
                          <input name="reference" aria-label="Payment reference" maxLength={120} placeholder="Reference" />
                          <button className="button button-quiet" type="submit" disabled={action.busy}>Record</button>
                        </form>
                      ) : "—"}</td>}
                      <td>
                        <details className="billing-invoice-details">
                          <summary>View / print</summary>
                          <div className="billing-invoice-detail-body">
                            <p><span>Bill to</span><strong>{details?.bill_to_name || patientName(invoice.patient)}</strong></p>
                            <p><span>Contact</span><strong>{details?.bill_to_phone || invoice.patient.phone || "—"}</strong></p>
                            {details?.payer_reference && <p><span>Payer reference</span><strong>{details.payer_reference}</strong></p>}
                            {details?.service_date && <p><span>Service date</span><strong>{details.service_date}</strong></p>}
                            {details?.notes && <p><span>Notes</span><strong>{details.notes}</strong></p>}
                            <ul className="billing-invoice-lines">
                              {invoice.items.length ? invoice.items.map((item) => (
                                <li key={item.id}>
                                  <span>{item.description}<small>{item.quantity} {item.unit} × {formatCurrency(Number(item.unit_price))}</small></span>
                                  <strong>{formatCurrency(Number(item.amount))}</strong>
                                </li>
                              )) : <li><span>{invoice.description}</span><strong>{formatCurrency(Number(invoice.total_amount))}</strong></li>}
                            </ul>
                            <button className="button button-quiet" type="button" onClick={() => setPrintInvoiceId(invoice.id)}>Print invoice</button>
                          </div>
                        </details>
                      </td>
                      <td>
                        <details className="billing-payment-history">
                          <summary>Payment history ({invoice.payments.length})</summary>
                          {invoice.payments.length ? (
                            <ul>
                              {invoice.payments.map((payment) => (
                                <li key={payment.id}>
                                  <strong>{formatCurrency(Number(payment.amount))}</strong>
                                  <span>{payment.method.replaceAll("_", " ")} · {new Date(payment.paid_at).toLocaleString()}</span>
                                  {payment.reference && <small>Ref: {payment.reference}</small>}
                                </li>
                              ))}
                            </ul>
                          ) : <p>No payments recorded yet.</p>}
                        </details>
                      </td>
                    </tr>
                  )})}
                  {!visibleInvoices.length && <tr><td colSpan={manager ? 9 : 8} className="department-empty">{invoices.length ? "No invoices match these filters." : "No invoices yet."}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
          {invoiceToPrint && <InvoicePrintSheet invoice={invoiceToPrint} />}
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
