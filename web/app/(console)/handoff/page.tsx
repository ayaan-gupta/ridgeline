import { Handoff } from "@/components/Handoff";
import { listHandoff } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Handoff" };

const WINDOWS = [8, 12, 24];

export default async function HandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ hours?: string }>;
}) {
  const { hours } = await searchParams;
  const requested = Number(hours);
  // Eight hours is the default because it is the shift, not because it is a
  // round number.
  const span = WINDOWS.includes(requested) ? requested : 8;
  const rows = await listHandoff(span);
  return <Handoff rows={rows} hours={span} windows={WINDOWS} />;
}
