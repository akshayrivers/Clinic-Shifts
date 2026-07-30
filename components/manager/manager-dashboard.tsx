"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRealtimeShifts } from "@/hooks/use-realtime-shifts";
import { ShiftItem, getShiftStaffingMetrics } from "@/components/shared/types";
import { WeekCoverageDashboard } from "@/components/shared/week-coverage-dashboard";
import { ToastContainer } from "@/components/toast-container";

export interface StaffUser {
  id: string;
  staff_code: number;
  full_name: string;
  email: string;
  role: "manager" | "staff";
  profession: "doctor" | "nurse" | "receptionist" | null;
}

interface Toast {
  id: string;
  type: "success" | "error";
  message: string;
}

let toastCounter = 0;

export function ManagerDashboard() {
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = String(++toastCounter);
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "doctor" | "nurse" | "receptionist"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "full" | "partial" | "empty"
  >("all");

  // Modal / Form state for Create / Edit Shift
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: "",
    startTime: "08:00",
    endTime: "16:00",
    doctorsRequired: 1,
    nursesRequired: 2,
    receptionistsRequired: 1,
  });

  // Series Modal state
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false);
  const [seriesList, setSeriesList] = useState<
    { id: string; days_of_week: number[]; start_time: string; end_time: string; doctors_required: number; nurses_required: number; receptionists_required: number; until_date: string; created_at: string }[]
  >([]);
  const [seriesFormData, setSeriesFormData] = useState({
    startDate: "",
    untilDate: "",
    startTime: "08:00",
    endTime: "16:00",
    daysOfWeek: [] as number[],
    doctorsRequired: 1,
    nursesRequired: 2,
    receptionistsRequired: 1,
  });

  // Assignment Modal state
  const [assigningShiftId, setAssigningShiftId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignSearchQuery, setAssignSearchQuery] = useState("");

  // Full staff directory, fetched once — powers the "Assign Staff" picker so
  // managers select a real person instead of typing a raw UUID.
  const [staffList, setStaffList] = useState<StaffUser[]>([]);

  const fetchStaffList = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) return; // non-manager or transient error — picker just falls back to empty
      const data = await res.json();
      setStaffList(
        (data.users || []).filter((u: StaffUser) => u.role === "staff"),
      );
    } catch {
      // Silent — the assign form still works via manual entry if this fails.
    }
  }, []);

  useEffect(() => {
    fetchStaffList();
  }, [fetchStaffList]);

  const fetchShifts = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsInitialLoading(true);
      const res = await fetch("/api/shifts");
      if (!res.ok) throw new Error("Failed to load shifts");
      const data = await res.json();
      setShifts(data.shifts || []);

      console.log(
        "[ManagerDashboard] sample shift",
        data[0]?.id,

        "claimsLen",
        data[0]?.claims?.length,

        "status",
        data[0] ? getShiftStaffingMetrics(data[0]).status : null,
      );
    } catch (err: unknown) {
      addToast("error", (err as Error).message);
    } finally {
      if (showLoading) setIsInitialLoading(false);
    }
  }, [addToast]);

  const fetchSeries = useCallback(async () => {
    try {
      const res = await fetch("/api/shift-series");
      if (!res.ok) return;
      const data = await res.json();
      setSeriesList(data.series || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchShifts();
    fetchSeries();
  }, [fetchShifts, fetchSeries]);

  // Realtime update callback — refresh without loading flash
  useRealtimeShifts(() => {
    fetchShifts(false);
  });

  // The shift the "Assign Staff" modal is currently open for — drives the
  // modal's header context (date/time/missing roles) automatically.
  const assigningShift = useMemo(
    () => shifts.find((s) => s.id === assigningShiftId) ?? null,
    [shifts, assigningShiftId],
  );

  // People eligible to be picked in the "Assign Staff" modal for the currently
  // open shift: excludes anyone already assigned to it, supports a name/email/
  // staff_code search, and floats still-needed professions to the top.
  const assignablePeople = useMemo(() => {
    if (!assigningShift) return [];

    const alreadyAssignedIds = new Set(
      (assigningShift.claims || []).map((c) => c.user_id),
    );
    const metrics = getShiftStaffingMetrics(assigningShift);
    const stillNeeded: Record<string, boolean> = {
      doctor: metrics.missingDoctors > 0,
      nurse: metrics.missingNurses > 0,
      receptionist: metrics.missingReceptionists > 0,
    };

    const query = assignSearchQuery.trim().toLowerCase();

    return staffList
      .filter((person) => !alreadyAssignedIds.has(person.id))
      .filter((person) => {
        if (!query) return true;
        return (
          person.full_name.toLowerCase().includes(query) ||
          person.email.toLowerCase().includes(query) ||
          String(person.staff_code).includes(query)
        );
      })
      .sort((a, b) => {
        const aNeeded = a.profession ? stillNeeded[a.profession] : false;
        const bNeeded = b.profession ? stillNeeded[b.profession] : false;
        if (aNeeded !== bNeeded) return aNeeded ? -1 : 1;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [assigningShift, staffList, assignSearchQuery, getShiftStaffingMetrics]);

  const filteredShifts = useMemo(() => {
    return shifts.filter((s) => {
      const metrics = getShiftStaffingMetrics(s);

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesDate = s.starts_at.includes(q);
        const matchesId = s.id.toLowerCase().includes(q);
        const matchesMissing = metrics.missingText.toLowerCase().includes(q);
        if (!matchesDate && !matchesId && !matchesMissing) return false;
      }

      // Role filter
      if (roleFilter === "doctor" && s.doctors_required <= 0) return false;
      if (roleFilter === "nurse" && s.nurses_required <= 0) return false;
      if (roleFilter === "receptionist" && s.receptionists_required <= 0)
        return false;

      // Status filter
      if (statusFilter !== "all" && metrics.status !== statusFilter)
        return false;

      return true;
    });
  }, [shifts, searchQuery, roleFilter, statusFilter, getShiftStaffingMetrics]);

  // Shift Create/Edit Handler
  const handleSaveShift = async (e: React.FormEvent, force = false) => {
    e.preventDefault();

    try {
      const url = editingShiftId
        ? `/api/shifts/${editingShiftId}`
        : "/api/shifts";
      const method = editingShiftId ? "PUT" : "POST";

      const body = force
        ? { ...formData, force: true }
        : formData;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.status === 409 && data.violations && !force) {
        const violationMessages = data.violations.map(
          (v: { type: string; details: string }) => `• ${v.details}`,
        );
        const confirmMsg =
          `This change affects existing claims:\n\n${violationMessages.join("\n")}\n\n` +
          (data.violations.some((v: { type: string }) => v.type === "overlap")
            ? "Overlapping claims will be automatically removed if you proceed.\n"
            : "") +
          "\nProceed anyway?";
        if (confirm(confirmMsg)) {
          return handleSaveShift(e, true);
        }
        return;
      }

      if (!res.ok) throw new Error(data.error || "Failed to save shift");

      setIsModalOpen(false);
      setEditingShiftId(null);

      if (data.removedClaims?.length > 0) {
        const names = data.removedClaims.map(
          (c: { userName: string }) => c.userName,
        );
        addToast("success", `Shift saved. Removed ${names.join(", ")} due to overlap.`);
      } else {
        addToast("success", "Shift saved successfully!");
      }
      fetchShifts(false);
    } catch (err: unknown) {
      addToast("error", (err as Error).message);
    }
  };

  // Delete Shift Handler
  const handleDeleteShift = async (id: string) => {
    const shift = shifts.find((s) => s.id === id);
    const claimCount = shift?.claims?.length ?? 0;
    const claimDetail =
      claimCount > 0
        ? `\n\n⚠ This shift has ${claimCount} staff member${claimCount > 1 ? "s" : ""} assigned. Deleting it will remove all assignments.`
        : "";
    if (!confirm(`Are you sure you want to delete this shift?${claimDetail}`)) return;
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete shift");
      }
      addToast("success", "Shift deleted successfully.");
      fetchShifts(false);
    } catch (err: unknown) {
      addToast("error", (err as Error).message);
    }
  };

  // Create Series Handler
  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/shift-series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seriesFormData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create series");

      setIsSeriesModalOpen(false);
      addToast("success", `Series created! Generated ${data.count} shifts.`);
      fetchShifts(false);
      fetchSeries();
    } catch (err: unknown) {
      addToast("error", (err as Error).message);
    }
  };

  // Delete Series Handler
  const handleDeleteSeries = async (id: string, shiftCount: number) => {
    if (!confirm(`Delete this series and all ${shiftCount} linked shifts?`)) return;
    try {
      const res = await fetch(`/api/shift-series/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete series");
      }
      addToast("success", "Series and linked shifts deleted.");
      fetchShifts(false);
      fetchSeries();
    } catch (err: unknown) {
      addToast("error", (err as Error).message);
    }
  };

  // Assign Staff Handler
  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningShiftId || !assignUserId.trim()) return;

    try {
      const res = await fetch(`/api/shifts/${assigningShiftId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign staff");

      setAssignUserId("");
      addToast("success", "Staff member assigned successfully!");
      fetchShifts(false);
    } catch (err: unknown) {
      addToast("error", (err as Error).message);
    }
  };

  // Unassign Staff Handler
  const handleRemoveAssignment = async (shiftId: string, userId: string) => {
    try {
      const res = await fetch(`/api/shifts/${shiftId}/claim?userId=${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove staff");
      }

      addToast("success", "Staff unassigned successfully.");
      fetchShifts(false);
    } catch (err: unknown) {
      addToast("error", (err as Error).message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Manager Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage clinic shifts, assign staff members, monitor weekly coverage,
            and review CSV import reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => {
              setEditingShiftId(null);
              setFormData({
                date: new Date().toISOString().split("T")[0],
                startTime: "08:00",
                endTime: "16:00",
                doctorsRequired: 1,
                nursesRequired: 2,
                receptionistsRequired: 1,
              });
              setIsModalOpen(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-all"
          >
            + Create New Shift
          </button>
          <button
            onClick={() => {
              setSeriesFormData({
                startDate: new Date().toISOString().split("T")[0],
                untilDate: "",
                startTime: "08:00",
                endTime: "16:00",
                daysOfWeek: [],
                doctorsRequired: 1,
                nursesRequired: 2,
                receptionistsRequired: 1,
              });
              setIsSeriesModalOpen(true);
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm px-4 py-2.5 rounded-lg shadow-sm transition-all"
          >
            + Create Recurring Series
          </button>
          <Link
            href="/manager/import"
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-sm px-4 py-2.5 rounded-lg transition-all border border-slate-300 dark:border-slate-700"
          >
            Import CSV File
          </Link>
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Week Coverage Dashboard — shared with the staff view */}
      <WeekCoverageDashboard
        shifts={shifts}
        renderShiftActions={(shift) => (
          <button
            onClick={() => {
              setAssigningShiftId(shift.id);
              setAssignUserId("");
              setAssignSearchQuery("");
            }}
            className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded transition-colors whitespace-nowrap"
          >
            Assign Staff
          </button>
        )}
      />

      {/* Shift List with Search & Filtering */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold">
              All Clinic Shifts ({filteredShifts.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search, filter, edit, and assign staff members
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Search */}
            <input
              type="text"
              placeholder="Search by date, ID, or missing role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full sm:w-64"
            />

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) =>
                setRoleFilter(
                  e.target.value as "all" | "doctor" | "nurse" | "receptionist",
                )
              }
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="doctor">Doctors Required</option>
              <option value="nurse">Nurses Required</option>
              <option value="receptionist">Receptionists Required</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as "all" | "full" | "partial" | "empty",
                )
              }
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="full">Fully Staffed</option>
              <option value="partial">Partially Staffed</option>
              <option value="empty">Empty</option>
            </select>
          </div>
        </div>

        {/* Shift List Table */}
        {isInitialLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Loading shifts...
          </div>
        ) : filteredShifts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            No shifts match your search and filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Requirements</th>
                  <th className="py-3 px-4">Coverage Status</th>
                  <th className="py-3 px-4">Assigned Staff</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredShifts.map((shift) => {
                  const metrics = getShiftStaffingMetrics(shift);
                  const startDate = new Date(shift.starts_at);
                  const endDate = new Date(shift.ends_at);

                  const isOvernight =
                    endDate.getUTCDate() !== startDate.getUTCDate();
                  const dateStr = startDate.toISOString().split("T")[0];
                  const startStr = startDate.toISOString().substring(11, 16);
                  const endStr = endDate.toISOString().substring(11, 16);

                  return (
                    <tr
                      key={shift.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-4 px-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{dateStr}</span>
                          <span className="text-[10px] text-slate-400 font-mono">#{shift.external_id}</span>
                          {shift.series_id && (
                            <span className="text-[10px] bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded font-semibold">
                              Series
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {startStr} – {endStr} {isOvernight ? "(+1 day)" : ""}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-xs space-y-1">
                        <div>
                          Doctors:{" "}
                          <span className="font-semibold">
                            {shift.doctors_required}
                          </span>
                        </div>
                        <div>
                          Nurses:{" "}
                          <span className="font-semibold">
                            {shift.nurses_required}
                          </span>
                        </div>
                        <div>
                          Receptionists:{" "}
                          <span className="font-semibold">
                            {shift.receptionists_required}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 text-xs font-bold uppercase rounded-full tracking-wide ${
                            metrics.status === "full"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                              : metrics.status === "partial"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                          }`}
                        >
                          {metrics.status}
                        </span>
                        <div className="text-xs text-slate-500 mt-1 font-medium">
                          {metrics.missingText}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-xs">
                        {shift.claims && shift.claims.length > 0 ? (
                          <div className="space-y-1">
                            {shift.claims.map((claim) => (
                              <div
                                key={claim.id}
                                className="flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded"
                              >
                                <span>
                                  {claim.user?.full_name || claim.user_id} (
                                  {claim.user?.profession || "staff"})
                                </span>
                                <button
                                  onClick={() =>
                                    handleRemoveAssignment(
                                      shift.id,
                                      claim.user_id,
                                    )
                                  }
                                  className="text-rose-600 hover:text-rose-700 font-bold ml-1"
                                  title="Remove assignment"
                                >
                                  &times;
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">
                            None assigned
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setAssigningShiftId(shift.id);
                            setAssignUserId("");
                            setAssignSearchQuery("");
                          }}
                          className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded transition-colors"
                        >
                          Assign Staff
                        </button>

                        <button
                          onClick={() => {
                            setEditingShiftId(shift.id);
                            setFormData({
                              date: dateStr,
                              startTime: startStr,
                              endTime: endStr,
                              doctorsRequired: shift.doctors_required,
                              nursesRequired: shift.nurses_required,
                              receptionistsRequired:
                                shift.receptionists_required,
                            });
                            setIsModalOpen(true);
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold px-2.5 py-1.5 rounded transition-colors"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => handleDeleteShift(shift.id)}
                          className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold px-2.5 py-1.5 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Series List */}
      {seriesList.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-bold">
              Recurring Series ({seriesList.length})
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Series generate shifts on selected days of the week.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4">Schedule</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Requirements</th>
                  <th className="py-3 px-4">Until</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {seriesList.map((s) => {
                  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                  const daysStr = s.days_of_week.map((d: number) => dayLabels[d]).join(", ");
                  return (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-4 font-medium">{daysStr}</td>
                      <td className="py-4 px-4">
                        {s.start_time} – {s.end_time}
                      </td>
                      <td className="py-4 px-4 text-xs space-y-1">
                        <div>Drs: {s.doctors_required}</div>
                        <div>Nrs: {s.nurses_required}</div>
                        <div>Rec: {s.receptionists_required}</div>
                      </td>
                      <td className="py-4 px-4 text-xs">
                        {new Date(s.until_date).toISOString().split("T")[0]}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => {
                            const shiftCount = shifts.filter((sh) => sh.series_id === s.id).length;
                            handleDeleteSeries(s.id, shiftCount);
                          }}
                          className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold px-2.5 py-1.5 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Shift Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">
              {editingShiftId ? "Edit Shift" : "Create New Shift"}
            </h2>

            <form onSubmit={handleSaveShift} className="space-y-4 text-sm">
              <div>
                <label className="block font-semibold mb-1">Shift Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={formData.startTime}
                    onChange={(e) =>
                      setFormData({ ...formData, startTime: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) =>
                      setFormData({ ...formData, endTime: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-xs">
                    Doctors
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.doctorsRequired}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        doctorsRequired: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">
                    Nurses
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.nursesRequired}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        nursesRequired: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">
                    Receptionists
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.receptionistsRequired}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        receptionistsRequired:
                          parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Recurring Series Modal */}
      {isSeriesModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-4">Create Recurring Series</h2>

            <form onSubmit={handleCreateSeries} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={seriesFormData.startDate}
                    onChange={(e) =>
                      setSeriesFormData({ ...seriesFormData, startDate: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Until Date</label>
                  <input
                    type="date"
                    required
                    value={seriesFormData.untilDate}
                    onChange={(e) =>
                      setSeriesFormData({ ...seriesFormData, untilDate: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Start Time</label>
                  <input
                    type="time"
                    required
                    value={seriesFormData.startTime}
                    onChange={(e) =>
                      setSeriesFormData({ ...seriesFormData, startTime: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={seriesFormData.endTime}
                    onChange={(e) =>
                      setSeriesFormData({ ...seriesFormData, endTime: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1">Days of Week</label>
                <div className="flex flex-wrap gap-2">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer has-[:checked]:bg-indigo-50 dark:has-[:checked]:bg-indigo-950 has-[:checked]:border-indigo-500"
                    >
                      <input
                        type="checkbox"
                        checked={seriesFormData.daysOfWeek.includes(idx)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSeriesFormData({
                              ...seriesFormData,
                              daysOfWeek: [...seriesFormData.daysOfWeek, idx],
                            });
                          } else {
                            setSeriesFormData({
                              ...seriesFormData,
                              daysOfWeek: seriesFormData.daysOfWeek.filter((d) => d !== idx),
                            });
                          }
                        }}
                        className="accent-indigo-600"
                      />
                      <span className="text-xs font-medium">{name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-xs">Doctors</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={seriesFormData.doctorsRequired}
                    onChange={(e) =>
                      setSeriesFormData({
                        ...seriesFormData,
                        doctorsRequired: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">Nurses</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={seriesFormData.nursesRequired}
                    onChange={(e) =>
                      setSeriesFormData({
                        ...seriesFormData,
                        nursesRequired: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">Receptionists</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={seriesFormData.receptionistsRequired}
                    onChange={(e) =>
                      setSeriesFormData({
                        ...seriesFormData,
                        receptionistsRequired: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSeriesModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-sm"
                >
                  Create Series
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Staff Modal */}
      {assigningShiftId && assigningShift && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-1">Assign Staff Member</h2>

            {/* Auto-populated shift context — no need to look up the shift elsewhere */}
            <div className="mb-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
              <div className="font-semibold">
                {new Date(assigningShift.starts_at).toISOString().split("T")[0]}
                {"  "}
                {new Date(assigningShift.starts_at)
                  .toISOString()
                  .substring(11, 16)}{" "}
                –{" "}
                {new Date(assigningShift.ends_at)
                  .toISOString()
                  .substring(11, 16)}
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                {getShiftStaffingMetrics(assigningShift).missingText}
              </div>
            </div>

            <form onSubmit={handleAssignStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Search staff
                </label>
                <input
                  type="text"
                  placeholder="Search by name, email, or staff code"
                  value={assignSearchQuery}
                  onChange={(e) => setAssignSearchQuery(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm mb-2"
                />

                <label className="block text-xs font-semibold mb-1">
                  Select staff member
                </label>
                <select
                  required
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  size={Math.min(8, Math.max(4, assignablePeople.length + 1))}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                >
                  <option value="" disabled>
                    {staffList.length === 0
                      ? "Loading staff…"
                      : assignablePeople.length === 0
                        ? "No matching staff found"
                        : "Select a staff member…"}
                  </option>
                  {assignablePeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} — {person.profession ?? "staff"} (#
                      {person.staff_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setAssigningShiftId(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 font-semibold text-sm"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!assignUserId}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-sm text-sm disabled:opacity-50"
                >
                  Assign Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
