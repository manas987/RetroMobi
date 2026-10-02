import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function applyMigrations(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await pool.query<{ filename: string }>(
    "select filename from schema_migrations",
  );
  const applied = new Set(rows.map((r) => r.filename));

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (filename) values ($1)",
        [file],
      );
      await client.query("commit");
      newlyApplied.push(file);
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  return newlyApplied;
}

if (import.meta.main) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  applyMigrations(pool)
    .then((applied) => {
      console.log(
        applied.length ? `Applied: ${applied.join(", ")}` : "Nothing to apply.",
      );
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
