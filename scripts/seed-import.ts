import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { usersRepo, pool } from "../lib/db";
import { importService } from "../lib/services/import.service";

async function seed() {
  console.log("🌱 Starting Clinic Shift Scheduler seeding & CSV import...");

  try {
    // 1. Ensure at least one Manager exists for administrative logins
    const managerEmail = "manager@clinic.com";
    const existingManager = await usersRepo.findByEmail(managerEmail);

    let managerId: string;
    if (!existingManager) {
      const passwordHash = await bcrypt.hash("manager123", 10);
      const manager = await usersRepo.create({
        email: managerEmail,
        password_hash: passwordHash,
        full_name: "Head Clinic Manager",
        role: "manager",
        profession: null,
      });
      managerId = manager.id;
      console.log(`✅ Created seed manager: ${managerEmail} (password: manager123)`);
    } else {
      managerId = existingManager.id;
      console.log(`ℹ️ Seed manager already exists: ${managerEmail}`);
    }

    // 2. Import staff.csv if present
    const staffPath = path.join(process.cwd(), "staff.csv");
    if (fs.existsSync(staffPath)) {
      const staffCSV = fs.readFileSync(staffPath, "utf-8");
      const result = await importService.importStaffCSV(staffCSV, "staff.csv", managerId);
      console.log(
        `✅ Imported staff.csv -> Total: ${result.totalRows}, Accepted: ${result.acceptedCount}, Merged: ${result.mergedCount}, Rejected: ${result.rejectedCount}`
      );
    }

    // 3. Import shifts.csv if present
    const shiftsPath = path.join(process.cwd(), "shifts.csv");
    if (fs.existsSync(shiftsPath)) {
      const shiftsCSV = fs.readFileSync(shiftsPath, "utf-8");
      const result = await importService.importShiftsCSV(shiftsCSV, "shifts.csv", managerId);
      console.log(
        `✅ Imported shifts.csv -> Total: ${result.totalRows}, Accepted: ${result.acceptedCount}, Rejected: ${result.rejectedCount}`
      );
    }

    console.log("🎉 Seeding & CSV import completed successfully.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    await pool.end();
  }
}

seed();
