import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REPLAY_DIR = process.env.REPLAY_DIR ?? "/replay";
// Widths the landing page actually requests. Anything else is refused, so this
// route cannot be turned into a general purpose image resizer by a stranger
// with a loop and a query string.
const WIDTHS = new Set([640, 1024, 1600]);

/**
 * Serves one frame of a landing page reel, resized and re-encoded.
 *
 * The reel scrubs through thirty five frames under the visitor's scroll, so all
 * thirty five have to be in memory before it can run. At the source resolution
 * that is four and a half megabytes of JPEG. Re-encoded to WebP at the width the
 * viewport can actually show, the same reel is closer to one.
 *
 * If the encoder is unavailable for any reason the original frame is returned
 * rather than an error. A heavier reel is a much smaller problem than no reel.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ seq: string; file: string }> },
) {
  const { seq, file } = await params;
  const root = resolve(REPLAY_DIR);
  const target = resolve(root, seq, file);

  // Frame names carry a leading sign, so they are checked by shape rather than
  // by trusting the router to have kept separators out of the segment.
  if (!target.startsWith(root + "/") || !/^[+-]\d+\.jpg$/.test(file)) {
    return NextResponse.json({ error: "No such frame." }, { status: 404 });
  }

  const requested = Number(new URL(request.url).searchParams.get("w") ?? 1024);
  const width = WIDTHS.has(requested) ? requested : 1024;

  let source: Buffer;
  try {
    source = await readFile(target);
  } catch {
    return NextResponse.json(
      { error: "That frame has not been downloaded yet." },
      { status: 404 },
    );
  }

  const headers = {
    // A frame never changes once written and the width is in the URL, so this
    // is safe to keep forever.
    "cache-control": "public, max-age=31536000, immutable",
  };

  // content-length is set explicitly on both paths. Without it the response is
  // chunked, and the hero image and the reel preloader ask for the very first
  // frame at the same moment, which raced and left one of them reporting an
  // incomplete body in the console.
  const send = (bytes: Buffer, type: string) =>
    new NextResponse(new Uint8Array(bytes), {
      headers: { ...headers, "content-type": type, "content-length": String(bytes.length) },
    });

  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return send(out, "image/webp");
  } catch {
    return send(source, "image/jpeg");
  }
}
