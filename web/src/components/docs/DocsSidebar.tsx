'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DocGroup } from '@/lib/docs';

interface DocsSidebarProps {
  lang: string;
  groups: DocGroup[];
  labels: { sidebarLabel: string; soon: string; menu: string; title: string };
}

export function DocsSidebar({ lang, groups, labels }: DocsSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // On mobile the menu closes after navigating
  useEffect(() => setOpen(false), [pathname]);

  return (
    <aside className="docs-sidebar" data-open={open}>
      <button className="docs-menu-btn" type="button" aria-expanded={open} aria-controls="docs-nav" onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true" className="docs-menu-icon" />
        {labels.menu}
      </button>
      <nav id="docs-nav" aria-label={labels.sidebarLabel}>
        <Link href={`/${lang}/docs/`} className="docs-home-link" aria-current={pathname === `/${lang}/docs/` ? 'page' : undefined}>
          {labels.title}
        </Link>
        {groups.map((g) => (
          <div className="docs-group" key={g.title} data-c={g.color}>
            <p className="docs-group-title"><i aria-hidden="true" />{g.title}</p>
            <ul>
              {g.pages.map((p) => {
                const href = `/${lang}/docs/${p.slug}/`;
                if (!p.ready) {
                  return <li key={p.slug}><span className="docs-link" aria-disabled="true">{p.title}<em>{labels.soon}</em></span></li>;
                }
                return (
                  <li key={p.slug}>
                    <Link href={href} className="docs-link" aria-current={pathname === href ? 'page' : undefined}>{p.title}</Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
