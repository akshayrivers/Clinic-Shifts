import { query, queryOne, QueryExecutor } from "../client";
import { ImportBatchEntity, ImportRowEntity, CreateImportBatchInput, CreateImportRowInput } from "../types";

export const importsRepo = {
  // Batches
  async createBatch(data: CreateImportBatchInput, executor?: QueryExecutor): Promise<ImportBatchEntity> {
    const rows = await query<ImportBatchEntity>(
      `INSERT INTO import_batches (source_filename, imported_by)
       VALUES ($1, $2)
       RETURNING id, source_filename, imported_by, imported_at`,
      [data.source_filename, data.imported_by ?? null],
      executor
    );
    return rows[0];
  },

  async findBatchById(id: string, executor?: QueryExecutor): Promise<ImportBatchEntity | null> {
    return queryOne<ImportBatchEntity>(
      `SELECT id, source_filename, imported_by, imported_at 
       FROM import_batches 
       WHERE id = $1`,
      [id],
      executor
    );
  },

  async findAllBatches(executor?: QueryExecutor): Promise<ImportBatchEntity[]> {
    return query<ImportBatchEntity>(
      `SELECT id, source_filename, imported_by, imported_at 
       FROM import_batches 
       ORDER BY imported_at DESC`,
      [],
      executor
    );
  },

  // Rows
  async createRow(data: CreateImportRowInput, executor?: QueryExecutor): Promise<ImportRowEntity> {
    const rows = await query<ImportRowEntity>(
      `INSERT INTO import_rows (batch_id, row_number, raw_data, status, reason, resulting_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, batch_id, row_number, raw_data, status, reason, resulting_id, created_at`,
      [
        data.batch_id,
        data.row_number,
        JSON.stringify(data.raw_data),
        data.status,
        data.reason ?? null,
        data.resulting_id ?? null,
      ],
      executor
    );
    return rows[0];
  },

  async findRowsByBatchId(batchId: string, executor?: QueryExecutor): Promise<ImportRowEntity[]> {
    return query<ImportRowEntity>(
      `SELECT id, batch_id, row_number, raw_data, status, reason, resulting_id, created_at 
       FROM import_rows 
       WHERE batch_id = $1 
       ORDER BY row_number ASC`,
      [batchId],
      executor
    );
  },
};
