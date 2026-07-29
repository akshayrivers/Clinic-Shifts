import bcrypt from "bcryptjs";
import {
  withTransaction,
  importsRepo,
  usersRepo,
  shiftsRepo,
  UserRole,
  Profession,
  ImportRowStatus,
  ImportBatchEntity,
  ImportRowEntity,
} from "@/lib/db";

export interface ImportResultSummary {
  batch: ImportBatchEntity;
  totalRows: number;
  acceptedCount: number;
  rejectedCount: number;
  mergedCount: number;
  rows: ImportRowEntity[];
}

// Pre-computed default password hash for imported staff ("clinic123")
let DEFAULT_PASSWORD_HASH = "";
async function getDefaultPasswordHash(): Promise<string> {
  if (!DEFAULT_PASSWORD_HASH) {
    DEFAULT_PASSWORD_HASH = await bcrypt.hash("clinic123", 10);
  }
  return DEFAULT_PASSWORD_HASH;
}

/**
 * Normalizes staff role/profession string.
 */
export function normalizeStaffRole(rawRole: string): { role: UserRole; profession: Profession } | null {
  const normalized = rawRole.trim().toLowerCase();

  if (["doctor", "md", "physician"].includes(normalized)) {
    return { role: "staff", profession: "doctor" };
  }
  if (["nurse", "rn", "registered nurse"].includes(normalized)) {
    return { role: "staff", profession: "nurse" };
  }
  if (["receptionist", "recep.", "reception"].includes(normalized)) {
    return { role: "staff", profession: "receptionist" };
  }
  if (["manager"].includes(normalized)) {
    return { role: "manager", profession: null };
  }

  return null;
}

/**
 * Normalizes email address (handles "(at)" replacement and trimming).
 */
export function normalizeEmail(rawEmail: string): string | null {
  if (!rawEmail) return null;
  const cleaned = rawEmail.replace(/\(at\)/gi, "@").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

/**
 * Normalizes date string into YYYY-MM-DD format. Validates real dates (rejects 2026-02-30).
 */
export function normalizeDate(rawDate: string): string | null {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();

  let year: number, month: number, day: number;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split("-");
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split("/");
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const parts = trimmed.split("-");
    month = parseInt(parts[0], 10);
    day = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    return null;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return null; // Invalid date like Feb 30
  }

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Normalizes shift requirement string (e.g. "nurses=3;doctors=1;receptionists=1").
 */
export function parseRequirementsString(reqStr: string): {
  doctors: number;
  nurses: number;
  receptionists: number;
} | null {
  if (!reqStr) return null;

  const result = { doctors: 0, nurses: 0, receptionists: 0 };
  const pairs = reqStr.split(";");

  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("=");
    if (parts.length !== 2) return null; // Unparseable like "two nurses and a doctor"

    const key = parts[0].trim().toLowerCase();
    const val = parseInt(parts[1].trim(), 10);

    if (isNaN(val) || val < 0) return null;

    if (key === "doctors" || key === "doctor") result.doctors = val;
    else if (key === "nurses" || key === "nurse") result.nurses = val;
    else if (key === "receptionists" || key === "receptionist" || key === "reception") result.receptionists = val;
    else return null;
  }

  return result;
}

/**
 * Simple CSV parser splitting lines and handling comma values.
 */
export function parseCSV(csvContent: string): Record<string, string>[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = values[j] ?? "";
    }
    rows.push(rowObj);
  }

  return rows;
}

