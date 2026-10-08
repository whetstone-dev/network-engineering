'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dictionary } from '@/i18n/types';
import { EXAMPLE_FILES, exampleUrl } from '@/lib/site';
import { LockIcon } from './Icons';
import { Segmented } from './Segmented';

interface TourProps {
  t: Dictionary['tour'];
}

// Level color, consistent with the per-section palette
const LEVEL_COLOR: Record<string, string> = { BEGINNER: 'green', INTERMEDIATE: 'amber', ADVANCED: 'violet', DIFF: 'cyan' };

// The diagram viewer accepts data-theme on its <html>; we sync it with the page (same origin)
function syncFrameTheme(frame: HTMLIFrameElement | null): void {
  if (!frame) return;
  try {
    const tema = document.documentElement.dataset.theme
      ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const doc = frame.contentDocument;
    if (doc) doc.documentElement.dataset.theme = tema;
  } catch {
    // Different origin: the viewer follows the system theme
  }
}

export function Tour({ t }: TourProps) {
  const [selected, setSelected] = useState(0);
  const [src, setSrc] = useState<string>(exampleUrl(EXAMPLE_FILES[0]));
  const [switching, setSwitching] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Theme change on the page → same theme in the diagram
  useEffect(() => {
    const mo = new MutationObserver(() => syncFrameTheme(frameRef.current));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mo.disconnect();
      clearTimeout(timer.current);
    };
  }, []);

  function handleSelect(i: number): void {
    setSelected(i);
    const next = exampleUrl(EXAMPLE_FILES[i]);
    if (next === src) return;
    clearTimeout(timer.current);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSrc(next);
      return;
    }
    // Brief blur so switching diagrams is not an abrupt jump
    setSwitching(true);
    timer.current = setTimeout(() => setSrc(next), 180);
  }

  const ex = t.examples[selected];
  const file = EXAMPLE_FILES[selected];
  const bad = file === 'troubleshooting-broken-lab';

  return (
    <div className="window-ring">
      <div className="window">
        <div className="win-bar">
          <div className="dots" aria-hidden="true"><i /><i /><i /></div>
          <div className="url"><LockIcon /><span>{file}/topology.html</span></div>
          <a className="btn btn-ghost open-art" href={src} target="_blank" rel="noopener noreferrer">
            <span className="long">{t.open}</span> ↗
          </a>
        </div>
        <Segmented
          className="tour-tabs"
          idPrefix="tour"
          ariaLabel={t.tablistLabel}
          selected={selected}
          onSelect={handleSelect}
          items={t.examples.map((e, i) => (
            <>
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              {e.tab}
            </>
          ))}
        />
        <div className="stage" id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${selected}`} data-switching={switching}>
          <iframe
            ref={frameRef}
            src={src}
            title={t.iframeTitle}
            loading="lazy"
            onLoad={() => {
              syncFrameTheme(frameRef.current);
              setSwitching(false);
            }}
          />
        </div>
        <div className="stage-meta" aria-live="polite">
          <span className="lvl" data-c={LEVEL_COLOR[ex.level] ?? 'blue'}>{ex.level}</span>
          <span className="status" data-bad={bad}><span className="led" aria-hidden="true" />{ex.status}</span>
          <span className="desc">{ex.desc}</span>
        </div>
      </div>
    </div>
  );
}
