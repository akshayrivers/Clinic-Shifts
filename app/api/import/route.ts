import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { importService } from "@/lib/services/import.service";

export async function POST(req: Request) {
  try {
    const manager = await requireManager();
    const contentType = req.headers.get("content-type") || "";

    let fileContent = "";
    let filename = "upload.csv";
    let type: "staff" | "shifts" = "staff";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const importType = formData.get("type") as string | null;

      if (!file) {
        return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
      }

      fileContent = await file.text();
      filename = file.name;

      if (importType === "shifts" || filename.toLowerCase().includes("shift")) {
        type = "shifts";
      } else {
        type = "staff";
      }
    } else {
      const body = await req.json();
      fileContent = body.content || "";
      filename = body.filename || "upload.csv";
      type = body.type || (filename.toLowerCase().includes("shift") ? "shifts" : "staff");
    }

    if (!fileContent.trim()) {
      return NextResponse.json({ error: "Uploaded CSV content is empty." }, { status: 400 });
    }

    let summary;
    if (type === "shifts") {
      summary = await importService.importShiftsCSV(fileContent, filename, manager.id);
    } else {
      summary = await importService.importStaffCSV(fileContent, filename, manager.id);
    }

    return NextResponse.json({ summary });
  } catch (error) {
    if ((error as Error).message?.includes("UNAUTHORIZED") || (error as Error).message?.includes("UNAUTHENTICATED")) {
      return NextResponse.json({ error: (error as Error).message }, { status: 403 });
    }
    console.error("POST /api/import error:", error);
    return NextResponse.json({ error: "Failed to process CSV import." }, { status: 500 });
  }
}
