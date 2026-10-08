'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

interface SegmentedProps {
  items: ReactNode[];
  selected: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  idPrefix: string;
  className?: string;
}

/**
 * Tabs with an "active" copy clipped with clip-path: the color changes continuously
 * instead of crossfading two states. With the keyboard the change is instant (repeated action).
 */
export function Segmented({ items, selected, onSelect, ariaLabel, idPrefix, className = '' }: SegmentedProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [clip, setClip] = useState({ l: 0, r: 9999 });
  const [instant, setInstant] = useState(true);

  // Computes the clip over the active tab and recomputes it on resize
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const place = (): void => {
      const tab = tabsRef.current[selected];
      if (!tab) return;
      setClip({ l: tab.offsetLeft, r: track.offsetWidth - tab.offsetLeft - tab.offsetWidth });
    };
    place();
    const ro = new ResizeObserver(() => {
      setInstant(true);
      place();
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [selected]);

  function select(i: number, viaKeyboard: boolean): void {
    setInstant(viaKeyboard);
    onSelect(i);
    if (viaKeyboard) {
      const tab = tabsRef.current[i];
      tab?.focus();
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    select((selected + delta + items.length) % items.length, true);
  }

  return (
    <div className={`seg ${className}`} data-instant={instant}>
      <div className="seg-track" ref={trackRef}>
        <div className="seg-list" role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
          {items.map((item, i) => (
            <button
              key={i}
              ref={(el) => {
                tabsRef.current[i] = el;
              }}
              id={`${idPrefix}-tab-${i}`}
              role="tab"
              type="button"
              aria-selected={i === selected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={i === selected ? 0 : -1}
              onClick={() => select(i, false)}
            >
              {item}
            </button>
          ))}
        </div>
        <div
          className="seg-list seg-overlay"
          aria-hidden="true"
          style={{ '--l': `${clip.l}px`, '--r': `${clip.r}px` } as CSSProperties}
        >
          {items.map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
