import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { usersRepo } from "@/lib/db";

// Manager-only: list every user, for the "assign staff" picker and any future
// staff-management screens. Never returns password_hash.
export async function GET() {
    try {
        await requireManager();

        const users = await usersRepo.findAll();
        const safeUsers = users.map((u) => ({
            id: u.id,
            staff_code: u.staff_code,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
            profession: u.profession,
        }));

        return NextResponse.json({ users: safeUsers });
    } catch (error) {
        if ((error as Error).message?.includes("UNAUTHORIZED") || (error as Error).message?.includes("UNAUTHENTICATED")) {
            return NextResponse.json({ error: (error as Error).message }, { status: 403 });
        }
        console.error("GET /api/users error:", error);
        return NextResponse.json({ error: "Failed to fetch users." }, { status: 500 });
    }
}
