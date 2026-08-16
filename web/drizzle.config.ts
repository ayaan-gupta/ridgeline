import type { Config } from "drizzle-kit";

export default {
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ridgeline:ridgeline@localhost:5432/ridgeline",
  },
} satisfies Config;
