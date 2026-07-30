import {
  shiftSeriesRepo,
  shiftsRepo,
  shiftClaimsRepo,
  queryOne,
  withTransaction,
  ShiftSeriesEntity,
  ShiftEntity,
  ShiftClaimWithUser,
} from "@/lib/db";
import { ShiftValidationError } from "./shifts.service";

export interface CreateSeriesPayload {
  startDate: string;
  untilDate: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  doctorsRequired?: number;
  nursesRequired?: number;
  receptionistsRequired?: number;
  createdBy: string;
}

export interface SeriesWithShifts extends ShiftSeriesEntity {
  shifts: (ShiftEntity & { claims: ShiftClaimWithUser[] })[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateOccurrences(
  startDate: string,
  untilDate: string,
  daysOfWeek: number[],
): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const until = new Date(`${untilDate}T00:00:00Z`);

  if (isNaN(start.getTime()) || isNaN(until.getTime())) {
    throw new ShiftValidationError("Invalid start or end date.");
  }
  if (until < start) {
    throw new ShiftValidationError("Until date must be after start date.");
  }
  if (daysOfWeek.length === 0) {
    throw new ShiftValidationError("At least one day of the week must be selected.");
  }

  const dates: string[] = [];
  const current = new Date(start);

  while (current <= until) {
    if (daysOfWeek.includes(current.getUTCDay())) {
      dates.push(formatDate(current));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  if (dates.length === 0) {
    throw new ShiftValidationError("No occurrences match the selected days between the start and until dates.");
  }

  return dates;
}

export const shiftSeriesService = {
  async createSeries(payload: CreateSeriesPayload) {
    const doctors = payload.doctorsRequired ?? 0;
    const nurses = payload.nursesRequired ?? 0;
    const receptionists = payload.receptionistsRequired ?? 0;

    if (doctors < 0 || nurses < 0 || receptionists < 0) {
      throw new ShiftValidationError("Staff requirements cannot be negative.");
    }
    if (doctors + nurses + receptionists <= 0) {
      throw new ShiftValidationError("Shift series requires at least one staff member.");
    }

    const dates = generateOccurrences(
      payload.startDate,
      payload.untilDate,
      payload.daysOfWeek,
    );

    let startExternalId: number;
    try {
      const result = await queryOne<{ nextval: number }>(`SELECT nextval('shifts_external_id_seq')`);
      startExternalId = result!.nextval;
    } catch {
      const maxResult = await queryOne<{ max: number | null }>(`SELECT MAX(external_id) FROM shifts`);
      startExternalId = (maxResult?.max ?? 0) + 1;
    }

    return withTransaction(async (client) => {
      const series = await shiftSeriesRepo.create(
        {
          days_of_week: payload.daysOfWeek,
          start_time: payload.startTime,
          end_time: payload.endTime,
          doctors_required: doctors,
          nurses_required: nurses,
          receptionists_required: receptionists,
          until_date: payload.untilDate,
          created_by: payload.createdBy,
        },
        client,
      );

      let externalId = startExternalId;

      const shifts: ShiftEntity[] = [];
      for (const date of dates) {
        const startsAt = new Date(`${date}T${payload.startTime}:00Z`);
        let endsAt = new Date(`${date}T${payload.endTime}:00Z`);

        if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) {
          throw new ShiftValidationError("Invalid date or time values.");
        }

        if (endsAt <= startsAt) {
          endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
        }

        const shift = await shiftsRepo.create(
          {
            external_id: externalId++,
            starts_at: startsAt,
            ends_at: endsAt,
            doctors_required: doctors,
            nurses_required: nurses,
            receptionists_required: receptionists,
            created_by: payload.createdBy,
            series_id: series.id,
          },
          client,
        );
        shifts.push(shift);
      }

      return { series, shifts };
    });
  },

  async getSeries(): Promise<ShiftSeriesEntity[]> {
    return shiftSeriesRepo.findAll();
  },

  async getSeriesById(id: string): Promise<SeriesWithShifts | null> {
    const series = await shiftSeriesRepo.findById(id);
    if (!series) return null;

    const shifts = await shiftsRepo.findBySeriesId(id);

    const shiftIds = shifts.map((s) => s.id);
    let allClaims: ShiftClaimWithUser[] = [];
    if (shiftIds.length > 0) {
      allClaims = await shiftClaimsRepo.findByShiftIdsWithUser(shiftIds);
    }

    const claimsByShiftId = new Map<string, ShiftClaimWithUser[]>();
    for (const claim of allClaims) {
      const existing = claimsByShiftId.get(claim.shift_id) ?? [];
      existing.push(claim);
      claimsByShiftId.set(claim.shift_id, existing);
    }

    return {
      ...series,
      shifts: shifts.map((s) => ({
        ...s,
        claims: claimsByShiftId.get(s.id) ?? [],
      })),
    };
  },

  async deleteSeries(id: string): Promise<boolean> {
    const existing = await shiftSeriesRepo.findById(id);
    if (!existing) {
      throw new ShiftValidationError("Shift series not found.", "NOT_FOUND");
    }

    return withTransaction(async (client) => {
      const linkedShifts = await shiftsRepo.findBySeriesId(id, client);
      for (const shift of linkedShifts) {
        await shiftClaimsRepo.deleteByShiftId(shift.id, client);
      }
      await shiftsRepo.deleteBySeriesId(id, client);
      return shiftSeriesRepo.delete(id, client);
    });
  },
};

export { DAY_NAMES };
