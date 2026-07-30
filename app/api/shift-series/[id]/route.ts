import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { ShiftValidationError } from "@/lib/services/shifts.service";
import { shiftSeriesService } from "@/lib/services/shift-series.service";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    const { id } = await context.params;
    const series = await shiftSeriesService.getSeriesById(id);

    if (!series) {
      return NextResponse.json({ error: "Shift series not found." }, { status: 404 });
    }

    return NextResponse.json({ series });
  } catch (error) {
    if ((error as Error).message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("GET /api/shift-series/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch shift series." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    const { id } = await context.params;

    await shiftSeriesService.deleteSeries(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ShiftValidationError) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if ((error as Error).message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("DELETE /api/shift-series/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete shift series." }, { status: 500 });
  }
}
