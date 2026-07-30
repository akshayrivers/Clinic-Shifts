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
  external_id: number;
  starts_at: string;
  ends_at: string;
  doctors_required: number;
  nurses_required: number;
  receptionists_required: number;
  series_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  claims?: ShiftClaim[];
}

export interface ShiftStaffingMetrics {
  status: "full" | "partial" | "empty";
  totalRequired: number;
  totalClaimed: number;
  totalMissing: number;
  missingDoctors: number;
  missingNurses: number;
  missingReceptionists: number;
  missingText: string;
}

// Pure — no component state involved — so both dashboards and the shared
// week-coverage view can compute identical staffing status for a shift.
export function getShiftStaffingMetrics(shift: ShiftItem): ShiftStaffingMetrics {
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
}
