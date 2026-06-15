'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Press-and-hold "compare to the original" interaction, shared by the editor
 * (E2) and the inspect view (D1). Returns the `held` flag plus pointer handlers
 * to spread onto the compare <button>.
 *
 * Why Pointer Events instead of mousedown/up/leave: the compare button's label
 * changes width while held ("Hold to compare" → "Before"; "Hold for original" →
 * "Original"). The button is left-anchored and auto-width, so toggling shrinks
 * its right edge out from under the cursor. The old onMouseLeave then fired on
 * that resize and reset compare OFF mid-hold — the intermittent "hold doesn't
 * work on desktop" bug (it broke whenever the press landed on the right half).
 *
 * Robustness comes in two layers:
 *  - setPointerCapture pins the release to the button while the gesture is live
 *    (best-effort — capture can be unavailable in rare cases).
 *  - a window-level pointerup/pointercancel listener (active only while held) is
 *    the GUARANTEED reset: it clears `held` even when the button never receives
 *    its own release — e.g. the cursor was released off the button after a
 *    capture failure, or the button unmounted mid-hold (the editor nulls it on a
 *    photo error). Without this, those paths would leave compare stuck ON.
 *
 * A single active pointer is tracked so a second finger can neither start nor end
 * the gesture (no flicker on multi-touch). Pair with `touch-action: none` on the
 * button so a touch-hold isn't reinterpreted as a scroll (which fires
 * pointercancel and would drop the hold).
 */
export function useHoldCompare() {
  const [held, setHeld] = useState(false);
  const activePointer = useRef<number | null>(null);

  const release = useCallback(() => {
    activePointer.current = null;
    setHeld(false);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (activePointer.current !== null) return; // ignore extra pointers (multi-touch)
    e.preventDefault(); // stop text selection / native drag / synthetic-mouse delay
    activePointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Best-effort: capture can throw if the pointer is already gone. The
      // window-level listener below is the guaranteed reset regardless.
    }
    setHeld(true);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (activePointer.current === null || e.pointerId === activePointer.current) {
        release();
      }
    },
    [release],
  );

  // Guaranteed reset: while held, a pointerup/pointercancel anywhere clears the
  // gesture. Covers a release off the button (capture failed) and the button
  // unmounting mid-hold, where its own handlers can never fire.
  useEffect(() => {
    if (!held) return;
    const onWindowRelease = (e: PointerEvent) => {
      if (activePointer.current === null || e.pointerId === activePointer.current) {
        release();
      }
    };
    window.addEventListener('pointerup', onWindowRelease);
    window.addEventListener('pointercancel', onWindowRelease);
    return () => {
      window.removeEventListener('pointerup', onWindowRelease);
      window.removeEventListener('pointercancel', onWindowRelease);
    };
  }, [held, release]);

  const holdHandlers = {
    onPointerDown,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onLostPointerCapture: onPointerUp,
  } as const;

  return { held, holdHandlers };
}
