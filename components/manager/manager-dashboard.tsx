"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRealtimeShifts } from "@/hooks/use-realtime-shifts";

export interface ShiftClaim {
  id: string;
  shift_id: string;
  user_id: string;
  claimed_by: string;
  created_at: string;
  user?: {
    full_name: string;
    profession: "doctor" | "nurse" | "receptionist";
    email: string;
  };
}

export interface ShiftItem {
  id: string;
  starts_at: string;
  ends_at: string;
  doctors_required: number;
  nurses_required: number;
  receptionists_required: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  claims?: ShiftClaim[];
}

export function ManagerDashboard() {
  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "doctor" | "nurse" | "receptionist">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "full" | "partial" | "empty">("all");
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split("T")[0];
  });

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

  // Assignment Modal state
  const [assigningShiftId, setAssigningShiftId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignActionMessage, setAssignActionMessage] = useState<string | null>(null);

  const fetchShifts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/shifts");
      if (!res.ok) throw new Error("Failed to load shifts");
      const data = await res.json();
      setShifts(data.shifts || []);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Realtime update callback
  useRealtimeShifts(useCallback(() => {
    fetchShifts();
  }, [fetchShifts]));

  // Calculate missing roles for a shift
  const getShiftStaffingMetrics = useCallback((shift: ShiftItem) => {
    const claims = shift.claims || [];
    let claimedDoctors = 0;
    let claimedNurses = 0;
    let claimedReceptionists = 0;

    for (const c of claims) {
      if (c.user?.profession === "doctor") claimedDoctors++;
      else if (c.user?.profession === "nurse") claimedNurses++;
      else if (c.user?.profession === "receptionist") claimedReceptionists++;
    }

    const missingDoctors = Math.max(0, shift.doctors_required - claimedDoctors);
    const missingNurses = Math.max(0, shift.nurses_required - claimedNurses);
    const missingReceptionists = Math.max(0, shift.receptionists_required - claimedReceptionists);

    const totalRequired = shift.doctors_required + shift.nurses_required + shift.receptionists_required;
    const totalClaimed = claimedDoctors + claimedNurses + claimedReceptionists;
    const totalMissing = missingDoctors + missingNurses + missingReceptionists;

    let status: "full" | "partial" | "empty" = "empty";
    if (totalClaimed >= totalRequired && totalRequired > 0) {
      status = "full";
    } else if (totalClaimed > 0) {
      status = "partial";
    }

    const missingList: string[] = [];
    if (missingDoctors > 0) missingList.push(`${missingDoctors} Doctor${missingDoctors > 1 ? "s" : ""}`);
    if (missingNurses > 0) missingList.push(`${missingNurses} Nurse${missingNurses > 1 ? "s" : ""}`);
    if (missingReceptionists > 0) missingList.push(`${missingReceptionists} Receptionist${missingReceptionists > 1 ? "s" : ""}`);

    return {
      status,
      totalRequired,
      totalClaimed,
      totalMissing,
      missingDoctors,
      missingNurses,
      missingReceptionists,
      missingText: missingList.length > 0 ? `Missing: ${missingList.join(", ")}` : "Fully Staffed",
    };
  }, []);

  // Filtered shifts logic
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
      if (roleFilter === "receptionist" && s.receptionists_required <= 0) return false;

      // Status filter
      if (statusFilter !== "all" && metrics.status !== statusFilter) return false;

      return true;
    });
  }, [shifts, searchQuery, roleFilter, statusFilter, getShiftStaffingMetrics]);

  // Week Days Calculation for Coverage View
  const weekDays = useMemo(() => {
    const start = new Date(selectedWeekStart);
    const days: { dateStr: string; dayName: string; formattedDate: string }[] = [];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      days.push({
        dateStr,
        dayName: dayNames[i],
        formattedDate: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
    return days;
  }, [selectedWeekStart]);

  // Shift Create/Edit Handler
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const url = editingShiftId ? `/api/shifts/${editingShiftId}` : "/api/shifts";
      const method = editingShiftId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save shift");

      setIsModalOpen(false);
      setEditingShiftId(null);
      fetchShifts();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  // Delete Shift Handler
  const handleDeleteShift = async (id: string) => {
    if (!confirm("Are you sure you want to delete this shift?")) return;
    try {
      const res = await fetch(`/api/shifts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete shift");
      }
      fetchShifts();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  // Assign Staff Handler
  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningShiftId || !assignUserId.trim()) return;

    setAssignActionMessage(null);
    try {
      const res = await fetch(`/api/shifts/${assigningShiftId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: assignUserId.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign staff");

      setAssignUserId("");
      setAssignActionMessage("Staff member assigned successfully!");
      fetchShifts();
    } catch (err: unknown) {
      setAssignActionMessage(`Error: ${(err as Error).message}`);
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

      fetchShifts();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manager Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage clinic shifts, assign staff members, monitor weekly coverage, and review CSV import reports.
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
          <Link
            href="/manager/import"
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-sm px-4 py-2.5 rounded-lg transition-all border border-slate-300 dark:border-slate-700"
          >
            Import CSV File
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Week Coverage Dashboard */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold">Week Coverage Dashboard</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Week-at-a-glance staffing indicator and missing roles overview
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <label className="font-semibold text-xs text-slate-600 dark:text-slate-400">Week Starting:</label>
            <input
              type="date"
              value={selectedWeekStart}
              onChange={(e) => setSelectedWeekStart(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 7-Day Grid View */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const dayShifts = shifts.filter((s) => s.starts_at.startsWith(day.dateStr));

            return (
              <div
                key={day.dateStr}
                className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 flex flex-col h-full min-h-[160px]"
              >
                <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-2 mb-2">
                  <div className="text-xs font-bold text-slate-500 uppercase">{day.dayName}</div>
                  <div className="text-sm font-semibold">{day.formattedDate}</div>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto max-h-56">
                  {dayShifts.length === 0 ? (
                    <div className="text-[11px] text-slate-400 text-center py-4">No shifts</div>
                  ) : (
                    dayShifts.map((s) => {
                      const metrics = getShiftStaffingMetrics(s);
                      const startStr = new Date(s.starts_at).toISOString().substring(11, 16);
                      const endStr = new Date(s.ends_at).toISOString().substring(11, 16);

                      return (
                        <div
                          key={s.id}
                          className={`p-2 rounded-md border text-xs space-y-1 ${
                            metrics.status === "full"
                              ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                              : metrics.status === "partial"
                              ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                              : "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
                          }`}
                        >
                          <div className="font-semibold flex justify-between">
                            <span>{startStr}–{endStr}</span>
                            <span className="capitalize font-bold text-[10px]">{metrics.status}</span>
                          </div>
                          <div className="text-[10px] leading-tight font-medium opacity-90">
                            {metrics.missingText}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shift List with Search & Filtering */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold">All Clinic Shifts ({filteredShifts.length})</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Search, filter, edit, and assign staff members</p>
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
              onChange={(e) => setRoleFilter(e.target.value as "all" | "doctor" | "nurse" | "receptionist")}
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
              onChange={(e) => setStatusFilter(e.target.value as "all" | "full" | "partial" | "empty")}
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
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">Loading shifts...</div>
        ) : filteredShifts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">No shifts match your search and filter criteria.</div>
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

                  const isOvernight = endDate.getUTCDate() !== startDate.getUTCDate();
                  const dateStr = startDate.toISOString().split("T")[0];
                  const startStr = startDate.toISOString().substring(11, 16);
                  const endStr = endDate.toISOString().substring(11, 16);

                  return (
                    <tr key={shift.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-4 font-medium">
                        <div>{dateStr}</div>
                        <div className="text-xs text-slate-500">
                          {startStr} – {endStr} {isOvernight ? "(+1 day)" : ""}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-xs space-y-1">
                        <div>Doctors: <span className="font-semibold">{shift.doctors_required}</span></div>
                        <div>Nurses: <span className="font-semibold">{shift.nurses_required}</span></div>
                        <div>Receptionists: <span className="font-semibold">{shift.receptionists_required}</span></div>
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
                        <div className="text-xs text-slate-500 mt-1 font-medium">{metrics.missingText}</div>
                      </td>

                      <td className="py-4 px-4 text-xs">
                        {shift.claims && shift.claims.length > 0 ? (
                          <div className="space-y-1">
                            {shift.claims.map((claim) => (
                              <div key={claim.id} className="flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                                <span>
                                  {claim.user?.full_name || claim.user_id} ({claim.user?.profession || "staff"})
                                </span>
                                <button
                                  onClick={() => handleRemoveAssignment(shift.id, claim.user_id)}
                                  className="text-rose-600 hover:text-rose-700 font-bold ml-1"
                                  title="Remove assignment"
                                >
                                  &times;
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">None assigned</span>
                        )}
                      </td>

                      <td className="py-4 px-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setAssigningShiftId(shift.id);
                            setAssignUserId("");
                            setAssignActionMessage(null);
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
                              receptionistsRequired: shift.receptionists_required,
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
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
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
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">End Time</label>
                  <input
                    type="time"
                    required
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-xs">Doctors</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.doctorsRequired}
                    onChange={(e) => setFormData({ ...formData, doctorsRequired: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">Nurses</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.nursesRequired}
                    onChange={(e) => setFormData({ ...formData, nursesRequired: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">Receptionists</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.receptionistsRequired}
                    onChange={(e) => setFormData({ ...formData, receptionistsRequired: parseInt(e.target.value, 10) || 0 })}
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

      {/* Assign Staff Modal */}
      {assigningShiftId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-bold mb-2">Assign Staff Member</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Enter the staff User ID or Email to assign them to this shift.
            </p>

            {assignActionMessage && (
              <div className={`mb-4 p-3 rounded-lg text-xs font-medium ${
                assignActionMessage.startsWith("Error") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
              }`}>
                {assignActionMessage}
              </div>
            )}

            <form onSubmit={handleAssignStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Target Staff User ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono"
                />
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
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-sm text-sm"
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
