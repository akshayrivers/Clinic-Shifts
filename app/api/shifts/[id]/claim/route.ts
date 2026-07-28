import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { shiftClaimService, ShiftClaimError } from "@/lib/services/shift-claim.service";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id: shiftId } = await context.params;
    const body = await req.json().catch(() => ({}));

    // If manager specifies a target userId, assign that staff member. Otherwise, staff self-claims.
    const targetUserId = user.role === "manager" && body.userId ? body.userId : user.id;

    const claim = await shiftClaimService.claimShift({
      shiftId,
      userId: targetUserId,
      claimedBy: user.id,
    });

    return NextResponse.json({ claim }, { status: 201 });
  } catch (error) {
    if (error instanceof ShiftClaimError) {
      let status = 400;
      if (error.code === "SHIFT_NOT_FOUND" || error.code === "USER_NOT_FOUND") status = 404;
      else if (error.code === "DUPLICATE_CLAIM" || error.code === "CAPACITY_REACHED" || error.code === "OVERLAPPING_SHIFT") status = 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("POST /api/shifts/[id]/claim error:", error);
    return NextResponse.json({ error: "Failed to claim shift." }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id: shiftId } = await context.params;
    const { searchParams } = new URL(req.url);

    // Target user to unclaim: manager can unclaim query param target, staff unclaims self
    const targetUserId = user.role === "manager" && searchParams.get("userId") ? searchParams.get("userId")! : user.id;

    await shiftClaimService.unclaimShift({
      shiftId,
      userId: targetUserId,
      requestedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ShiftClaimError) {
      let status = 400;
      if (error.code === "CLAIM_NOT_FOUND") status = 404;
      else if (error.code === "UNAUTHORIZED") status = 403;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    console.error("DELETE /api/shifts/[id]/claim error:", error);
    return NextResponse.json({ error: "Failed to unclaim shift." }, { status: 500 });
  }
}
