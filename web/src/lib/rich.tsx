import { Fragment, type ReactNode } from 'react';

// Lightweight markup used in the dictionaries: {tag|text}. Keeps copy translatable without HTML.
const PATRON = /\{(\w+)\|([^}]*)\}/g;

const ELEMENTOS: Record<string, (texto: string, key: number) => ReactNode> = {
  code: (t, k) => <code key={k}>{t}</code>,
  b: (t, k) => <strong key={k}>{t}</strong>,
  em: (t, k) => <em key={k} className="accent-serif">{t}</em>,
};

export function rich(texto: string): ReactNode[] {
  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let key = 0;
  for (const m of texto.matchAll(PATRON)) {
    const [completo, tag, contenido] = m;
    const inicio = m.index ?? 0;
    if (inicio > ultimo) nodos.push(<Fragment key={key++}>{texto.slice(ultimo, inicio)}</Fragment>);
    const crear = ELEMENTOS[tag];
    // Terminal tags (u, d, s, ok, er, nt, sk, hl) become spans with a class
    nodos.push(crear ? crear(contenido, key++) : <span key={key++} className={`t-${tag}`}>{contenido}</span>);
    ultimo = inicio + completo.length;
  }
  if (ultimo < texto.length) nodos.push(<Fragment key={key++}>{texto.slice(ultimo)}</Fragment>);
  return nodos;
}

// Plain text for attributes (aria-label, title): strips the markup
export function plain(texto: string): string {
  return texto.replace(PATRON, '$2');
}
