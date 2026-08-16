import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPLAY_DIR = process.env.REPLAY_DIR ?? "/replay";

/**
 * Reports whether a reel's frames have landed on disk yet.
 *
 * The replay imagery is downloaded at run time rather than committed, because
 * HPWREN publishes it under a licence that does not permit redistribution. That
 * means there is a window on a cold start where the site is up and the frames
 * are not. The landing page asks this first and says so plainly instead of
 * showing broken images.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ seq: string }> }) {
  const { seq } = await params;
  const root = resolve(REPLAY_DIR);
  const target = resolve(root, seq);
  if (!target.startsWith(root + "/")) {
    return NextResponse.json({ ready: false, frames: 0 }, { status: 404 });
  }
  try {
    const files = (await readdir(target)).filter((f) => f.endsWith(".jpg"));
    return NextResponse.json(
      { ready: files.length > 0, frames: files.length },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ready: false, frames: 0 },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
