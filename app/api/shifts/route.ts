import { NextResponse } from "next/server";
import { getCurrentUser, requireManager } from "@/lib/auth";
import { shiftsService, ShiftValidationError } from "@/lib/services/shifts.service";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const shifts = await shiftsService.getShifts();
    return NextResponse.json({ shifts });
  } catch (error) {
    console.error("GET /api/shifts error:", error);
    return NextResponse.json({ error: "Failed to fetch shifts." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const body = await req.json();

    const shift = await shiftsService.createShift({
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      doctorsRequired: body.doctorsRequired,
      nursesRequired: body.nursesRequired,
      receptionistsRequired: body.receptionistsRequired,
      createdBy: user.id,
    });

    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    if (error instanceof ShiftValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if ((error as Error).message?.includes("UNAUTHORIZED") || (error as Error).message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("POST /api/shifts error:", error);
    return NextResponse.json({ error: "Failed to create shift." }, { status: 500 });
  }
}
