import { query, queryOne, QueryExecutor } from "../client";
import { UserEntity, CreateUserInput } from "../types";

export const usersRepo = {
  async findById(id: string, executor?: QueryExecutor): Promise<UserEntity | null> {
    return queryOne<UserEntity>(
      `SELECT id, email, password_hash, full_name, role, profession, staff_code, created_at 
       FROM users 
       WHERE id = $1`,
      [id],
      executor
    );
  },

  // NOTE: email is intentionally NOT unique (the CSV has duplicate emails across
  // different staff_ids, e.g. a shared front-desk inbox). This is only useful for
  // "does this email exist anywhere" checks — never use it as an auth lookup.
  async findAllByEmail(email: string, executor?: QueryExecutor): Promise<UserEntity[]> {
    return query<UserEntity>(
      `SELECT id, email, password_hash, full_name, role, profession, staff_code, created_at 
       FROM users 
       WHERE LOWER(email) = LOWER($1)`,
      [email],
      executor
    );
  },

  // staff_code is the actual login identifier — unique, required, one row per code.
  async findByStaffCode(staffCode: number, executor?: QueryExecutor): Promise<UserEntity | null> {
    return queryOne<UserEntity>(
      `SELECT id, email, password_hash, full_name, role, profession, staff_code, created_at 
       FROM users 
       WHERE staff_code = $1`,
      [staffCode],
      executor
    );
  },

  async findAll(executor?: QueryExecutor): Promise<UserEntity[]> {
    return query<UserEntity>(
      `SELECT id, email, password_hash, full_name, role, profession, staff_code, created_at 
       FROM users 
       ORDER BY full_name ASC`,
      [],
      executor
    );
  },

  async create(data: CreateUserInput, executor?: QueryExecutor): Promise<UserEntity> {
    const rows = await query<UserEntity>(
      `INSERT INTO users (email, password_hash, full_name, role, profession, staff_code)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, password_hash, full_name, role, profession, staff_code, created_at`,
      [
        data.email.toLowerCase().trim(),
        data.password_hash,
        data.full_name,
        data.role,
        data.profession || null,
        data.staff_code,
      ],
      executor
    );
    return rows[0];
  },

  async update(
    id: string,
    data: Partial<Omit<CreateUserInput, "password_hash">> & { password_hash?: string },
    executor?: QueryExecutor
  ): Promise<UserEntity | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(data.email.toLowerCase().trim());
    }
    if (data.password_hash !== undefined) {
      fields.push(`password_hash = $${idx++}`);
      values.push(data.password_hash);
    }
    if (data.full_name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(data.full_name);
    }
    if (data.role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(data.role);
    }
    if (data.profession !== undefined) {
      fields.push(`profession = $${idx++}`);
      values.push(data.profession);
    }
    if (data.staff_code !== undefined) {
      fields.push(`staff_code = $${idx++}`);
      values.push(data.staff_code);
    }

    if (fields.length === 0) {
      return this.findById(id, executor);
    }

    values.push(id);
    const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, email, password_hash, full_name, role, profession, staff_code, created_at`;
    return queryOne<UserEntity>(sql, values, executor);
  },

  async delete(id: string, executor?: QueryExecutor): Promise<boolean> {
    const rows = await query<{ id: string }>(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [id],
      executor
    );
    return rows.length > 0;
  },
};
