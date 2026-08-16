import { notFound } from "next/navigation";

import { CameraDetail } from "@/components/CameraDetail";
import { getCamera } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CameraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCamera(id);
  if (!detail) notFound();
  return <CameraDetail initial={detail} />;
}
