'use client';

import { useEffect, useState } from 'react';

/**
 * True when the desktop layout should render (>760px). Mirrors the prototype's
 * phone/desktop split. Returns false during SSR/first paint so the phone
 * (full-bleed) layout is the hydration default.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 761px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isDesktop;
}
