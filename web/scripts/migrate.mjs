import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const url = process.env.DATABASE_URL ?? "postgres://ridgeline:ridgeline@localhost:5432/ridgeline";

// Notices are silenced. "relation _migrations already exists, skipping" is the
// expected result of CREATE TABLE IF NOT EXISTS, and printing it as a red block
// on every container start trains everyone to ignore the boot logs.
const sql = postgres(url, { max: 1, onnotice: () => {} });

// Postgres can take a moment longer than its healthcheck suggests on a cold
// volume, so retry rather than crash the container on an unlucky first attempt.
for (let attempt = 1; attempt <= 30; attempt++) {
  try {
    await sql`SELECT 1`;
    break;
  } catch (err) {
    if (attempt === 30) {
      console.error("Database never became reachable:", err.message);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

await sql`CREATE TABLE IF NOT EXISTS _migrations (name text primary key, applied_at timestamptz default now())`;

const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
  const [row] = await sql`SELECT name FROM _migrations WHERE name = ${file}`;
  if (row) {
    console.log(`migration ${file} already applied`);
    continue;
  }
  console.log(`applying migration ${file}`);
  await sql.unsafe(readFileSync(join(dir, file), "utf8"));
  await sql`INSERT INTO _migrations (name) VALUES (${file})`;
}

console.log("migrations up to date");
await sql.end();
