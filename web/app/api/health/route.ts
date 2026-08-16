import { NextResponse } from "next/server";

import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ status: "ok", database: "reachable" });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
