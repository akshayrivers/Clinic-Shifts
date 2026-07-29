import assert from "node:assert";
import { test, describe, mock } from "node:test";
import { pool, query, queryOne, DatabaseError, withTransaction } from "../lib/db/client";
import { usersRepo } from "../lib/db/repositories/users.repo";
import { shiftsRepo } from "../lib/db/repositories/shifts.repo";
import { shiftClaimsRepo } from "../lib/db/repositories/shift-claims.repo";
import { importsRepo } from "../lib/db/repositories/imports.repo";

describe("Database Access Layer (DAL) Tests", () => {
  test("query helper should execute and return typed rows", async () => {
    const mockRows = [{ id: "1", name: "Test Item" }];
    mock.method(pool, "query", async () => ({ rows: mockRows, rowCount: 1 }));

    const result = await query<{ id: string; name: string }>("SELECT * FROM test");
    assert.deepStrictEqual(result, mockRows);
  });

  test("queryOne helper should return single row or null", async () => {
    mock.method(pool, "query", async () => ({ rows: [{ id: "123" }], rowCount: 1 }));
    const result = await queryOne<{ id: string }>("SELECT * FROM test WHERE id = $1", ["123"]);
    assert.strictEqual(result?.id, "123");

    mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));
    const nullResult = await queryOne<{ id: string }>("SELECT * FROM test WHERE id = $1", ["999"]);
    assert.strictEqual(nullResult, null);
  });

  test("DatabaseError should wrap postgres errors with code and detail", async () => {
    mock.method(pool, "query", async () => {
      const err = new Error("duplicate key value violates unique constraint") as Error & { code?: string; detail?: string };
      err.code = "23505";
      err.detail = "Key (email)=(test@clinic.com) already exists.";
      throw err;
    });

    await assert.rejects(
      async () => query("INSERT INTO users VALUES (1)"),
      (err: unknown) => {
        assert.ok(err instanceof DatabaseError);
        assert.strictEqual(err.code, "23505");
        assert.strictEqual(err.detail, "Key (email)=(test@clinic.com) already exists.");
        return true;
      }
    );
  });

  test("usersRepo.findByStaffCode should query user by the unique staff_code", async () => {
    const mockUser = {
      id: "u-1",
      email: "staff@clinic.com",
      password_hash: "hash",
      full_name: "Staff Member",
      role: "staff" as const,
      profession: "nurse" as const,
      staff_code: 131,
      created_at: new Date(),
    };

    mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
      assert.ok(sql.includes("WHERE staff_code = $1"));
      assert.strictEqual(params?.[0], 131);
      return { rows: [mockUser], rowCount: 1 };
    });

    const user = await usersRepo.findByStaffCode(131);
    assert.strictEqual(user?.id, "u-1");
    assert.strictEqual(user?.profession, "nurse");
  });

  test("usersRepo.findAllByEmail should NOT assume uniqueness — can return multiple rows", async () => {
    // Two different staff_ids sharing an email is a real case in the source CSV
    // (e.g. staff_id 107 and 998 both use hiro.iyer@clinicmail.test), so this lookup
    // must be able to return more than one row without erroring.
    const mockUsers = [
      { id: "u-1", email: "shared@clinic.com", password_hash: "hash", full_name: "Person A", role: "staff" as const, profession: "receptionist" as const, staff_code: 107, created_at: new Date() },
      { id: "u-2", email: "shared@clinic.com", password_hash: "hash", full_name: "Person B", role: "staff" as const, profession: "nurse" as const, staff_code: 998, created_at: new Date() },
    ];

    mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
      assert.ok(sql.includes("LOWER(email) = LOWER($1)"));
      assert.strictEqual(params?.[0], "SHARED@CLINIC.COM");
      return { rows: mockUsers, rowCount: 2 };
    });

    const users = await usersRepo.findAllByEmail("SHARED@CLINIC.COM");
    assert.strictEqual(users.length, 2);
  });

  test("shiftsRepo.findOverlappingForUser should query overlapping shifts using interval intersection", async () => {
    const mockShift = {
      id: "s-1",
      starts_at: new Date("2026-08-01T08:00:00Z"),
      ends_at: new Date("2026-08-01T16:00:00Z"),
      doctors_required: 1,
      nurses_required: 2,
      receptionists_required: 0,
      series_id: null,
      created_by: "m-1",
      created_at: new Date(),
      updated_at: new Date(),
    };

    mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
      assert.ok(sql.includes("s.starts_at < $3 AND s.ends_at > $2"));
      assert.strictEqual(params?.[0], "user-123");
      return { rows: [mockShift], rowCount: 1 };
    });

    const result = await shiftsRepo.findOverlappingForUser(
      "user-123",
      new Date("2026-08-01T12:00:00Z"),
      new Date("2026-08-01T20:00:00Z")
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "s-1");
  });

  test("shiftClaimsRepo.countByShiftAndProfession should count claimed spots by profession", async () => {
    mock.method(pool, "query", async (sql: string, params?: unknown[]) => {
      assert.ok(sql.includes("u.profession = $2"));
      assert.strictEqual(params?.[0], "shift-1");
      assert.strictEqual(params?.[1], "doctor");
      return { rows: [{ count: "3" }], rowCount: 1 };
    });

    const count = await shiftClaimsRepo.countByShiftAndProfession("shift-1", "doctor");
    assert.strictEqual(count, 3);
  });

  test("importsRepo should create import batch and rows", async () => {
    const mockBatch = {
      id: "batch-1",
      source_filename: "staff.csv",
      imported_by: "manager-1",
      imported_at: new Date(),
    };

    mock.method(pool, "query", async () => ({ rows: [mockBatch], rowCount: 1 }));

    const batch = await importsRepo.createBatch({
      source_filename: "staff.csv",
      imported_by: "manager-1",
    });
    assert.strictEqual(batch.id, "batch-1");
    assert.strictEqual(batch.source_filename, "staff.csv");
  });
});
