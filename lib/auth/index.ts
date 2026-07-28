import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import { UserRole } from "@/types/next-auth";

/**
 * Get the currently authenticated session user on the server side.
 */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/**
 * Require an authenticated user. Throws an error if unauthenticated.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED: Authentication required.");
  }
  return user;
}

/**
 * Require a user with a specific role. Throws an error if missing role.
 */
export async function requireRole(allowedRole: UserRole) {
  const user = await requireAuth();
  if (user.role !== allowedRole) {
    throw new Error(`UNAUTHORIZED: Requires ${allowedRole} role.`);
  }
  return user;
}

/**
 * Require Manager role.
 */
export async function requireManager() {
  return requireRole("manager");
}

/**
 * Require Staff role.
 */
export async function requireStaff() {
  return requireRole("staff");
}
