import assert from "node:assert";
import { test, describe, mock } from "node:test";
import bcrypt from "bcryptjs";
import { pool } from "../lib/db";
import { verifyUserCredentials, AuthenticationError, getUserById, DBUserRow } from "../lib/auth/service";

describe("Authentication Service Tests", () => {
  test("should throw error if staff code, email, or password input is invalid", async () => {
    await assert.rejects(
      async () => verifyUserCredentials("", "someone@clinic.com", "password"),
      (err: unknown) => {
        assert.ok(err instanceof AuthenticationError);
        assert.strictEqual((err as AuthenticationError).code, "INVALID_INPUT");
        return true;
      }
    );
  });

  test("should throw error if no user matches the staff code", async () => {
    mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));

    await assert.rejects(
      async () => verifyUserCredentials(999999, "nonexistent@clinic.com", "password123"),
      (err: unknown) => {
        assert.ok(err instanceof AuthenticationError);
        assert.strictEqual(err.message, "Invalid staff code, email or password.");
        return true;
      }
    );
  });

  test("should throw error if email does not match the staff code's record", async () => {
    const validHash = await bcrypt.hash("correct_password", 10);
    const mockUserRow: DBUserRow = {
      id: "11111111-1111-1111-1111-111111111111",
      email: "doctor@clinic.com",
      password_hash: validHash,
      full_name: "Dr. John Doe",
      role: "staff",
      profession: "doctor",
      staff_code: 121,
      created_at: new Date(),
    };

    mock.method(pool, "query", async () => ({ rows: [mockUserRow], rowCount: 1 }));

    // Right staff_code, wrong email — must still fail, since email is a required
    // second factor checked against the row staff_code resolved to.
    await assert.rejects(
      async () => verifyUserCredentials(121, "someone-else@clinic.com", "correct_password"),
      (err: unknown) => {
        assert.ok(err instanceof AuthenticationError);
        assert.strictEqual(err.message, "Invalid staff code, email or password.");
        return true;
      }
    );
  });

  test("should throw error if password does not match hash", async () => {
    const wrongHash = await bcrypt.hash("different_password", 10);
    const mockUserRow: DBUserRow = {
      id: "11111111-1111-1111-1111-111111111111",
      email: "doctor@clinic.com",
      password_hash: wrongHash,
      full_name: "Dr. John Doe",
      role: "staff",
      profession: "doctor",
      staff_code: 121,
      created_at: new Date(),
    };

    mock.method(pool, "query", async () => ({ rows: [mockUserRow], rowCount: 1 }));

    await assert.rejects(
      async () => verifyUserCredentials(121, "doctor@clinic.com", "wrong_password"),
      (err: unknown) => {
        assert.ok(err instanceof AuthenticationError);
        assert.strictEqual(err.message, "Invalid staff code, email or password.");
        return true;
      }
    );
  });

  test("should authenticate successfully with correct staff code, email and password", async () => {
    const password = "correct_password";
    const validHash = await bcrypt.hash(password, 10);
    const mockUserRow: DBUserRow = {
      id: "22222222-2222-2222-2222-222222222222",
      email: "manager@clinic.com",
      password_hash: validHash,
      full_name: "Jane Manager",
      role: "manager",
      profession: null,
      staff_code: 9000,
      created_at: new Date(),
    };

    mock.method(pool, "query", async () => ({ rows: [mockUserRow], rowCount: 1 }));

    const result = await verifyUserCredentials(9000, "MANAGER@CLINIC.COM", password);
    assert.strictEqual(result.id, mockUserRow.id);
    assert.strictEqual(result.email, mockUserRow.email);
    assert.strictEqual(result.fullName, mockUserRow.full_name);
    assert.strictEqual(result.role, "manager");
    assert.strictEqual(result.profession, null);
    assert.strictEqual(result.staffCode, 9000);
  });

  test("should fetch user by ID correctly", async () => {
    const mockUserRow: DBUserRow = {
      id: "33333333-3333-3333-3333-333333333333",
      email: "nurse@clinic.com",
      password_hash: "hash",
      full_name: "Nurse Joy",
      role: "staff",
      profession: "nurse",
      staff_code: 131,
      created_at: new Date(),
    };

    mock.method(pool, "query", async () => ({ rows: [mockUserRow], rowCount: 1 }));

    const result = await getUserById("33333333-3333-3333-3333-333333333333");
    assert.ok(result);
    assert.strictEqual(result?.fullName, "Nurse Joy");
    assert.strictEqual(result?.role, "staff");
    assert.strictEqual(result?.profession, "nurse");
    assert.strictEqual(result?.staffCode, 131);
  });
});
