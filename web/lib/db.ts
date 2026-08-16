import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://ridgeline:ridgeline@localhost:5432/ridgeline";

// Next dev reloads modules on every edit, which would open a new pool each time.
const globalForDb = globalThis as unknown as { _sql?: ReturnType<typeof postgres> };

export const sql = globalForDb._sql ?? postgres(connectionString, { max: 8 });
if (process.env.NODE_ENV !== "production") globalForDb._sql = sql;

export const db = drizzle(sql, { schema });
export { schema };
