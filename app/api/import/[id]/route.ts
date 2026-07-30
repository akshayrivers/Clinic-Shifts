import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { importsRepo } from "@/lib/db";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireManager();
    const { id } = await context.params;

    const batch = await importsRepo.findBatchById(id);
    if (!batch) {
      return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
    }

    const rows = await importsRepo.findRowsByBatchId(id);

    const acceptedCount = rows.filter((r) => r.status === "accepted").length;
    const rejectedCount = rows.filter((r) => r.status === "rejected").length;
    const mergedCount = rows.filter((r) => r.status === "merged").length;

    return NextResponse.json({
      batch,
      rows,
      totalRows: rows.length,
      acceptedCount,
      rejectedCount,
      mergedCount,
    });
  } catch (error) {
    if ((error as Error).message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("GET /api/import/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch import batch." }, { status: 500 });
  }
}
