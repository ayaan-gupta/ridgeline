import { DetectionFeed } from "@/components/DetectionFeed";
import { settings } from "@/lib/decision";
import { listCameras, listDetections } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DetectionsPage() {
  const [cameras, detections] = await Promise.all([listCameras(), listDetections(60)]);
  return <DetectionFeed initial={{ cameras, detections, settings }} />;
}
