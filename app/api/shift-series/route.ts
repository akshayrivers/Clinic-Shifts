import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { ShiftValidationError } from "@/lib/services/shifts.service";
import { shiftSeriesService } from "@/lib/services/shift-series.service";

export async function GET() {
  try {
    await requireManager();
    const series = await shiftSeriesService.getSeries();
    return NextResponse.json({ series });
  } catch (error) {
    if ((error as Error).message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("GET /api/shift-series error:", error);
    return NextResponse.json({ error: "Failed to fetch shift series." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireManager();
    const body = await req.json();

    const result = await shiftSeriesService.createSeries({
      startDate: body.startDate,
      untilDate: body.untilDate,
      startTime: body.startTime,
      endTime: body.endTime,
      daysOfWeek: body.daysOfWeek,
      doctorsRequired: body.doctorsRequired,
      nursesRequired: body.nursesRequired,
      receptionistsRequired: body.receptionistsRequired,
      createdBy: user.id,
    });

    return NextResponse.json(
      { series: result.series, shifts: result.shifts, count: result.shifts.length },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ShiftValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if ((error as Error).message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("POST /api/shift-series error:", error);
    return NextResponse.json({ error: "Failed to create shift series." }, { status: 500 });
  }
}