export const importService = {
  /**
   * Import Staff CSV file.
   */
  async importStaffCSV(
    csvContent: string,
    filename = "staff.csv",
    importedBy?: string | null
  ): Promise<ImportResultSummary> {
    const rawRows = parseCSV(csvContent);
    const passwordHash = await getDefaultPasswordHash();

    return withTransaction(async (client) => {
      const batch = await importsRepo.createBatch(
        { source_filename: filename, imported_by: importedBy ?? null },
        client
      );

      let acceptedCount = 0;
      let rejectedCount = 0;
      let mergedCount = 0;
      const createdRows: ImportRowEntity[] = [];

      // Tracks staff_codes accepted earlier IN THIS SAME BATCH, so a duplicate staff_id
      // appearing twice in one CSV is caught even before either row is committed.
      const staffCodesSeenThisBatch = new Set<number>();

      for (let index = 0; index < rawRows.length; index++) {
        const row = rawRows[index];
        const rowNumber = index + 2; // CSV 1-indexed (header is 1)

        const fullName = (row.full_name || "").trim();
        const rawRole = (row.role || "").trim();
        const rawEmail = (row.email || "").trim();
        const rawStaffId = (row.staff_id || "").trim();

        let status: ImportRowStatus = "accepted";
        let reason: string | null = null;
        let resultingId: string | null = null;

        const staffCode = rawStaffId ? parseInt(rawStaffId, 10) : NaN;

        if (!rawStaffId || isNaN(staffCode)) {
          // staff_code is our login identifier now — a row with no usable staff_id
          // can't become a logged-in user, so it's a hard reject, not a soft default.
          status = "rejected";
          reason = "missing or invalid staff_id (required as login identifier)";
        } else if (!fullName) {
          status = "rejected";
          reason = "missing full name";
        } else if (!rawEmail) {
          status = "rejected";
          reason = "missing email address";
        } else {
          const email = normalizeEmail(rawEmail);
          if (!email) {
            status = "rejected";
            reason = `invalid email format: ${rawEmail}`;
          } else {
            const roleInfo = normalizeStaffRole(rawRole);
            if (!roleInfo) {
              status = "rejected";
              reason = `unrecognized role: ${rawRole}`;
            } else {
              // Identity is staff_code now, not email — the CSV has legitimate cases of
              // two different staff_ids sharing an email (e.g. shared front-desk inbox),
              // so email is never used to decide "is this the same person".
              const existingUser = staffCodesSeenThisBatch.has(staffCode)
                ? null // handled below — this is an in-batch duplicate, not a DB one
                : await usersRepo.findByStaffCode(staffCode, client);

              if (staffCodesSeenThisBatch.has(staffCode)) {
                status = "rejected";
                reason = `duplicate staff_id ${staffCode} appears earlier in this same file`;
              } else if (existingUser) {
                // Same staff_id already in the DB — exact duplicate row, merge/update in place.
                const updated = await usersRepo.update(
                  existingUser.id,
                  {
                    full_name: fullName,
                    role: roleInfo.role,
                    profession: roleInfo.profession,
                    email,
                  },
                  client
                );
                status = "merged";
                reason = `Merged with existing staff record (staff_code ${staffCode})`;
                resultingId = updated?.id ?? existingUser.id;
                mergedCount++;
              } else {
                // Create new user
                const newUser = await usersRepo.create(
                  {
                    email,
                    password_hash: passwordHash,
                    full_name: fullName,
                    role: roleInfo.role,
                    profession: roleInfo.profession,
                    staff_code: staffCode,
                  },
                  client
                );
                status = "accepted";
                resultingId = newUser.id;
                acceptedCount++;
              }

              if (status !== "rejected") {
                staffCodesSeenThisBatch.add(staffCode);
              }
            }
          }
        }

        if (status === "rejected") {
          rejectedCount++;
        }

        const importRow = await importsRepo.createRow(
          {
            batch_id: batch.id,
            row_number: rowNumber,
            raw_data: row,
            status,
            reason,
            resulting_id: resultingId,
          },
          client
        );
        createdRows.push(importRow);
      }

      return {
        batch,
        totalRows: rawRows.length,
        acceptedCount,
        rejectedCount,
        mergedCount,
        rows: createdRows,
      };
    });
  },

  /**
   * Import Shifts CSV file.
   */
  async importShiftsCSV(
    csvContent: string,
    filename = "shifts.csv",
    importedBy?: string | null
  ): Promise<ImportResultSummary> {
    const rawRows = parseCSV(csvContent);

    return withTransaction(async (client) => {
      const batch = await importsRepo.createBatch(
        { source_filename: filename, imported_by: importedBy ?? null },
        client
      );

      let acceptedCount = 0;
      let rejectedCount = 0;
      let mergedCount = 0;
      const createdRows: ImportRowEntity[] = [];

      for (let index = 0; index < rawRows.length; index++) {
        const row = rawRows[index];
        const rowNumber = index + 2;

        const rawDate = (row.date || "").trim();
        const rawStartTime = (row.start_time || "").trim();
        const rawEndTime = (row.end_time || "").trim();
        const rawReqs = (row.requirements || "").trim();

        let status: ImportRowStatus = "accepted";
        let reason: string | null = null;
        let resultingId: string | null = null;

        const dateFormatted = normalizeDate(rawDate);
        if (!dateFormatted) {
          status = "rejected";
          reason = `invalid date: ${rawDate}`;
        } else if (!/^\d{2}:\d{2}$/.test(rawStartTime) || !/^\d{2}:\d{2}$/.test(rawEndTime)) {
          status = "rejected";
          reason = `invalid or malformed time format: start='${rawStartTime}', end='${rawEndTime}'`;
        } else {
          const reqs = parseRequirementsString(rawReqs);
          if (!reqs) {
            status = "rejected";
            reason = `unrecognized requirement format: '${rawReqs}'`;
          } else if (reqs.doctors + reqs.nurses + reqs.receptionists <= 0) {
            status = "rejected";
            reason = "shift requires at least one staff member";
          } else {
            const startsAt = new Date(`${dateFormatted}T${rawStartTime}:00Z`);
            let endsAt = new Date(`${dateFormatted}T${rawEndTime}:00Z`);

            if (endsAt <= startsAt) {
              endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000); // Overnight shift
            }

            const newShift = await shiftsRepo.create(
              {
                starts_at: startsAt,
                ends_at: endsAt,
                doctors_required: reqs.doctors,
                nurses_required: reqs.nurses,
                receptionists_required: reqs.receptionists,
                created_by: importedBy ?? null,
              },
              client
            );
            status = "accepted";
            resultingId = newShift.id;
            acceptedCount++;
          }
        }

        if (status === "rejected") {
          rejectedCount++;
        }

        const importRow = await importsRepo.createRow(
          {
            batch_id: batch.id,
            row_number: rowNumber,
            raw_data: row,
            status,
            reason,
            resulting_id: resultingId,
          },
          client
        );
        createdRows.push(importRow);
      }

      return {
        batch,
        totalRows: rawRows.length,
        acceptedCount,
        rejectedCount,
        mergedCount,
        rows: createdRows,
      };
    });
  },
};
