import { NextResponse } from "next/server";
import { getCurrentUser, requireManager } from "@/lib/auth";
import { shiftsService, ShiftValidationError, type UpdateShiftResult } from "@/lib/services/shifts.service";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await context.params;
    const shift = await shiftsService.getShiftById(id);

    if (!shift) {
      return NextResponse.json({ error: "Shift not found." }, { status: 404 });
    }

    return NextResponse.json({ shift });
  } catch (error) {
    console.error("GET /api/shifts/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch shift." }, { status: 500 });
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    const { id } = await context.params;
    const body = await req.json();

    const force = body.force === true;
    const result = await shiftsService.updateShift(id, {
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      doctorsRequired: body.doctorsRequired,
      nursesRequired: body.nursesRequired,
      receptionistsRequired: body.receptionistsRequired,
    }, force);

    if (result.violations && !result.shift) {
      return NextResponse.json(
        { violations: result.violations },
        { status: 409 },
      );
    }

    return NextResponse.json({
      shift: result.shift,
      removedClaims: result.removedClaims,
    });
  } catch (error) {
    if (error instanceof ShiftValidationError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if ((error as Error).message?.includes("UNAUTHORIZED") || (error as Error).message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("PUT /api/shifts/[id] error:", error);
    return NextResponse.json({ error: "Failed to update shift." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    const { id } = await context.params;

    await shiftsService.deleteShift(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ShiftValidationError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if ((error as Error).message?.includes("UNAUTHORIZED") || (error as Error).message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("DELETE /api/shifts/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete shift." }, { status: 500 });
  }
}
