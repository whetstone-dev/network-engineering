import { Children, isValidElement, type ReactNode } from 'react';
import { CopyButton } from '../CopyButton';

const COPY_LABELS = { label: 'Copy prompt', done: 'Copied to clipboard', failed: 'Could not copy' };

// Heading ids derived from their text, so the "On this page" index can link to them
export function slugify(node: ReactNode): string {
  const text = Children.toArray(node)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? slugify(c.props.children) : ''))
    .join('');
  return text.toLowerCase().replace(/[`'"’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function H2({ children }: { children?: ReactNode }) {
  const id = slugify(children);
  return <h2 id={id} className="doc-h2"><a href={`#${id}`} className="doc-anchor" aria-hidden="true" tabIndex={-1}>#</a>{children}</h2>;
}

export function H3({ children }: { children?: ReactNode }) {
  const id = slugify(children);
  return <h3 id={id} className="doc-h3"><a href={`#${id}`} className="doc-anchor" aria-hidden="true" tabIndex={-1}>#</a>{children}</h3>;
}

type CalloutType = 'note' | 'tip' | 'warning';
const CALLOUT_COLOR: Record<CalloutType, string> = { note: 'blue', tip: 'green', warning: 'amber' };
const CALLOUT_LABEL: Record<CalloutType, string> = { note: 'Note', tip: 'Tip', warning: 'Important' };

/** Highlighted aside: note (information), tip (shortcut), warning (something that can go wrong) */
export function Callout({ type = 'note', title, children }: { type?: CalloutType; title?: string; children?: ReactNode }) {
  return (
    <aside className="callout" data-c={CALLOUT_COLOR[type]} role="note">
      <div className="callout-title">{title ?? CALLOUT_LABEL[type]}</div>
      <div className="callout-body">{children}</div>
    </aside>
  );
}

/** Numbered steps joined by a vertical line; each <Step> has its own title */
export function Steps({ children }: { children?: ReactNode }) {
  return <ol className="steps-list">{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
  const id = slugify(title);
  return (
    <li className="step-item">
      <h3 id={id} className="step-title"><a href={`#${id}`} className="doc-anchor" aria-hidden="true" tabIndex={-1}>#</a>{title}</h3>
      <div className="step-body">{children}</div>
    </li>
  );
}

/** A request to type in Claude Code, styled like the chat input, with a copy button */
export function Prompt({ children }: { children: string }) {
  return (
    <div className="doc-prompt">
      <span className="doc-prompt-mark" aria-hidden="true">›</span>
      <p>{children}</p>
      <CopyButton text={children} labels={COPY_LABELS} />
    </div>
  );
}

/** Two-column grid of linked cards (used for "Next steps") */
export function Cards({ children }: { children?: ReactNode }) {
  return <div className="doc-cards">{children}</div>;
}

export function Card({ href, title, children }: { href: string; title: string; children?: ReactNode }) {
  return (
    <a className="doc-card" href={href}>
      <strong>{title} <span aria-hidden="true">→</span></strong>
      <span>{children}</span>
    </a>
  );
}
