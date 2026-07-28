import { Pool, PoolClient } from "pg";

const globalForDb = globalThis as unknown as {
  connPool: Pool | undefined;
};

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/clinic_db";

export const pool =
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

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_DB) {
      console.log("executed query", { text, duration, rows: res.rowCount });
    }
    return res.rows as T[];
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

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
