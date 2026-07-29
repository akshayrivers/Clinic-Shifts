import bcrypt from "bcryptjs";
import { usersRepo, UserEntity } from "@/lib/db";
import { UserRole, Profession } from "@/types/next-auth";

export type DBUserRow = UserEntity;

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  profession: Profession;
  staffCode: number;
}

export class AuthenticationError extends Error {
  constructor(message: string, public readonly code: string = "INVALID_CREDENTIALS") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Isolated service function to verify credentials against the database using usersRepo.
 *
 * staff_code is the actual identity lookup (unique, one row). email is no longer unique
 * on its own — the CSV has genuine cases of two different staff_ids sharing an email
 * (e.g. a shared front-desk inbox) — so email is checked as a second factor against the
 * single row returned by staff_code, never used as the lookup key itself.
 */
export async function verifyUserCredentials(
  staffCodeInput: unknown,
  emailInput: unknown,
  passwordInput: unknown
): Promise<AuthUser> {
  if (
    (typeof staffCodeInput !== "string" && typeof staffCodeInput !== "number") ||
    typeof emailInput !== "string" ||
    typeof passwordInput !== "string"
  ) {
    throw new AuthenticationError("Staff code, email and password are required.", "INVALID_INPUT");
  }

  const staffCode = Number(staffCodeInput);
  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;

  if (!Number.isInteger(staffCode) || !email || !password) {
    throw new AuthenticationError("Staff code, email and password cannot be empty.", "INVALID_INPUT");
  }

  const user = await usersRepo.findByStaffCode(staffCode);

  if (!user) {
    throw new AuthenticationError("Invalid staff code, email or password.", "INVALID_CREDENTIALS");
  }

  // Second factor check — must match the SAME row staff_code resolved to.
  if (user.email.toLowerCase() !== email) {
    throw new AuthenticationError("Invalid staff code, email or password.", "INVALID_CREDENTIALS");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new AuthenticationError("Invalid staff code, email or password.", "INVALID_CREDENTIALS");
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    profession: user.profession,
    staffCode: user.staff_code,
  };
}

/**
 * Isolated service function to get user profile by ID using usersRepo.
 */
export async function getUserById(id: string): Promise<AuthUser | null> {
  if (!id) return null;

  const user = await usersRepo.findById(id);
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    profession: user.profession,
    staffCode: user.staff_code,
  };
}
