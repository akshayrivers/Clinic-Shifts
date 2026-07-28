import assert from "node:assert";
import { test, describe, mock } from "node:test";
import bcrypt from "bcryptjs";
import { pool } from "../lib/db";
import { verifyUserCredentials, AuthenticationError, getUserById, DBUserRow } from "../lib/auth/service";

describe("Authentication Service Tests", () => {
  test("should throw error if email or password input is invalid", async () => {
    await assert.rejects(
      async () => verifyUserCredentials("", "password"),
      (err: unknown) => {
        assert.ok(err instanceof AuthenticationError);
        assert.strictEqual((err as AuthenticationError).code, "INVALID_INPUT");
        return true;
      }
    );
  });

  test("should throw error if user is not found in database", async () => {
    mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));

    await assert.rejects(
      async () => verifyUserCredentials("nonexistent@clinic.com", "password123"),
      (err: unknown) => {
        assert.ok(err instanceof AuthenticationError);
        assert.strictEqual(err.message, "Invalid email or password.");
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
    };

    mock.method(pool, "query", async () => ({ rows: [mockUserRow], rowCount: 1 }));

    await assert.rejects(
      async () => verifyUserCredentials("doctor@clinic.com", "wrong_password"),
      (err: unknown) => {
        assert.ok(err instanceof AuthenticationError);
        assert.strictEqual(err.message, "Invalid email or password.");
        return true;
      }
    );
  });

  test("should authenticate successfully with correct credentials", async () => {
    const password = "correct_password";
    const validHash = await bcrypt.hash(password, 10);
    const mockUserRow: DBUserRow = {
      id: "22222222-2222-2222-2222-222222222222",
      email: "manager@clinic.com",
      password_hash: validHash,
      full_name: "Jane Manager",
      role: "manager",
      profession: null,
    };

    mock.method(pool, "query", async () => ({ rows: [mockUserRow], rowCount: 1 }));

    const result = await verifyUserCredentials("MANAGER@CLINIC.COM", password);
    assert.strictEqual(result.id, mockUserRow.id);
    assert.strictEqual(result.email, mockUserRow.email);
    assert.strictEqual(result.fullName, mockUserRow.full_name);
    assert.strictEqual(result.role, "manager");
    assert.strictEqual(result.profession, null);
  });

  test("should fetch user by ID correctly", async () => {
    const mockUserRow: DBUserRow = {
      id: "33333333-3333-3333-3333-333333333333",
      email: "nurse@clinic.com",
      password_hash: "hash",
      full_name: "Nurse Joy",
      role: "staff",
      profession: "nurse",
    };

    mock.method(pool, "query", async () => ({ rows: [mockUserRow], rowCount: 1 }));

    const result = await getUserById("33333333-3333-3333-3333-333333333333");
    assert.ok(result);
    assert.strictEqual(result?.fullName, "Nurse Joy");
    assert.strictEqual(result?.role, "staff");
    assert.strictEqual(result?.profession, "nurse");
  });
});
