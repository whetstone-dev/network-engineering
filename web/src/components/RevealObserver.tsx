'use client';

import { useEffect } from 'react';

// Marks .reveal elements with data-in when they enter the viewport (once)
export function RevealObserver() {
  useEffect(() => {
    const elementos = document.querySelectorAll<HTMLElement>('.reveal');
    if (!('IntersectionObserver' in window)) {
      elementos.forEach((el) => (el.dataset.in = 'true'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = 'true';
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    elementos.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
