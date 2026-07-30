import { shiftsRepo, shiftClaimsRepo, queryOne, withTransaction, ShiftEntity, CreateShiftInput, ShiftClaimWithUser, Profession } from "@/lib/db";

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

export interface UpdateShiftViolation {
  type: "over_capacity" | "overlap";
  profession: string;
  details: string;
  userId?: string;
  userName?: string;
}

export interface UpdateShiftResult {
  shift?: ShiftEntity;
  violations?: UpdateShiftViolation[];
  removedClaims?: { userId: string; userName: string; profession: string }[];
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

  async updateShift(id: string, payload: UpdateShiftPayload, force = false): Promise<UpdateShiftResult> {
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

    const timeChanged = startsAt.getTime() !== existing.starts_at.getTime() ||
      endsAt.getTime() !== existing.ends_at.getTime();
    const requirementsChanged = doctors !== existing.doctors_required ||
      nurses !== existing.nurses_required ||
      receptionists !== existing.receptionists_required;

    if (!timeChanged && !requirementsChanged) {
      const updated = await shiftsRepo.update(id, {
        starts_at: startsAt,
        ends_at: endsAt,
        doctors_required: doctors,
        nurses_required: nurses,
        receptionists_required: receptionists,
      });
      if (!updated) throw new ShiftValidationError("Failed to update shift.", "UPDATE_FAILED");
      return { shift: updated };
    }

    return withTransaction(async (client) => {
      const locked = await shiftsRepo.findByIdForUpdate(id, client);
      if (!locked) {
        throw new ShiftValidationError("Shift not found.", "NOT_FOUND");
      }

      const claims = await shiftClaimsRepo.findByShiftIdWithUser(id, client);
      const violations: UpdateShiftViolation[] = [];

      if (requirementsChanged && claims.length > 0) {
        const profMap: { profession: Profession; required: number; current: number }[] = [
          { profession: "doctor", required: doctors, current: 0 },
          { profession: "nurse", required: nurses, current: 0 },
          { profession: "receptionist", required: receptionists, current: 0 },
        ];

        for (const claim of claims) {
          const p = claim.user.profession;
          if (p) {
            const entry = profMap.find((e) => e.profession === p);
            if (entry) entry.current++;
          }
        }

        for (const entry of profMap) {
          if (entry.required < entry.current) {
            violations.push({
              type: "over_capacity",
              profession: entry.profession!,
              details: `${entry.profession} requirement reduced from ${entry.current} to ${entry.required}, but ${entry.current} ${entry.profession}(s) are currently claimed`,
            });
          }
        }
      }

      if (timeChanged && claims.length > 0) {
        for (const claim of claims) {
          if (!claim.user.profession) continue;
          const overlapping = await shiftsRepo.findOverlappingForUserExcluding(
            claim.user_id,
            startsAt,
            endsAt,
            id,
            client,
          );
          if (overlapping.length > 0) {
            violations.push({
              type: "overlap",
              profession: claim.user.profession,
              userId: claim.user_id,
              userName: claim.user.full_name,
              details: `Shift time change creates overlap for ${claim.user.full_name}`,
            });
          }
        }
      }

      if (violations.length > 0 && !force) {
        return { violations };
      }

      const removedClaims: { userId: string; userName: string; profession: string }[] = [];

      if (force && violations.length > 0) {
        for (const v of violations) {
          if (v.type === "overlap" && v.userId) {
            await shiftClaimsRepo.deleteByShiftAndUser(id, v.userId, client);
            removedClaims.push({ userId: v.userId, userName: v.userName ?? "Unknown", profession: v.profession });
          }
        }
      }

      const updated = await shiftsRepo.update(
        id,
        {
          starts_at: startsAt,
          ends_at: endsAt,
          doctors_required: doctors,
          nurses_required: nurses,
          receptionists_required: receptionists,
        },
        client,
      );

      if (!updated) {
        throw new ShiftValidationError("Failed to update shift.", "UPDATE_FAILED");
      }

      const result: UpdateShiftResult = { shift: updated };
      if (removedClaims.length > 0) result.removedClaims = removedClaims;
      return result;
    });
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
