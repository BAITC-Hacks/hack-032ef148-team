import pg from "pg";

const memory = new Map();
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
  await saveAnalysis(record);
  return record;
}

export async function closeStore() {
  if (pool) await pool.end();
}
