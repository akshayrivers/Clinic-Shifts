"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";

interface ImportRow {
  id: string;
  batch_id: string;
  row_number: number;
  raw_data: Record<string, unknown>;
  status: "accepted" | "rejected" | "merged";
  reason: string | null;
  resulting_id: string | null;
  created_at: string;
}

interface ImportSummary {
  batch: {
    id: string;
    source_filename: string;
    imported_at: string;
  };
  totalRows: number;
  acceptedCount: number;
  rejectedCount: number;
  mergedCount: number;
  rows: ImportRow[];
}

export default function ImportReportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<"staff" | "shifts">("staff");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", importType);

    try {
      const res = await fetch("/api/import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      setSummary(data.summary);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CSV Import Report</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Upload and process dirty staff or shift CSV files, normalize records, and review import metrics.
            </p>
          </div>
        </div>

        {/* Upload Form Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm mb-10">
          <h2 className="text-lg font-semibold mb-4">Upload CSV File</h2>

          {error && (
            <div className="mb-4 p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleUpload} className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1 w-full">
              <input
                type="file"
                accept=".csv"
                required
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setFile(f);
                  if (f && f.name.toLowerCase().includes("shift")) {
                    setImportType("shifts");
                  } else if (f && f.name.toLowerCase().includes("staff")) {
                    setImportType("staff");
                  }
                }}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-950 dark:file:text-indigo-300 transition-colors"
              />
            </div>

            <select
              value={importType}
              onChange={(e) => setImportType(e.target.value as "staff" | "shifts")}
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="staff">Staff CSV (staff.csv)</option>
              <option value="shifts">Shifts CSV (shifts.csv)</option>
            </select>

            <button
              type="submit"
              disabled={isLoading || !file}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm transition-all text-sm whitespace-nowrap"
            >
              {isLoading ? "Processing Import..." : "Import CSV"}
            </button>
          </form>
        </div>

        {/* Summary & Report Metrics */}
        {summary && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
                <div className="text-sm font-medium text-slate-500">Total Rows Processed</div>
                <div className="text-3xl font-bold mt-1 text-slate-900 dark:text-slate-100">
                  {summary.totalRows}
                </div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-5 shadow-sm">
                <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Accepted</div>
                <div className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">
                  {summary.acceptedCount}
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-5 shadow-sm">
                <div className="text-sm font-medium text-amber-800 dark:text-amber-300">Merged</div>
                <div className="text-3xl font-bold mt-1 text-amber-700 dark:text-amber-400">
                  {summary.mergedCount}
                </div>
              </div>
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl p-5 shadow-sm">
                <div className="text-sm font-medium text-rose-800 dark:text-rose-300">Rejected</div>
                <div className="text-3xl font-bold mt-1 text-rose-700 dark:text-rose-400">
                  {summary.rejectedCount}
                </div>
              </div>
            </div>

            {/* Detailed Row Breakdown Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-lg">Import Batch Log ({summary.batch.source_filename})</h3>
                <span className="text-xs text-slate-500 font-mono">Batch ID: {summary.batch.id}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <th className="py-3 px-4 w-16">Row #</th>
                      <th className="py-3 px-4 w-28">Status</th>
                      <th className="py-3 px-4">Raw Data</th>
                      <th className="py-3 px-4">Action / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {summary.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-500">{r.row_number}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 text-xs font-bold uppercase rounded-full tracking-wide ${
                              r.status === "accepted"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                : r.status === "merged"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs max-w-xs truncate text-slate-700 dark:text-slate-300">
                          {JSON.stringify(r.raw_data)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                          {r.reason || (r.resulting_id ? `Created record ID: ${r.resulting_id}` : "Successfully accepted")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
