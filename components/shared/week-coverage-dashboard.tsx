"use client";

import { useMemo, useState } from "react";
import { ShiftItem, getShiftStaffingMetrics } from "./types";

interface WeekCoverageDashboardProps {
  shifts: ShiftItem[];
  title?: string;
  subtitle?: string;
  // Optional — lets a specific dashboard (e.g. manager) render its own actions
  // (assign/edit/delete buttons) inside the day-detail panel, without this
  // shared component needing to know about those actions itself.
  renderShiftActions?: (shift: ShiftItem) => React.ReactNode;
}

function statusColorClasses(status: "full" | "partial" | "empty") {
  if (status === "full") {
    return "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
  }
  if (status === "partial") {
    return "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
  }
  return "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900";
}

export function WeekCoverageDashboard({
  shifts,
  title = "Week Coverage Dashboard",
  subtitle = "Week-at-a-glance staffing indicator and missing roles overview",
  renderShiftActions,
}: WeekCoverageDashboardProps) {
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(today.setDate(diff));
    return monday.toISOString().split("T")[0];
  });

  // Which day's detail panel is expanded below the grid — null means none.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
        formattedDate: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      });
    }
    return days;
  }, [selectedWeekStart]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftItem[]>();
    for (const day of weekDays) {
      map.set(
        day.dateStr,
        shifts
          .filter((s) => s.starts_at.startsWith(day.dateStr))
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      );
    }
    return map;
  }, [shifts, weekDays]);

  const selectedDayInfo = weekDays.find((d) => d.dateStr === selectedDay) ?? null;
  const selectedDayShifts = selectedDay ? shiftsByDay.get(selectedDay) ?? [] : [];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="font-semibold text-xs text-slate-600 dark:text-slate-400">Week Starting:</label>
          <input
            type="date"
            value={selectedWeekStart}
            onChange={(e) => {
              setSelectedWeekStart(e.target.value);
              setSelectedDay(null); // jumping weeks closes any open day panel
            }}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* 7-Day Grid View — click a day to see it expanded below */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {weekDays.map((day) => {
          const dayShifts = shiftsByDay.get(day.dateStr) ?? [];
          const isSelected = selectedDay === day.dateStr;

          return (
            <button
              key={day.dateStr}
              type="button"
              onClick={() => setSelectedDay(isSelected ? null : day.dateStr)}
              className={`text-left bg-slate-50 dark:bg-slate-950/60 border rounded-lg p-3 flex flex-col h-full min-h-[160px] transition-colors ${
                isSelected
                  ? "border-indigo-500 ring-2 ring-indigo-500/40"
                  : "border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800"
              }`}
            >
              <div className="text-center border-b border-slate-200 dark:border-slate-800 pb-2 mb-2">
                <div className="text-xs font-bold text-slate-500 uppercase">{day.dayName}</div>
                <div className="text-sm font-semibold">{day.formattedDate.split(",")[0]}</div>
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
                      <div key={s.id} className={`p-2 rounded-md border text-xs space-y-1 ${statusColorClasses(metrics.status)}`}>
                        <div className="font-semibold flex justify-between">
                          <span>{startStr}–{endStr}</span>
                          <span className="capitalize font-bold text-[10px]">{metrics.status}</span>
                        </div>
                        <div className="text-[10px] leading-tight font-medium opacity-90">{metrics.missingText}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day Detail Panel — the full visual breakdown of whichever day is selected */}
      {selectedDayInfo && (
        <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold">
              {selectedDayInfo.dayName}, {selectedDayInfo.formattedDate}
            </h3>
            <button
              onClick={() => setSelectedDay(null)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
            >
              Close ✕
            </button>
          </div>

          {selectedDayShifts.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No shifts scheduled this day.</p>
          ) : (
            <div className="space-y-3">
              {selectedDayShifts.map((shift) => {
                const metrics = getShiftStaffingMetrics(shift);
                const startDate = new Date(shift.starts_at);
                const endDate = new Date(shift.ends_at);
                const isOvernight = endDate.getUTCDate() !== startDate.getUTCDate();
                const startStr = startDate.toISOString().substring(11, 16);
                const endStr = endDate.toISOString().substring(11, 16);

                return (
                  <div
                    key={shift.id}
                    className={`rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center gap-4 ${statusColorClasses(metrics.status)}`}
                  >
                    <div className="sm:w-40 shrink-0">
                      <div className="font-bold text-sm">
                        {startStr} – {endStr} {isOvernight && <span className="text-[10px] font-medium">(+1 day)</span>}
                      </div>
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-white/60 dark:bg-black/20">
                        {metrics.status}
                      </span>
                    </div>

                    <div className="flex-1 text-xs space-y-1">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
                        <span>Doctors: {shift.doctors_required}</span>
                        <span>Nurses: {shift.nurses_required}</span>
                        <span>Receptionists: {shift.receptionists_required}</span>
                      </div>
                      <div className="font-semibold">{metrics.missingText}</div>
                      <div>
                        {shift.claims && shift.claims.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {shift.claims.map((c) => (
                              <span
                                key={c.id}
                                className="px-2 py-0.5 rounded bg-white/70 dark:bg-black/30 text-[11px] font-medium"
                              >
                                {c.user?.full_name || c.user_id} ({c.user?.profession || "staff"})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="italic opacity-75">None assigned</span>
                        )}
                      </div>
                    </div>

                    {renderShiftActions && <div className="shrink-0">{renderShiftActions(shift)}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
