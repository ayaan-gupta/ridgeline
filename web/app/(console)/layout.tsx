import { TopBar } from "@/components/TopBar";

/**
 * The console layout. Everything under it is the watch floor: dense, quiet, and
 * built for someone who already decided to care. The marketing surface lives in
 * its own group so that not one byte of its motion or its type scale can reach
 * a screen an operator is reading during an incident.
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <TopBar />
      {children}
    </div>
  );
}
