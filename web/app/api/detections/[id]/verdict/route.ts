import { NextResponse } from "next/server";

import { sql } from "@/lib/db";
import { isVerdict } from "@/lib/verdicts";

export const dynamic = "force-dynamic";

/**
 * Records what the operator decided about a detection.
 *
 * The model's confidence, bounding box and consecutive count are left exactly as
 * they were. Only the verdict columns are written, so a later reader can always
 * ask why a person and the scorer disagreed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: { verdict?: unknown; by?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a verdict." }, { status: 400 });
  }

  if (!isVerdict(body.verdict)) {
    return NextResponse.json(
      { error: "Verdict must be acknowledged, real_fire or false_alarm." },
      { status: 400 },
    );
  }

  // A position label, not an identity. Trimmed and capped so a stray paste
  // cannot write a novel into the column.
  const by = typeof body.by === "string" && body.by.trim() ? body.by.trim().slice(0, 64) : null;
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const [row] = await sql`
    UPDATE detections
    SET verdict = ${body.verdict}, resolved_at = now(), resolved_by = ${by}, note = ${note}
    WHERE id = ${id}
    RETURNING id, status, verdict, resolved_at, resolved_by, note
  `;

  if (!row) {
    return NextResponse.json({ error: "No detection with that id." }, { status: 404 });
  }

  return NextResponse.json({
    id: row.id,
    status: row.status,
    verdict: row.verdict,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    note: row.note,
  });
}
