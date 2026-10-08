'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Dictionary } from '@/i18n/types';
import { rich } from '@/lib/rich';

interface UsageProps {
  t: Dictionary['usage'];
}

// Color de la etiqueta según el tipo de petición
const TAG_COLOR: Record<string, string> = { lab: 'blue', edu: 'green', ts: 'rose', vlsm: 'amber', trace: 'violet' };

export function Usage({ t }: UsageProps) {
  const [selected, setSelected] = useState(0);
  const [shown, setShown] = useState(0);
  const [saliendo, setSaliendo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function select(i: number, instant: boolean): void {
    setSelected(i);
    clearTimeout(timer.current);
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(i);
      setSaliendo(false);
      return;
    }
    // Fundido con desenfoque: une las dos salidas en vez de mostrar dos estados superpuestos
    setSaliendo(true);
    timer.current = setTimeout(() => {
      setShown(i);
      setSaliendo(false);
    }, 170);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const delta = ['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : ['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = (selected + delta + t.prompts.length) % t.prompts.length;
    botones.current[i]?.focus();
    select(i, true); // teclado: sin animación
  }

  return (
    <div className="usage">
      <div className="prompts reveal" role="tablist" aria-label={t.tablistLabel} aria-orientation="vertical" onKeyDown={handleKeyDown}>
        {t.prompts.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              botones.current[i] = el;
            }}
            className="prompt"
            role="tab"
            type="button"
            id={`usage-tab-${i}`}
            aria-selected={i === selected}
            aria-controls="usage-panel"
            tabIndex={i === selected ? 0 : -1}
            data-c={TAG_COLOR[p.id] ?? 'teal'}
            onClick={() => select(i, false)}
          >
            <span className="q">{p.q}</span>
            <span className="tag">{p.tag}</span>
          </button>
        ))}
      </div>

      <div className="term-ring reveal" style={{ '--i': 1 } as CSSProperties}>
        <div className="term">
          <div className="term-bar">
            <div className="dots" aria-hidden="true"><i /><i /><i /></div>
            <span className="title">claude — ~/redes</span>
            <span className="spacer" />
          </div>
          <div className="term-body" id="usage-panel" role="tabpanel" aria-labelledby={`usage-tab-${selected}`}>
            <pre data-out={saliendo} aria-live="polite">{rich(t.prompts[shown].term)}</pre>
          </div>
          <div className="term-foot">{t.foot}</div>
        </div>
      </div>
    </div>
  );
}
