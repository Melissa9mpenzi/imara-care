"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { api } from "@/lib/api";
import type { SpreadsheetImportResult } from "@/lib/api";

export default function SpreadsheetImport({
  endpoint,
  title,
  description,
  templateName,
  headers,
  requireReference = false,
  confirmRestock = false,
  onImported,
}: {
  endpoint: string;
  title: string;
  description: string;
  templateName: string;
  headers: string[];
  requireReference?: boolean;
  confirmRestock?: boolean;
  onImported?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [filePickerVersion, setFilePickerVersion] = useState(0);
  const [reference, setReference] = useState("");
  const [confirmMatches, setConfirmMatches] = useState(false);
  const [result, setResult] = useState<SpreadsheetImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasRestockMatches = (result?.restock ?? 0) > 0;
  const hasImportableRows =
    (result?.ready ?? 0) + (result?.new ?? 0) + (result?.restock ?? 0) > 0;

  function invalidatePreview() {
    setResult(null);
    setError("");
    setConfirmMatches(false);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    invalidatePreview();
  }

  function resetImport() {
    setFile(null);
    setFilePickerVersion((version) => version + 1);
    setReference("");
    setConfirmMatches(false);
    setResult(null);
    setError("");
  }

  function downloadTemplate() {
    const blob = new Blob([`${headers.join(",")}\r\n`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = templateName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a CSV or Excel file first.");
      return;
    }
    if (requireReference && !reference.trim()) {
      setError("Enter a stock receipt reference.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (requireReference) form.append("reference", reference.trim());
      if (confirmRestock) {
        form.append("confirm_restock_matches", String(confirmMatches));
      }
      const suffix = result?.preview ? "" : "?preview=true";
      const next = await api.upload<SpreadsheetImportResult>(
        `${endpoint}${suffix}`,
        form,
      );
      setResult(next);
      if (!next.preview) onImported?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The spreadsheet could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel department-panel spreadsheet-import">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <span className="panel-subtitle">{description}</span>
        </div>
        <button className="button button-quiet" type="button" onClick={downloadTemplate}>
          Download CSV template
        </button>
      </div>
      <form className="spreadsheet-import-form" onSubmit={(event) => void submit(event)}>
        <label>
          CSV or Excel file
          <input key={filePickerVersion} type="file" accept=".csv,.xlsx" onChange={onFileChange} />
        </label>
        {requireReference && (
          <label>
            Receipt reference
            <input
              maxLength={200}
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
                invalidatePreview();
              }}
              placeholder="e.g. Supplier invoice or delivery note"
              required
            />
          </label>
        )}
        {result?.preview ? (
          <button
            className="button button-primary"
            type="submit"
            disabled={busy || !hasImportableRows || (hasRestockMatches && !confirmMatches)}
          >
            {busy ? "Importing…" : "Import valid rows"}
          </button>
        ) : result ? (
          <button className="button button-primary" type="button" disabled>
            Import complete
          </button>
        ) : (
          <button className="button button-primary" type="submit" disabled={busy || !file}>
            {busy ? "Checking file…" : "Preview import"}
          </button>
        )}
      </form>
      {confirmRestock && hasRestockMatches && result?.preview && (
        <label className="spreadsheet-import-confirm">
          <input
            type="checkbox"
            checked={confirmMatches}
            onChange={(event) => setConfirmMatches(event.target.checked)}
          />
          Add the listed quantities to matching stock items. Existing prices and reorder levels will stay unchanged.
        </label>
      )}
      <p className="spreadsheet-import-note">
        Files are limited to CSV or .xlsx, 5 MB, and 500 data rows. Invalid and duplicate rows are reported and skipped.
      </p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {result && (
        <div className="spreadsheet-import-results" aria-live="polite">
          {!result.preview && (
            <button className="small-outline spreadsheet-import-reset" type="button" onClick={resetImport}>
              Start another import
            </button>
          )}
          <div className="spreadsheet-import-summary">
            <span>{result.total_rows} rows</span>
            {result.preview ? (
              <>
                <span>{(result.ready ?? 0) + (result.new ?? 0) + (result.restock ?? 0)} ready</span>
                {(result.new ?? 0) > 0 && <span>{result.new} new stock items</span>}
                {(result.restock ?? 0) > 0 && <span>{result.restock} matching items to restock</span>}
              </>
            ) : (
              <>
                <span>{result.created + (result.ready ?? 0)} created</span>
                {(result.restocked ?? 0) > 0 && <span>{result.restocked} restocked</span>}
              </>
            )}
            <span>{result.duplicates} duplicates skipped</span>
            <span>{result.invalid} invalid skipped</span>
          </div>
          <div className="table-scroll">
            <table className="data-table spreadsheet-import-table">
              <thead><tr><th>Row</th><th>Record</th><th>Status</th><th>Details</th></tr></thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.row}-${row.status}`}>
                    <td>{row.row}</td>
                    <td>{row.display}</td>
                    <td>{row.status.replaceAll("_", " ")}</td>
                    <td>{row.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
