import { NextResponse } from "next/server";

import { listDetections } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  return NextResponse.json({
    detections: await listDetections(Math.min(Math.max(limit, 1), 200)),
  });
}
