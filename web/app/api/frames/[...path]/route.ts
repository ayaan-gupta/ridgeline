import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FRAMES_DIR = process.env.FRAMES_DIR ?? "/frames";

/**
 * Serves a captured frame off the shared volume.
 *
 * The worker writes frames here and the dashboard reads them. Paths are resolved
 * and checked against the frames root before anything is opened, so a crafted
 * path cannot walk out of the volume.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const root = resolve(FRAMES_DIR);
  const target = resolve(join(root, normalize(path.join("/"))));

  if (!target.startsWith(root + "/")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");

    const stream = createReadStream(target) as unknown as ReadableStream;
    return new NextResponse(stream, {
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(info.size),
        // Frames never change once written, and each has a unique name.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "That frame is no longer on disk." }, { status: 404 });
  }
}
