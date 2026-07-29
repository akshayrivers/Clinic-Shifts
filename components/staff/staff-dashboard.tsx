"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRealtimeShifts } from "@/hooks/use-realtime-shifts";
import { ShiftItem } from "@/components/shared/types";
import { WeekCoverageDashboard } from "@/components/shared/week-coverage-dashboard";

export function StaffDashboard() {
  const { data: session } = useSession();
  const currentUser = session?.user;

  const [shifts, setShifts] = useState<ShiftItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"available" | "my_claims">(
    "available",
  );

  // Feedback validation message
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actioningShiftId, setActioningShiftId] = useState<string | null>(null);

  const fetchShifts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/shifts");
      if (!res.ok) throw new Error("Failed to load shifts");
      const data = await res.json();
      setShifts(data.shifts || []);
      console.log(
        "[StaffDashboard] fetched shifts:",
        (data.shifts || []).length,
      );
    } catch (err: unknown) {
      setValidationError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Realtime subscription
  useRealtimeShifts(() => {
    fetchShifts();
  });

  const currentProfession = currentUser?.profession;

  // Filter shifts claimed by current staff user
  const myClaimedShifts = useMemo(() => {
    if (!currentUser?.id) return [];
    return shifts.filter((s) =>
      s.claims?.some((c) => c.user_id === currentUser.id),
    );
  }, [shifts, currentUser?.id]);

  // Filter available shifts needing staff of current user's profession
  const availableShifts = useMemo(() => {
    if (!currentUser?.id) return shifts;
    return shifts.filter((s) => {
      // Exclude already claimed by user
      const alreadyClaimed = s.claims?.some(
        (c) => c.user_id === currentUser.id,
      );
      if (alreadyClaimed) return false;

      // Check capacity requirement for profession
      if (currentProfession === "doctor" && s.doctors_required > 0) return true;
      if (currentProfession === "nurse" && s.nurses_required > 0) return true;
      if (currentProfession === "receptionist" && s.receptionists_required > 0)
        return true;

      return false;
    });
  }, [shifts, currentUser?.id, currentProfession]);

  // Claim Shift Handler
  const handleClaimShift = async (shiftId: string) => {
    setActioningShiftId(shiftId);
    setValidationError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/shifts/${shiftId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to claim shift");
      }

      setSuccessMessage("Shift claimed successfully!");
      fetchShifts();
    } catch (err: unknown) {
      setValidationError((err as Error).message);
    } finally {
      setActioningShiftId(null);
    }
  };

  // Unclaim Shift Handler
  const handleUnclaimShift = async (shiftId: string) => {
    setActioningShiftId(shiftId);
    setValidationError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/shifts/${shiftId}/claim`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to unclaim shift");
      }

      setSuccessMessage("Shift unclaimed successfully.");
      fetchShifts();
    } catch (err: unknown) {
      setValidationError((err as Error).message);
    } finally {
      setActioningShiftId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Staff Profile Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Portal</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Welcome,{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {currentUser?.fullName}
            </span>
            . Profession:{" "}
            <span className="font-bold text-teal-600 dark:text-teal-400 capitalize">
              {currentProfession || "Staff"}
            </span>
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab("available")}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
              activeTab === "available"
                ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            Available Shifts ({availableShifts.length})
          </button>
          <button
            onClick={() => setActiveTab("my_claims")}
            className={`px-4 py-2 text-xs font-semibold rounded-md transition-all ${
              activeTab === "my_claims"
                ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            My Claimed Shifts ({myClaimedShifts.length})
          </button>
        </div>
      </div>

      {/* Validation / Success Notifications */}
      {validationError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <span>{validationError}</span>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="text-rose-500 hover:text-rose-700 font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-lg">✅</span>
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold"
          >
            &times;
          </button>
        </div>
      )}

      {/* Week Coverage Dashboard — same shared component the manager view uses */}
      <WeekCoverageDashboard
        shifts={shifts}
        title="Week at a Glance"
        subtitle="Click a day to see every shift scheduled that day"
      />

      {/* Shifts View */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
        <h2 className="text-lg font-bold">
          {activeTab === "available"
            ? `Shifts Needing ${currentProfession ? currentProfession + "s" : "Staff"}`
            : "My Schedule & Claimed Shifts"}
        </h2>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            Loading shift schedules...
          </div>
        ) : (activeTab === "available" ? availableShifts : myClaimedShifts)
            .length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {activeTab === "available"
              ? "No available shifts currently require your profession."
              : "You have not claimed any shifts yet."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(activeTab === "available"
              ? availableShifts
              : myClaimedShifts
            ).map((shift) => {
              const startDate = new Date(shift.starts_at);
              const endDate = new Date(shift.ends_at);
              const isOvernight =
                endDate.getUTCDate() !== startDate.getUTCDate();

              const dateStr = startDate.toISOString().split("T")[0];
              const startStr = startDate.toISOString().substring(11, 16);
              const endStr = endDate.toISOString().substring(11, 16);

              const isClaimedByMe = shift.claims?.some(
                (c) => c.user_id === currentUser?.id,
              );
              const claimsCount = shift.claims?.length || 0;

              return (
                <div
                  key={shift.id}
                  className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                      <span className="font-bold text-base">{dateStr}</span>
                      <span className="text-xs text-slate-500 font-mono">
                        ID: {shift.id.substring(0, 8)}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {startStr} – {endStr} {isOvernight ? "(+1 day)" : ""}
                    </div>

                    <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400 pt-1">
                      <div>
                        Required Doctors:{" "}
                        <span className="font-semibold">
                          {shift.doctors_required}
                        </span>
                      </div>
                      <div>
                        Required Nurses:{" "}
                        <span className="font-semibold">
                          {shift.nurses_required}
                        </span>
                      </div>
                      <div>
                        Required Receptionists:{" "}
                        <span className="font-semibold">
                          {shift.receptionists_required}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Total Staff Claimed: {claimsCount}
                    </span>

                    {isClaimedByMe ? (
                      <button
                        onClick={() => handleUnclaimShift(shift.id)}
                        disabled={actioningShiftId === shift.id}
                        className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                      >
                        {actioningShiftId === shift.id
                          ? "Unclaiming..."
                          : "Unclaim Shift"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleClaimShift(shift.id)}
                        disabled={actioningShiftId === shift.id}
                        className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-all shadow-sm"
                      >
                        {actioningShiftId === shift.id
                          ? "Claiming..."
                          : "Claim Shift"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
