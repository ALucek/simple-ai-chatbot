'use client';

import { useEffect } from 'react';

export function useViewportHeight() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    let frame = 0;

    const update = () => {
      frame = 0;
      document.documentElement.style.setProperty(
        '--app-height',
        `${vv.height}px`,
      );
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
    };
  }, []);
}
