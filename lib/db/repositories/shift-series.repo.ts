import { query, queryOne, QueryExecutor } from "../client";
import { ShiftSeriesEntity, CreateShiftSeriesInput } from "../types";

export const shiftSeriesRepo = {
  async findAll(executor?: QueryExecutor): Promise<ShiftSeriesEntity[]> {
    return query<ShiftSeriesEntity>(
      `SELECT id, days_of_week, start_time, end_time, doctors_required, nurses_required, receptionists_required, until_date, created_by, created_at 
       FROM shift_series 
       ORDER BY created_at DESC`,
      [],
      executor
    );
  },

  async findById(id: string, executor?: QueryExecutor): Promise<ShiftSeriesEntity | null> {
    return queryOne<ShiftSeriesEntity>(
      `SELECT id, days_of_week, start_time, end_time, doctors_required, nurses_required, receptionists_required, until_date, created_by, created_at 
       FROM shift_series 
       WHERE id = $1`,
      [id],
      executor
    );
  },

  async create(data: CreateShiftSeriesInput, executor?: QueryExecutor): Promise<ShiftSeriesEntity> {
    const rows = await query<ShiftSeriesEntity>(
      `INSERT INTO shift_series (days_of_week, start_time, end_time, doctors_required, nurses_required, receptionists_required, until_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, days_of_week, start_time, end_time, doctors_required, nurses_required, receptionists_required, until_date, created_by, created_at`,
      [
        data.days_of_week,
        data.start_time,
        data.end_time,
        data.doctors_required ?? 0,
        data.nurses_required ?? 0,
        data.receptionists_required ?? 0,
        data.until_date,
        data.created_by,
      ],
      executor
    );
    return rows[0];
  },

  async delete(id: string, executor?: QueryExecutor): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM shift_series WHERE id = $1 RETURNING id`,
      [id],
      executor
    );
    return rows.length > 0;
  },
};
