import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { listCameras } from "@/lib/queries";
import { cameras } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ cameras: await listCameras() });
}

/**
 * The ingestion worker registers its cameras here on startup.
 *
 * The worker owns the camera list, because the worker is what actually has to
 * reach them. Upsert rather than replace, so a restart never drops the frame and
 * detection history attached to a camera.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const incoming = body?.cameras;
  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: "Expected a cameras array." }, { status: 400 });
  }

  const rows = incoming
    .filter((c) => c?.id && c?.name)
    .map((c) => ({
      id: String(c.id),
      name: String(c.name),
      network: c.network ?? null,
      site: c.site ?? null,
      lat: c.lat ?? null,
      lng: c.lng ?? null,
      elevationM: c.elevation_m ?? null,
      bearingDeg: c.bearing_deg ?? null,
      sourceType: c.source_type ?? "replay",
      sourceConfig: c.source_config ?? {},
      attribution: c.attribution ?? null,
      status: "active",
    }));

  if (rows.length === 0) {
    return NextResponse.json({ registered: 0 });
  }

  await db
    .insert(cameras)
    .values(rows)
    .onConflictDoUpdate({
      target: cameras.id,
      set: {
        name: sqlExcluded("name"),
        network: sqlExcluded("network"),
        site: sqlExcluded("site"),
        lat: sqlExcluded("lat"),
        lng: sqlExcluded("lng"),
        elevationM: sqlExcluded("elevation_m"),
        bearingDeg: sqlExcluded("bearing_deg"),
        sourceType: sqlExcluded("source_type"),
        sourceConfig: sqlExcluded("source_config"),
        attribution: sqlExcluded("attribution"),
        status: sqlExcluded("status"),
      },
    });

  return NextResponse.json({ registered: rows.length });
}

// Small helper so the upsert reads as a list of columns rather than a wall of
// raw fragments.
import { sql } from "drizzle-orm";
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
