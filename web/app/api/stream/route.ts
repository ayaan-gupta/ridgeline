import { settings } from "@/lib/decision";
import { listCameras, listDetections } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Server-sent events feed for the dashboard.
 *
 * The dashboard has to update on its own, and this is a room where someone is
 * watching the screen rather than clicking around it. One long-lived connection
 * pushing changes beats every open tab polling several endpoints on a timer, and
 * it means a state change reaches the wall within a tick of being written.
 *
 * Snapshots go out only when something actually changed, so an idle watch floor
 * generates no traffic beyond a keepalive.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      let lastPayload = "";
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const [cameras, detections] = await Promise.all([listCameras(), listDetections(25)]);
          const payload = JSON.stringify({ cameras, detections });
          if (payload !== lastPayload) {
            lastPayload = payload;
            send("snapshot", { cameras, detections, settings, at: new Date().toISOString() });
          } else {
            send("keepalive", { at: new Date().toISOString() });
          }
        } catch (err) {
          send("error", { message: err instanceof Error ? err.message : "query failed" });
        }
      };

      await tick();
      timer = setInterval(tick, 2000);

      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
