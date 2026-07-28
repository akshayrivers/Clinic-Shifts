import assert from "node:assert";
import { test, describe, mock } from "node:test";
import { pool } from "../lib/db/client";
import { calculateShiftTimestamps, shiftsService, ShiftValidationError } from "../lib/services/shifts.service";

describe("Shift CRUD & Validation Tests", () => {
  test("calculateShiftTimestamps should handle regular daytime shift", () => {
    const { startsAt, endsAt } = calculateShiftTimestamps("2026-08-15", "08:00", "16:00");
    assert.strictEqual(startsAt.toISOString(), "2026-08-15T08:00:00.000Z");
    assert.strictEqual(endsAt.toISOString(), "2026-08-15T16:00:00.000Z");
  });

  test("calculateShiftTimestamps should handle overnight shift (22:00 -> 06:00)", () => {
    const { startsAt, endsAt } = calculateShiftTimestamps("2026-08-15", "22:00", "06:00");
    assert.strictEqual(startsAt.toISOString(), "2026-08-15T22:00:00.000Z");
    assert.strictEqual(endsAt.toISOString(), "2026-08-16T06:00:00.000Z"); // Next day
  });

  test("calculateShiftTimestamps should throw error on invalid date string", () => {
    assert.throws(
      () => calculateShiftTimestamps("2026-13-45", "08:00", "16:00"),
      (err: unknown) => err instanceof ShiftValidationError
    );
  });

  test("createShift should reject shifts requiring zero total staff", async () => {
    await assert.rejects(
      async () =>
        shiftsService.createShift({
          date: "2026-08-15",
          startTime: "08:00",
          endTime: "16:00",
          doctorsRequired: 0,
          nursesRequired: 0,
          receptionistsRequired: 0,
        }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftValidationError);
        assert.strictEqual(err.message, "Shift requires at least one staff member (doctor, nurse, or receptionist).");
        return true;
      }
    );
  });

  test("createShift should successfully insert valid shift via DB", async () => {
    const mockShift = {
      id: "shift-123",
      starts_at: new Date("2026-08-15T08:00:00Z"),
      ends_at: new Date("2026-08-15T16:00:00Z"),
      doctors_required: 1,
      nurses_required: 2,
      receptionists_required: 1,
      series_id: null,
      created_by: "manager-1",
      created_at: new Date(),
      updated_at: new Date(),
    };

    mock.method(pool, "query", async () => ({ rows: [mockShift], rowCount: 1 }));

    const created = await shiftsService.createShift({
      date: "2026-08-15",
      startTime: "08:00",
      endTime: "16:00",
      doctorsRequired: 1,
      nursesRequired: 2,
      receptionistsRequired: 1,
      createdBy: "manager-1",
    });

    assert.strictEqual(created.id, "shift-123");
    assert.strictEqual(created.nurses_required, 2);
  });
});
