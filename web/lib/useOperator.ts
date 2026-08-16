"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "ridgeline.position";

/**
 * The position label recorded against a verdict.
 *
 * This is not authentication and the interface says so where it is typed. It is
 * the same thing a paper log has: whoever is on the desk writes down which desk
 * they are on, so that the next shift can ask them about a call. Building a real
 * account system here would imply a guarantee this product cannot make.
 */
export function useOperator() {
  const [position, setPosition] = useState("");

  useEffect(() => {
    try {
      setPosition(window.localStorage.getItem(KEY) ?? "");
    } catch {
      /* private browsing, or storage disabled. An unlabelled verdict is still
         a verdict, so this is not worth surfacing. */
    }
  }, []);

  const save = useCallback((next: string) => {
    setPosition(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* see above */
    }
  }, []);

  return { position, setPosition: save };
}
