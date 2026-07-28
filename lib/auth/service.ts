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
}

export class AuthenticationError extends Error {
  constructor(message: string, public readonly code: string = "INVALID_CREDENTIALS") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Isolated service function to verify credentials against the database using usersRepo.
 */
export async function verifyUserCredentials(
  emailInput: unknown,
  passwordInput: unknown
): Promise<AuthUser> {
  if (typeof emailInput !== "string" || typeof passwordInput !== "string") {
    throw new AuthenticationError("Email and password are required.", "INVALID_INPUT");
  }

  const email = emailInput.trim().toLowerCase();
  const password = passwordInput;

  if (!email || !password) {
    throw new AuthenticationError("Email and password cannot be empty.", "INVALID_INPUT");
  }

  const user = await usersRepo.findByEmail(email);

  if (!user) {
    throw new AuthenticationError("Invalid email or password.", "INVALID_CREDENTIALS");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new AuthenticationError("Invalid email or password.", "INVALID_CREDENTIALS");
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    profession: user.profession,
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
  };
}
