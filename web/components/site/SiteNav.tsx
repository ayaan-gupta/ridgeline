"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Wordmark } from "../Wordmark";

const SECTIONS = [
  { href: "#reel", label: "The sequence" },
  { href: "#rule", label: "The rule" },
  { href: "#pipeline", label: "The pipeline" },
  { href: "#limits", label: "Limits" },
];

/**
 * Transparent over the hero photograph, solid once the page has moved.
 *
 * It does not hide on scroll down. A navigation bar that plays hide and seek is
 * a small unkindness on any site and an actively bad habit to build in a product
 * whose console has to stay exactly where the operator left it.
 */
export function SiteNav() {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sitenav" data-lifted={lifted || undefined}>
      <Link href="/" aria-label="Ridgeline, top of page">
        <Wordmark />
      </Link>
      <nav className="sitenav-links">
        {SECTIONS.map((s) => (
          <a key={s.href} href={s.href}>
            {s.label}
          </a>
        ))}
      </nav>
      <Link className="sitenav-cta" href="/watch">
        Open the watch floor
      </Link>
    </header>
  );
}
