import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export type QueryExecutor = Pool | PoolClient;

const globalForDb = globalThis as unknown as {
  connPool: Pool | undefined;
};

const databaseUrl = process.env.DATABASE_URL;//|| "postgresql://postgres:postgres@localhost:5432/clinic_db";

export const pool: Pool =
  globalForDb.connPool ??
  new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.connPool = pool;
}

export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly detail?: string;
  public readonly queryText?: string;

  constructor(message: string, options?: { code?: string; detail?: string; queryText?: string }) {
    super(message);
    this.name = "DatabaseError";
    this.code = options?.code;
    this.detail = options?.detail;
    this.queryText = options?.queryText;
  }
}

/**
 * Reusable query executor supporting Pool or PoolClient (inside transactions).
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  executor?: QueryExecutor
): Promise<T[]> {
  const targetExecutor = executor || pool;
  const start = Date.now();
  try {
    const res: QueryResult<T> = await targetExecutor.query<T>(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_DB) {
      console.log("Executed Query", { text, duration, rows: res.rowCount });
    }
    return res.rows;
  } catch (error: unknown) {
    const err = error as { message?: string; code?: string; detail?: string };
    console.error("Database query execution error:", { text, error: err.message });
    throw new DatabaseError(err.message || "Database query failed", {
      code: err.code,
      detail: err.detail,
      queryText: text,
    });
  }
}

/**
 * Query single row helper.
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  executor?: QueryExecutor
): Promise<T | null> {
  const rows = await query<T>(text, params, executor);
  return rows[0] ?? null;
}

/**
 * Transaction helper callback wrapper.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
