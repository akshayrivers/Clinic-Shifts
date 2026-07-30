import { shiftsRepo, shiftClaimsRepo, queryOne, ShiftEntity, CreateShiftInput, ShiftClaimWithUser } from "@/lib/db";

export interface ShiftWithClaims extends ShiftEntity {
  claims: ShiftClaimWithUser[];
}

export class ShiftValidationError extends Error {
  constructor(message: string, public readonly code: string = "VALIDATION_ERROR") {
    super(message);
    this.name = "ShiftValidationError";
  }
}

export interface CreateShiftPayload {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  doctorsRequired?: number;
  nursesRequired?: number;
  receptionistsRequired?: number;
  createdBy?: string | null;
}

export interface UpdateShiftPayload {
  date?: string;
  startTime?: string;
  endTime?: string;
  doctorsRequired?: number;
  nursesRequired?: number;
  receptionistsRequired?: number;
}

/**
 * Calculates starts_at and ends_at dates from date (YYYY-MM-DD), startTime (HH:mm), and endTime (HH:mm).
 * Supports overnight shifts (e.g. 22:00 -> 06:00).
 */
export function calculateShiftTimestamps(dateStr: string, startTimeStr: string, endTimeStr: string): { startsAt: Date; endsAt: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ShiftValidationError("Invalid date format. Expected YYYY-MM-DD.");
  }
  if (!/^\d{2}:\d{2}$/.test(startTimeStr) || !/^\d{2}:\d{2}$/.test(endTimeStr)) {
    throw new ShiftValidationError("Invalid time format. Expected HH:mm.");
  }

  const startsAt = new Date(`${dateStr}T${startTimeStr}:00Z`);
  let endsAt = new Date(`${dateStr}T${endTimeStr}:00Z`);

  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
    throw new ShiftValidationError("Invalid date or time values.");
  }

  // Overnight shift: end time is on or before start time (e.g., 22:00 -> 06:00 or 16:00 -> 00:00)
  if (endsAt <= startsAt) {
    endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
  }

  if (endsAt <= startsAt) {
    throw new ShiftValidationError("Shift end time must be after start time.");
  }

  return { startsAt, endsAt };
}

export const shiftsService = {
  async createShift(payload: CreateShiftPayload): Promise<ShiftEntity> {
    const doctors = payload.doctorsRequired ?? 0;
    const nurses = payload.nursesRequired ?? 0;
    const receptionists = payload.receptionistsRequired ?? 0;

    if (doctors < 0 || nurses < 0 || receptionists < 0) {
      throw new ShiftValidationError("Staff requirements cannot be negative.");
    }

    if (doctors + nurses + receptionists <= 0) {
      throw new ShiftValidationError("Shift requires at least one staff member (doctor, nurse, or receptionist).");
    }

    const { startsAt, endsAt } = calculateShiftTimestamps(payload.date, payload.startTime, payload.endTime);

    let externalId: number;
    try {
      const result = await queryOne<{ nextval: number }>(`SELECT nextval('shifts_external_id_seq')`);
      externalId = result!.nextval;
    } catch {
      const maxResult = await queryOne<{ max: number | null }>(`SELECT MAX(external_id) FROM shifts`);
      externalId = (maxResult?.max ?? 0) + 1;
    }

    return shiftsRepo.create({
      external_id: externalId,
      starts_at: startsAt,
      ends_at: endsAt,
      doctors_required: doctors,
      nurses_required: nurses,
      receptionists_required: receptionists,
      created_by: payload.createdBy ?? null,
    });
  },

  async updateShift(id: string, payload: UpdateShiftPayload): Promise<ShiftEntity> {
    const existing = await shiftsRepo.findById(id);
    if (!existing) {
      throw new ShiftValidationError("Shift not found.", "NOT_FOUND");
    }

    const doctors = payload.doctorsRequired ?? existing.doctors_required;
    const nurses = payload.nursesRequired ?? existing.nurses_required;
    const receptionists = payload.receptionistsRequired ?? existing.receptionists_required;

    if (doctors < 0 || nurses < 0 || receptionists < 0) {
      throw new ShiftValidationError("Staff requirements cannot be negative.");
    }

    if (doctors + nurses + receptionists <= 0) {
      throw new ShiftValidationError("Shift requires at least one staff member.");
    }

    let startsAt = existing.starts_at;
    let endsAt = existing.ends_at;

    if (payload.date || payload.startTime || payload.endTime) {
      const dateStr = payload.date || existing.starts_at.toISOString().split("T")[0];
      const startStr = payload.startTime || existing.starts_at.toISOString().split("T")[1].substring(0, 5);
      const endStr = payload.endTime || existing.ends_at.toISOString().split("T")[1].substring(0, 5);

      const calculated = calculateShiftTimestamps(dateStr, startStr, endStr);
      startsAt = calculated.startsAt;
      endsAt = calculated.endsAt;
    }

    const updated = await shiftsRepo.update(id, {
      starts_at: startsAt,
      ends_at: endsAt,
      doctors_required: doctors,
      nurses_required: nurses,
      receptionists_required: receptionists,
    });

    if (!updated) {
      throw new ShiftValidationError("Failed to update shift.", "UPDATE_FAILED");
    }

    return updated;
  },

  async deleteShift(id: string): Promise<boolean> {
    const existing = await shiftsRepo.findById(id);
    if (!existing) {
      throw new ShiftValidationError("Shift not found.", "NOT_FOUND");
    }
    return shiftsRepo.delete(id);
  },

  async getShiftById(id: string): Promise<ShiftWithClaims | null> {
    const shift = await shiftsRepo.findById(id);
    if (!shift) return null;
    const claims = await shiftClaimsRepo.findByShiftIdWithUser(id);
    return { ...shift, claims };
  },

  async getShifts(startDate?: Date, endDate?: Date): Promise<ShiftWithClaims[]> {
    const shifts = startDate && endDate
      ? await shiftsRepo.findByRange(startDate, endDate)
      : await shiftsRepo.findByRange(new Date("2000-01-01"), new Date("2100-01-01"));

    if (shifts.length === 0) return [];

    // One query for every shift's claims, instead of one query per shift (N+1).
    const allClaims = await shiftClaimsRepo.findByShiftIdsWithUser(shifts.map((s) => s.id));
    const claimsByShiftId = new Map<string, ShiftClaimWithUser[]>();
    for (const claim of allClaims) {
      const existing = claimsByShiftId.get(claim.shift_id) ?? [];
      existing.push(claim);
      claimsByShiftId.set(claim.shift_id, existing);
    }

    return shifts.map((shift) => ({
      ...shift,
      claims: claimsByShiftId.get(shift.id) ?? [],
    }));
  },
};
