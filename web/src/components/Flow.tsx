'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Dictionary } from '@/i18n/types';
import { rich } from '@/lib/rich';
import { ChartIcon, CodeIcon, DocIcon, ReplayIcon, TopologyIcon } from './Icons';

interface FlowProps {
  t: Dictionary['how'];
}

// Cada etapa con su color; los cables mezclan el color de origen y destino
const NODE_COLORS = ['blue', 'violet', 'teal', 'amber'] as const;
const OUT_ICONS: ReactNode[] = [<TopologyIcon key="t" />, <CodeIcon key="c" />, <DocIcon key="d" />, <ChartIcon key="a" />];
const OUT_COLORS = ['var(--blue)', 'var(--teal)', 'var(--violet)', 'var(--rose)'];
const TOTAL_PASOS = 7; // 4 nodos + 3 cables

export function Flow({ t }: FlowProps) {
  const [encendidos, setEncendidos] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // La señal recorre el flujo una vez: explica el orden requisitos → modelo → validación → salidas
  const play = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setEncendidos(0);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gap = reduce ? 0 : 340;
    for (let k = 1; k <= TOTAL_PASOS; k++) {
      timers.current.push(setTimeout(() => setEncendidos(k), 120 + (k - 1) * gap));
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        play();
        io.disconnect();
      },
      { rootMargin: '0px 0px -20% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.current.forEach(clearTimeout);
    };
  }, [play]);

  const on = (paso: number): boolean => encendidos > paso;
  const wire = (paso: number, de: string, a: string) => (
    <div className="wire" data-on={on(paso)} style={{ '--from': `var(--${de})`, '--to': `var(--${a})` } as CSSProperties} />
  );

  return (
    <>
      <div className="flow reveal" ref={ref}>
        {t.nodes.map((n, i) => (
          <FragmentNode key={n.key} on={on(i * 2)} color={NODE_COLORS[i]} k={n.key} title={n.title} body={n.body}>
            {wire(i * 2 + 1, NODE_COLORS[i], NODE_COLORS[i + 1])}
          </FragmentNode>
        ))}
        <div className="fnode" data-c={NODE_COLORS[3]} data-on={on(6)}>
          <div className="k">{t.buildKey} <span className="led" /></div>
          <div className="outs">
            {t.outputs.map((o, i) => (
              <div className="out" key={o.file} style={{ '--i': i, '--oc': OUT_COLORS[i] } as CSSProperties}>
                {OUT_ICONS[i]}{o.file}<small>{o.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flow-foot reveal">
        <p>{t.foot}</p>
        <button className="btn btn-ghost" type="button" onClick={play}><ReplayIcon />{t.replay}</button>
      </div>
    </>
  );
}

interface NodeProps {
  on: boolean;
  color: string;
  k: string;
  title: string;
  body: string;
  children: ReactNode;
}

// Nodo + el cable que lo sigue
function FragmentNode({ on, color, k, title, body, children }: NodeProps) {
  return (
    <>
      <div className="fnode" data-c={color} data-on={on}>
        <div className="k">{k} <span className="led" /></div>
        <h3>{title}</h3>
        <p>{rich(body)}</p>
      </div>
      {children}
    </>
  );
}
