import { MapPanel } from "@/components/MapPanel";
import { settings } from "@/lib/decision";
import { listCameras, listDetections } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [cameras, detections] = await Promise.all([listCameras(), listDetections(25)]);
  return <MapPanel initial={{ cameras, detections, settings }} />;
}
