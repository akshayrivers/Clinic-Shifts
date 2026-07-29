import { query, queryOne, QueryExecutor } from "../client";
import { ShiftEntity, CreateShiftInput } from "../types";

export const shiftsRepo = {
  async findById(id: string, executor?: QueryExecutor): Promise<ShiftEntity | null> {
    return queryOne<ShiftEntity>(
      `SELECT id, external_id,starts_at, ends_at, doctors_required, nurses_required, receptionists_required, series_id, created_by, created_at, updated_at 
       FROM shifts 
       WHERE id = $1`,
      [id],
      executor
    );
  },

  async findByIdForUpdate(id: string, executor: QueryExecutor): Promise<ShiftEntity | null> {
    return queryOne<ShiftEntity>(
      `SELECT id, external_id,starts_at, ends_at, doctors_required, nurses_required, receptionists_required, series_id, created_by, created_at, updated_at 
       FROM shifts 
       WHERE id = $1 
       FOR UPDATE`,
      [id],
      executor
    );
  },

  async findByRange(startsAt: Date, endsAt: Date, executor?: QueryExecutor): Promise<ShiftEntity[]> {
    return query<ShiftEntity>(
      `SELECT id,external_id, starts_at, ends_at, doctors_required, nurses_required, receptionists_required, series_id, created_by, created_at, updated_at 
       FROM shifts 
       WHERE starts_at >= $1 AND ends_at <= $2 
       ORDER BY starts_at ASC`,
      [startsAt, endsAt],
      executor
    );
  },

  async findOverlappingForUser(
    userId: string,
    startsAt: Date | string,
    endsAt: Date | string,
    executor?: QueryExecutor
  ): Promise<ShiftEntity[]> {
    return query<ShiftEntity>(
      `SELECT s.id,s.external_id, s.starts_at, s.ends_at, s.doctors_required, s.nurses_required, s.receptionists_required, s.series_id, s.created_by, s.created_at, s.updated_at
       FROM shift_claims sc
       JOIN shifts s ON sc.shift_id = s.id
       WHERE sc.user_id = $1
         AND (s.starts_at < $3 AND s.ends_at > $2)`,
      [userId, startsAt, endsAt],
      executor
    );
  },

  async create(data: CreateShiftInput, executor?: QueryExecutor): Promise<ShiftEntity> {
    const rows = await query<ShiftEntity>(
      `INSERT INTO shifts (starts_at, ends_at, doctors_required, nurses_required, receptionists_required, series_id, created_by,external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7,$8)
       RETURNING id, starts_at, ends_at, doctors_required, nurses_required, receptionists_required, series_id, created_by, created_at, updated_at,external_id`,
      [
        data.starts_at,
        data.ends_at,
        data.doctors_required ?? 0,
        data.nurses_required ?? 0,
        data.receptionists_required ?? 0,
        data.series_id ?? null,
        data.created_by ?? null,
        data.external_id,
      ],
      executor
    );
    return rows[0];
  },

  async update(
    id: string,
    data: Partial<CreateShiftInput>,
    executor?: QueryExecutor
  ): Promise<ShiftEntity | null> {
    const fields: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let idx = 1;

    if (data.starts_at !== undefined) {
      fields.push(`starts_at = $${idx++}`);
      values.push(data.starts_at);
    }
    if (data.ends_at !== undefined) {
      fields.push(`ends_at = $${idx++}`);
      values.push(data.ends_at);
    }
    if (data.doctors_required !== undefined) {
      fields.push(`doctors_required = $${idx++}`);
      values.push(data.doctors_required);
    }
    if (data.nurses_required !== undefined) {
      fields.push(`nurses_required = $${idx++}`);
      values.push(data.nurses_required);
    }
    if (data.receptionists_required !== undefined) {
      fields.push(`receptionists_required = $${idx++}`);
      values.push(data.receptionists_required);
    }
    if (data.series_id !== undefined) {
      fields.push(`series_id = $${idx++}`);
      values.push(data.series_id);
    }

    values.push(id);
    const sql = `UPDATE shifts SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, external_id,starts_at, ends_at, doctors_required, nurses_required, receptionists_required, series_id, created_by, created_at, updated_at`;
    return queryOne<ShiftEntity>(sql, values, executor);
  },

  async delete(id: string, executor?: QueryExecutor): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM shifts WHERE id = $1 RETURNING id`,
      [id],
      executor
    );
    return rows.length > 0;
  },
  async findByExternalId(
    externalId: number,
    executor?: QueryExecutor
  ): Promise<ShiftEntity | null> {
    return queryOne<ShiftEntity>(
      `SELECT
        id,
        external_id,
        starts_at,
        ends_at,
        doctors_required,
        nurses_required,
        receptionists_required,
        series_id,
        created_by,
        created_at,
        updated_at
     FROM shifts
     WHERE external_id = $1`,
      [externalId],
      executor
    );
  },
};
