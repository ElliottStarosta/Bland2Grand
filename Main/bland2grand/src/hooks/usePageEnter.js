// hooks/usePageEnter.js
// Runs a GSAP stagger entrance animation on mount for any page.

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

/**
 * Attach to a page container ref.
 * Children with data-animate will stagger in on mount.
 */
export function usePageEnter(options = {}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;

    const ctx = gsap.context(() => {
      gsap.from('[data-animate]', {
        opacity: 0,
        y: options.y ?? 20,
        duration: options.duration ?? 0.55,
        stagger: options.stagger ?? 0.07,
        ease: options.ease ?? 'power3.out',
        clearProps: 'all',
        delay: options.delay ?? 0,
      });
    }, ref);

    return () => ctx.revert();
  }, []);  // eslint-disable-line

  return ref;
}
