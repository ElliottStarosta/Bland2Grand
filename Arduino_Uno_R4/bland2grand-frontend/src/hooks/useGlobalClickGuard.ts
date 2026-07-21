// App-wide guard against spam-clicking. Attaches a single capture-phase
// click listener at the document root and blocks a second click on the
// SAME button/element if it arrives within `delay` ms of the last one
// that was let through. This stops duplicate signals (API calls, dispense
// commands, navigation, etc.) from firing when a user taps repeatedly.
//
// Scope: only guards clicks on <button> and [role="button"] elements, and
// tracks each element independently (via WeakMap), so clicking button A
// then immediately button B is unaffected -- only rapid repeat clicks on
// the *same* control get swallowed.
//
// Note: this only protects against literal double-clicks on one DOM node.
// It does NOT know about async state (e.g. a handler that fires a network
// call ~200ms after a click, before any "loading" state has been set).
// Those cases still need local guards (disabled state, a `saving` ref,
// etc.) alongside this -- this hook is a blanket safety net, not a
// replacement for per-action guards on sensitive actions like dispense/stop.

import { useEffect } from "react";

const CLICKABLE_SELECTOR = "button, [role='button']";

export function useGlobalClickGuard(delay = 400) {
  useEffect(() => {
    const lastClickAt = new WeakMap<Element, number>();

    const handler = (e: MouseEvent) => {
      const target = (e.target as Element)?.closest(CLICKABLE_SELECTOR);
      if (!target) return;

      const now = Date.now();
      const last = lastClickAt.get(target) ?? 0;

      if (now - last < delay) {
        // Too soon after the last accepted click on this element -- block it.
        e.stopPropagation();
        e.preventDefault();
        return;
      }

      lastClickAt.set(target, now);
    };

    // Capture phase so this runs before React's own synthetic handlers.
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [delay]);
}