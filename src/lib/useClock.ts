import { useEffect, useState } from "react";

/** Re-render on an interval so relative times ("3m ago", "in 12 min") stay honest. */
export function useClock(everyMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
