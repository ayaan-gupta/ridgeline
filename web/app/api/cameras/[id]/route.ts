import { NextResponse } from "next/server";

import { getCamera } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCamera(id);
  if (!detail) {
    return NextResponse.json({ error: `No camera with id ${id}.` }, { status: 404 });
  }
  return NextResponse.json(detail);
}
