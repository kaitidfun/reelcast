"use client";

import { useRef, useState } from "react";

/** The ref also prevents a second click before React renders the disabled button. */
export function usePendingAction() {
  const lock = useRef(false);
  const [pending, setPending] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(label);
    try {
      await action();
    } finally {
      lock.current = false;
      setPending(null);
    }
  }

  return { pending, run };
}
