import { DefaultSession } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

export type UserRole = "manager" | "staff";
export type Profession = "doctor" | "nurse" | "receptionist" | null;

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    profession: Profession;
    staffCode: number;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      fullName: string;
      role: UserRole;
      profession: Profession;
      staffCode: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    profession: Profession;
    staffCode: number;
  }
}
