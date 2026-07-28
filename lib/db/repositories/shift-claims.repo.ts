import { query, queryOne, QueryExecutor } from "../client";
import { ShiftClaimEntity, CreateShiftClaimInput, Profession } from "../types";

export const shiftClaimsRepo = {
  async findById(id: string, executor?: QueryExecutor): Promise<ShiftClaimEntity | null> {
    return queryOne<ShiftClaimEntity>(
      `SELECT id, shift_id, user_id, claimed_by, created_at 
       FROM shift_claims 
       WHERE id = $1`,
      [id],
      executor
    );
  },

  async findByShiftAndUser(
    shiftId: string,
    userId: string,
    executor?: QueryExecutor
  ): Promise<ShiftClaimEntity | null> {
    return queryOne<ShiftClaimEntity>(
      `SELECT id, shift_id, user_id, claimed_by, created_at 
       FROM shift_claims 
       WHERE shift_id = $1 AND user_id = $2`,
      [shiftId, userId],
      executor
    );
  },

  async findByShiftAndUserForUpdate(
    shiftId: string,
    userId: string,
    executor: QueryExecutor
  ): Promise<ShiftClaimEntity | null> {
    return queryOne<ShiftClaimEntity>(
      `SELECT id, shift_id, user_id, claimed_by, created_at 
       FROM shift_claims 
       WHERE shift_id = $1 AND user_id = $2 
       FOR UPDATE`,
      [shiftId, userId],
      executor
    );
  },

  async findByShiftId(shiftId: string, executor?: QueryExecutor): Promise<ShiftClaimEntity[]> {
    return query<ShiftClaimEntity>(
      `SELECT id, shift_id, user_id, claimed_by, created_at 
       FROM shift_claims 
       WHERE shift_id = $1 
       ORDER BY created_at ASC`,
      [shiftId],
      executor
    );
  },

  async findByUserId(userId: string, executor?: QueryExecutor): Promise<ShiftClaimEntity[]> {
    return query<ShiftClaimEntity>(
      `SELECT id, shift_id, user_id, claimed_by, created_at 
       FROM shift_claims 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId],
      executor
    );
  },

  async countByShiftAndProfession(
    shiftId: string,
    profession: Profession,
    executor?: QueryExecutor
  ): Promise<number> {
    if (!profession) return 0;
    const rows = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count 
       FROM shift_claims sc
       JOIN users u ON sc.user_id = u.id
       WHERE sc.shift_id = $1 AND u.profession = $2`,
      [shiftId, profession],
      executor
    );
    return parseInt(rows[0]?.count || "0", 10);
  },

  async create(data: CreateShiftClaimInput, executor?: QueryExecutor): Promise<ShiftClaimEntity> {
    const rows = await query<ShiftClaimEntity>(
      `INSERT INTO shift_claims (shift_id, user_id, claimed_by)
       VALUES ($1, $2, $3)
       RETURNING id, shift_id, user_id, claimed_by, created_at`,
      [data.shift_id, data.user_id, data.claimed_by],
      executor
    );
    return rows[0];
  },

  async delete(id: string, executor?: QueryExecutor): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM shift_claims WHERE id = $1 RETURNING id`,
      [id],
      executor
    );
    return rows.length > 0;
  },

  async deleteByShiftAndUser(shiftId: string, userId: string, executor?: QueryExecutor): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM shift_claims WHERE shift_id = $1 AND user_id = $2 RETURNING id`,
      [shiftId, userId],
      executor
    );
    return rows.length > 0;
  },
};
