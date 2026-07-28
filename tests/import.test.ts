import assert from "node:assert";
import { test, describe, mock } from "node:test";
import { pool } from "../lib/db/client";
import {
  normalizeStaffRole,
  normalizeEmail,
  normalizeDate,
  parseRequirementsString,
  importService,
} from "../lib/services/import.service";

describe("CSV Importer & Normalization Tests", () => {
  test("normalizeStaffRole should correctly map role/profession variants", () => {
    assert.deepStrictEqual(normalizeStaffRole("Doctor"), { role: "staff", profession: "doctor" });
    assert.deepStrictEqual(normalizeStaffRole("MD"), { role: "staff", profession: "doctor" });
    assert.deepStrictEqual(normalizeStaffRole("Physician"), { role: "staff", profession: "doctor" });

    assert.deepStrictEqual(normalizeStaffRole("NURSE"), { role: "staff", profession: "nurse" });
    assert.deepStrictEqual(normalizeStaffRole("RN"), { role: "staff", profession: "nurse" });
    assert.deepStrictEqual(normalizeStaffRole("Registered Nurse"), { role: "staff", profession: "nurse" });

    assert.deepStrictEqual(normalizeStaffRole("receptionist"), { role: "staff", profession: "receptionist" });
    assert.deepStrictEqual(normalizeStaffRole("recep."), { role: "staff", profession: "receptionist" });
    assert.deepStrictEqual(normalizeStaffRole("Reception"), { role: "staff", profession: "receptionist" });

    assert.strictEqual(normalizeStaffRole("Janitor"), null);
  });

  test("normalizeEmail should handle (at) replacement and trimming", () => {
    assert.strictEqual(normalizeEmail("priya.weber(at)clinicmail.test"), "priya.weber@clinicmail.test");
    assert.strictEqual(normalizeEmail(" ben.ali@clinicmail.test "), "ben.ali@clinicmail.test");
    assert.strictEqual(normalizeEmail("invalid-email"), null);
    assert.strictEqual(normalizeEmail(""), null);
  });

  test("normalizeDate should parse multiple date formats and reject invalid dates", () => {
    assert.strictEqual(normalizeDate("2026-08-28"), "2026-08-28");
    assert.strictEqual(normalizeDate("05/08/2026"), "2026-08-05");
    assert.strictEqual(normalizeDate("08-23-2026"), "2026-08-23");

    // Invalid calendar date 2026-02-30
    assert.strictEqual(normalizeDate("2026-02-30"), null);
  });

  test("parseRequirementsString should parse key-value string or reject unparseable text", () => {
    assert.deepStrictEqual(parseRequirementsString("nurses=3;doctors=1;receptionists=1"), {
      doctors: 1,
      nurses: 3,
      receptionists: 1,
    });
    assert.deepStrictEqual(parseRequirementsString("nurses=2"), {
      doctors: 0,
      nurses: 2,
      receptionists: 0,
    });

    // Unparseable string
    assert.strictEqual(parseRequirementsString("two nurses and a doctor"), null);
  });

  test("importStaffCSV should generate batch summary and record accepted/rejected rows", async () => {
    const sampleCSV = `staff_id,full_name,role,email
121,Marcus Whitfield,Doctor,marcus.whitfield@clinicmail.test
997,Casey Morgan,Janitor,casey.morgan@clinicmail.test`;

    const mockBatch = { id: "b-1", source_filename: "staff.csv", imported_by: "m-1", imported_at: new Date() };
    const mockUser = { id: "u-1", email: "marcus.whitfield@clinicmail.test" };
    const mockRow = { id: "r-1", batch_id: "b-1" };

    mock.method(pool, "connect", async () => ({
      query: async (sql: string) => {
        if (sql.includes("INSERT INTO import_batches")) return { rows: [mockBatch], rowCount: 1 };
        if (sql.includes("FROM users")) return { rows: [], rowCount: 0 };
        if (sql.includes("INSERT INTO users")) return { rows: [mockUser], rowCount: 1 };
        if (sql.includes("INSERT INTO import_rows")) return { rows: [mockRow], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    }));

    const result = await importService.importStaffCSV(sampleCSV, "staff.csv", "m-1");
    assert.strictEqual(result.totalRows, 2);
    assert.strictEqual(result.acceptedCount, 1);
    assert.strictEqual(result.rejectedCount, 1); // Janitor rejected
    assert.strictEqual(result.rows.length, 2);
  });
});
