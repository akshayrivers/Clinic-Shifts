import assert from "node:assert";
import { test, describe, mock } from "node:test";
import { pool } from "../lib/db/client";
import { shiftClaimService, ShiftClaimError } from "../lib/services/shift-claim.service";

describe("Shift Claim System Tests", () => {
  test("claimShift should throw error if shift is not found", async () => {
    mock.method(pool, "connect", async () => ({
      query: async (sql: string) => {
        if (sql.includes("FOR UPDATE")) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    }));

    await assert.rejects(
      async () =>
        shiftClaimService.claimShift({
          shiftId: "nonexistent-shift",
          userId: "user-1",
          claimedBy: "user-1",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftClaimError);
        assert.strictEqual((err as ShiftClaimError).code, "SHIFT_NOT_FOUND");
        return true;
      }
    );
  });

  test("claimShift should reject duplicate claims for the same shift and user", async () => {
    const mockShift = {
      id: "s-1",
      starts_at: new Date("2026-08-15T08:00:00Z"),
      ends_at: new Date("2026-08-15T16:00:00Z"),
      doctors_required: 0,
      nurses_required: 2,
      receptionists_required: 0,
    };
    const mockUser = {
      id: "u-1",
      role: "staff",
      profession: "nurse",
    };
    const mockClaim = { id: "c-1", shift_id: "s-1", user_id: "u-1" };

    mock.method(pool, "connect", async () => ({
      query: async (sql: string) => {
        if (sql.includes("FROM shifts")) return { rows: [mockShift], rowCount: 1 };
        if (sql.includes("FROM users")) return { rows: [mockUser], rowCount: 1 };
        if (sql.includes("FROM shift_claims")) return { rows: [mockClaim], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    }));

    await assert.rejects(
      async () =>
        shiftClaimService.claimShift({
          shiftId: "s-1",
          userId: "u-1",
          claimedBy: "u-1",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftClaimError);
        assert.strictEqual((err as ShiftClaimError).code, "DUPLICATE_CLAIM");
        return true;
      }
    );
  });

  test("claimShift should reject claims when capacity for profession is reached", async () => {
    const mockShift = {
      id: "s-2",
      starts_at: new Date("2026-08-15T08:00:00Z"),
      ends_at: new Date("2026-08-15T16:00:00Z"),
      doctors_required: 1, // Only 1 doctor required
      nurses_required: 2,
      receptionists_required: 0,
    };
    const mockUser = {
      id: "u-doc-2",
      role: "staff",
      profession: "doctor",
    };

    mock.method(pool, "connect", async () => ({
      query: async (sql: string) => {
        if (sql.includes("FROM shifts")) return { rows: [mockShift], rowCount: 1 };
        if (sql.includes("FROM users")) return { rows: [mockUser], rowCount: 1 };
        if (sql.includes("FROM shift_claims WHERE shift_id = $1 AND user_id = $2")) return { rows: [], rowCount: 0 };
        if (sql.includes("COUNT(*)")) return { rows: [{ count: "1" }], rowCount: 1 }; // Already 1 doctor claimed!
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    }));

    await assert.rejects(
      async () =>
        shiftClaimService.claimShift({
          shiftId: "s-2",
          userId: "u-doc-2",
          claimedBy: "u-doc-2",
        }),
      (err: unknown) => {
        assert.ok(err instanceof ShiftClaimError);
        assert.strictEqual((err as ShiftClaimError).code, "CAPACITY_REACHED");
        return true;
      }
    );
  });
});
