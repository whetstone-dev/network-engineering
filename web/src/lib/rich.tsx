import { Fragment, type ReactNode } from 'react';

// Marcado ligero de los diccionarios: {tag|texto}. Mantiene los textos traducibles sin HTML.
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
    // Las etiquetas de terminal (u, d, s, ok, er, nt, sk, hl) se vuelven spans con clase
    nodos.push(crear ? crear(contenido, key++) : <span key={key++} className={`t-${tag}`}>{contenido}</span>);
    ultimo = inicio + completo.length;
  }
  if (ultimo < texto.length) nodos.push(<Fragment key={key++}>{texto.slice(ultimo)}</Fragment>);
  return nodos;
}

// Texto plano para atributos (aria-label, title): quita el marcado
export function plain(texto: string): string {
  return texto.replace(PATRON, '$2');
}
