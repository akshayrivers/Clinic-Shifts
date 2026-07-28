import {
  withTransaction,
  shiftsRepo,
  usersRepo,
  shiftClaimsRepo,
  ShiftClaimEntity,
  Profession,
} from "@/lib/db";

export class ShiftClaimError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ShiftClaimError";
  }
}

export interface ClaimShiftInput {
  shiftId: string;
  userId: string; // The staff member being assigned or self-claiming
  claimedBy: string; // The user initiating the action (staff self or manager)
}

export interface UnclaimShiftInput {
  shiftId: string;
  userId: string;
  requestedBy: string; // Staff member self or manager
}

export const shiftClaimService = {
  /**
   * Internal service function for both staff self-claiming and manager assignment.
   * Uses a PostgreSQL transaction with FOR UPDATE locks to prevent race conditions.
   */
  async claimShift(input: ClaimShiftInput): Promise<ShiftClaimEntity> {
    const { shiftId, userId, claimedBy } = input;

    if (!shiftId || !userId || !claimedBy) {
      throw new ShiftClaimError("Shift ID, User ID, and ClaimedBy ID are required.", "INVALID_INPUT");
    }

    return withTransaction(async (client) => {
      // 1. Lock target shift with FOR UPDATE to prevent concurrent claims race condition
      const shift = await shiftsRepo.findByIdForUpdate(shiftId, client);
      if (!shift) {
        throw new ShiftClaimError("Shift not found.", "SHIFT_NOT_FOUND");
      }

      // 2. Validate target user
      const user = await usersRepo.findById(userId, client);
      if (!user) {
        throw new ShiftClaimError("User not found.", "USER_NOT_FOUND");
      }

      if (user.role !== "staff") {
        throw new ShiftClaimError("Only staff members can claim or be assigned to shifts.", "NOT_STAFF");
      }

      if (!user.profession) {
        throw new ShiftClaimError("Staff member must have a defined profession.", "INVALID_PROFESSION");
      }

      const profession: Profession = user.profession;

      // 3. Check duplicate claim
      const existingClaim = await shiftClaimsRepo.findByShiftAndUserForUpdate(shiftId, userId, client);
      if (existingClaim) {
        throw new ShiftClaimError("User has already claimed this shift.", "DUPLICATE_CLAIM");
      }

      // 4. Capacity check for user's profession
      let requiredCount = 0;
      if (profession === "doctor") requiredCount = shift.doctors_required;
      else if (profession === "nurse") requiredCount = shift.nurses_required;
      else if (profession === "receptionist") requiredCount = shift.receptionists_required;

      if (requiredCount <= 0) {
        throw new ShiftClaimError(`This shift does not require any ${profession}s.`, "CAPACITY_REACHED");
      }

      const currentCount = await shiftClaimsRepo.countByShiftAndProfession(shiftId, profession, client);

      if (currentCount >= requiredCount) {
        throw new ShiftClaimError(
          `Capacity reached: No more ${profession} spots available for this shift.`,
          "CAPACITY_REACHED"
        );
      }

      // 5. Overlapping shift check for target user
      const overlapping = await shiftsRepo.findOverlappingForUser(userId, shift.starts_at, shift.ends_at, client);

      if (overlapping.length > 0) {
        throw new ShiftClaimError(
          "User is already scheduled for an overlapping shift during this time period.",
          "OVERLAPPING_SHIFT"
        );
      }

      // 6. Create claim inside transaction
      return shiftClaimsRepo.create(
        {
          shift_id: shiftId,
          user_id: userId,
          claimed_by: claimedBy,
        },
        client
      );
    });
  },

  /**
   * Internal service function for unclaiming or removing staff assignment.
   */
  async unclaimShift(input: UnclaimShiftInput): Promise<boolean> {
    const { shiftId, userId, requestedBy } = input;

    if (!shiftId || !userId || !requestedBy) {
      throw new ShiftClaimError("Shift ID, User ID, and RequestedBy ID are required.", "INVALID_INPUT");
    }

    return withTransaction(async (client) => {
      const requester = await usersRepo.findById(requestedBy, client);
      if (!requester) {
        throw new ShiftClaimError("Requester not found.", "USER_NOT_FOUND");
      }

      // Staff can only unclaim for themselves; Managers can unclaim anyone
      if (requester.role !== "manager" && requestedBy !== userId) {
        throw new ShiftClaimError("You can only unclaim shifts for yourself.", "UNAUTHORIZED");
      }

      const existing = await shiftClaimsRepo.findByShiftAndUser(shiftId, userId, client);
      if (!existing) {
        throw new ShiftClaimError("Claim not found for this shift and user.", "CLAIM_NOT_FOUND");
      }

      return shiftClaimsRepo.deleteByShiftAndUser(shiftId, userId, client);
    });
  },
};
