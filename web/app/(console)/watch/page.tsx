import { CameraGrid } from "@/components/CameraGrid";
import { settings } from "@/lib/decision";
import { listCameras, listDetections } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Rendered on the server so the first paint carries real state, then the
  // stream takes over. A watch floor should never open on a spinner.
  const [cameras, detections] = await Promise.all([listCameras(), listDetections(25)]);
  return <CameraGrid initial={{ cameras, detections, settings }} />;
}
