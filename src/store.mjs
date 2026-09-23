import pg from "pg";

const memory = new Map();
const memoryUsers = new Map();
let pool = null;

export async function initStore(databaseUrl) {
  if (!databaseUrl) return { mode: "memory" };

  pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      result JSONB NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('expert', 'admin')),
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return { mode: "postgres" };
}

export async function saveAnalysis(record) {
  if (!pool) {
    memory.set(record.id, structuredClone(record));
    return record;
  }

  await pool.query(
    `INSERT INTO analyses (id, name, created_at, result)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, result = EXCLUDED.result`,
    [record.id, record.name, record.createdAt, JSON.stringify(record)]
  );
  return record;
}

export async function listAnalyses() {
  const records = pool
    ? (await pool.query("SELECT result FROM analyses ORDER BY created_at DESC LIMIT 50")).rows.map((row) => row.result)
    : [...memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return records.map(({ id, name, createdAt, summary, documents, engine }) => ({
    id,
    name,
    createdAt,
    summary,
    documents,
    engine
  }));
}

export async function getAnalysis(id) {
  if (!pool) return memory.get(id) || null;
  const result = await pool.query("SELECT result FROM analyses WHERE id = $1", [id]);
  return result.rows[0]?.result || null;
}

export async function updateFinding(id, findingId, patch) {
  const record = await getAnalysis(id);
  if (!record) return null;
  const finding = record.findings.find((item) => item.id === findingId);
  if (!finding) return false;

  finding.status = patch.status;
  finding.comment = patch.comment;
  finding.reviewedAt = new Date().toISOString();
  finding.reviewedBy = patch.reviewedBy || null;
  await saveAnalysis(record);
  return record;
}

export async function closeStore() {
  if (pool) await pool.end();
}

// Users. Rows are mapped to one shape for both backends; passwordHash never leaves the server.
const userFromRow = (row) => row && ({
  id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash,
  role: row.role, tokenVersion: row.token_version, createdAt: new Date(row.created_at).toISOString()
});

export const publicUser = ({ id, email, name, role, createdAt }) => ({ id, email, name, role, createdAt });

export async function countUsers() {
  if (!pool) return memoryUsers.size;
  return Number((await pool.query("SELECT COUNT(*) AS count FROM users")).rows[0].count);
}

export async function createUser({ id, email, name, passwordHash, role }) {
  const createdAt = new Date().toISOString();
  if (!pool) {
    if ([...memoryUsers.values()].some((user) => user.email === email)) return null;
    const user = { id, email, name, passwordHash, role, tokenVersion: 0, createdAt };
    memoryUsers.set(id, user);
    return user;
  }
  const result = await pool.query(
    `INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [id, email, name, passwordHash, role, createdAt]
  );
  return userFromRow(result.rows[0]) || null;
}

export async function findUserByEmail(email) {
  if (!pool) return [...memoryUsers.values()].find((user) => user.email === email) || null;
  return userFromRow((await pool.query("SELECT * FROM users WHERE email = $1", [email])).rows[0]) || null;
}

export async function findUserById(id) {
  if (!pool) return memoryUsers.get(id) || null;
  return userFromRow((await pool.query("SELECT * FROM users WHERE id = $1", [id])).rows[0]) || null;
}

export async function listUsers() {
  if (!pool) return [...memoryUsers.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (await pool.query("SELECT * FROM users ORDER BY created_at")).rows.map(userFromRow);
}

// Only role and name are editable; returns null when the user does not exist.
export async function updateUser(id, { name, role }) {
  if (!pool) {
    const user = memoryUsers.get(id);
    if (!user) return null;
    if (name !== undefined) user.name = name;
    if (role !== undefined) user.role = role;
    return user;
  }
  const result = await pool.query(
    "UPDATE users SET name = COALESCE($2, name), role = COALESCE($3, role) WHERE id = $1 RETURNING *",
    [id, name ?? null, role ?? null]
  );
  return userFromRow(result.rows[0]) || null;
}

export async function deleteUser(id) {
  if (!pool) return memoryUsers.delete(id);
  return (await pool.query("DELETE FROM users WHERE id = $1", [id])).rowCount > 0;
}

// Logout: bumping the version invalidates every token issued before.
export async function bumpTokenVersion(id) {
  if (!pool) {
    const user = memoryUsers.get(id);
    if (user) user.tokenVersion += 1;
    return;
  }
  await pool.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [id]);
}
