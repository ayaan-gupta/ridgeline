"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows a camera frame, and keeps showing the current one until the next has
 * actually decoded.
 *
 * Swapping the src on a plain img blanks the element while the browser fetches
 * and decodes the replacement. At a two second refresh that turns a wall of
 * cameras into a wall of flashing holes, which is precisely the opposite of what
 * a monitoring surface is for. Preloading off-screen and swapping only on decode
 * means the tile always holds a real frame.
 *
 * This is also where the cross-fade lives, one of the four moments in the design
 * system where motion is allowed, and it is off under reduced motion.
 */
export function FrameImage({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [shown, setShown] = useState<string | null>(src);
  const [fading, setFading] = useState(false);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (!src || src === shown) return;
    pending.current = src;

    const image = new Image();
    image.src = src;

    const reveal = () => {
      // A newer frame may have arrived while this one decoded. Drop the stale one.
      if (pending.current !== src) return;
      setShown(src);
      setFading(true);
      window.setTimeout(() => setFading(false), 220);
    };

    if (image.decode) image.decode().then(reveal).catch(reveal);
    else image.onload = reveal;

    return () => {
      if (pending.current === src) pending.current = null;
    };
  }, [src, shown]);

  if (!shown) return null;
  return (
    <img
      className={[className, fading ? "fade-swap" : ""].filter(Boolean).join(" ")}
      src={shown}
      alt={alt}
    />
  );
}
