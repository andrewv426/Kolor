'use client';

import { useEffect, useState } from 'react';
import { msUntilNextUtcMidnight } from './time';

/** Live ms remaining until the next UTC midnight, ticking each second. */
export function useUtcCountdown(): number {
  const [ms, setMs] = useState(() => msUntilNextUtcMidnight());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextUtcMidnight()), 1000);
    return () => clearInterval(id);
  }, []);
  return ms;
}
