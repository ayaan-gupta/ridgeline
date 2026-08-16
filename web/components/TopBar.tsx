"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AlertSound } from "./AlertSound";
import { PositionField } from "./PositionField";
import { Wordmark } from "./Wordmark";

const LINKS = [
  { href: "/watch", label: "Cameras" },
  { href: "/map", label: "Map" },
  { href: "/detections", label: "Detections" },
  { href: "/handoff", label: "Handoff" },
];

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <Link href="/watch" aria-label="Ridgeline, go to cameras">
        <Wordmark />
      </Link>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={pathname.startsWith(l.href) ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="topbar-right">
        <AlertSound />
        <PositionField />
        <span className="data-sm muted">San Diego County</span>
      </div>
    </header>
  );
}
