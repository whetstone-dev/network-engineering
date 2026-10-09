'use client';

import { useEffect, useState } from 'react';

interface Entry { id: string; text: string; level: 2 | 3 }

/** "On this page": built from the rendered headings; highlights the section being read */
export function DocsToc({ label }: { label: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    const headings = [...document.querySelectorAll<HTMLElement>('.doc-body h2[id], .doc-body .step-title[id]')];
    setEntries(headings.map((h) => ({ id: h.id, text: h.textContent?.replace(/^#/, '') ?? '', level: h.tagName === 'H2' ? 2 : 3 })));
    if (!('IntersectionObserver' in window) || headings.length === 0) return;
    const io = new IntersectionObserver(
      (items) => {
        const visible = items.filter((i) => i.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -65% 0px' },
    );
    headings.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, []);

  if (entries.length < 2) return null;
  return (
    <nav className="docs-toc" aria-label={label}>
      <p>{label}</p>
      <ul>
        {entries.map((e) => (
          <li key={e.id} data-level={e.level}>
            <a href={`#${e.id}`} aria-current={active === e.id ? 'location' : undefined}>{e.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
