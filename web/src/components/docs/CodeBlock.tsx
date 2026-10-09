import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { CopyButton } from '../CopyButton';

const COPY_LABELS = { label: 'Copy', done: 'Copied to clipboard', failed: 'Could not copy' };

// Lightweight highlighting per line, enough for shell commands and netlab output
function highlightLine(line: string, lang: string, key: number): ReactNode {
  if (lang === 'bash' || lang === 'sh' || lang === 'powershell') {
    const i = line.indexOf('#');
    if (i === 0 || (i > 0 && /\s/.test(line[i - 1]))) {
      return <span key={key}>{line.slice(0, i)}<span className="t-d">{line.slice(i)}</span>{'\n'}</span>;
    }
    return <span key={key}>{line}{'\n'}</span>;
  }
  if (lang === 'console') {
    const m = line.match(/^(OK|FAIL|ERROR|WARN(?:ING)?|note)(\s+)(.*)$/);
    if (m) {
      const cls = m[1] === 'OK' ? 't-ok' : m[1] === 'note' ? 't-d' : m[1].startsWith('WARN') ? 't-nt' : 't-er';
      return <span key={key}><span className={cls}>{m[1]}</span>{m[2]}{m[3]}{'\n'}</span>;
    }
    if (/^(Summary|Validation|Build in)\b/.test(line)) return <span key={key} className="t-hl">{line}{'\n'}</span>;
    if (/^\s*→/.test(line)) return <span key={key} className="t-d">{line}{'\n'}</span>;
    return <span key={key}>{line}{'\n'}</span>;
  }
  if (lang === 'tree') {
    const [path, comment] = line.split(/\s{2,}#\s?/);
    const branch = path.match(/^[\s│├└─]*/)?.[0] ?? '';
    return (
      <span key={key}>
        <span className="t-d">{branch}</span>
        <span className={path.trim().endsWith('/') ? 't-s' : undefined}>{path.slice(branch.length)}</span>
        {comment ? <span className="t-d">{'  # '}{comment}</span> : null}
        {'\n'}
      </span>
    );
  }
  if (lang === 'cisco') {
    if (/^\s*!/.test(line)) return <span key={key} className="t-d">{line}{'\n'}</span>;
    return <span key={key}>{line}{'\n'}</span>;
  }
  return <span key={key}>{line}{'\n'}</span>;
}

const LANG_LABEL: Record<string, string> = { bash: 'Terminal', sh: 'Terminal', powershell: 'PowerShell', console: 'Output', tree: 'Files', cisco: 'Cisco IOS', json: 'JSON', text: 'Text' };

/** Replaces MDX <pre>: language label, copy button (except for output) and line highlighting */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const code = isValidElement(children) ? (children as ReactElement<{ className?: string; children?: ReactNode }>) : null;
  const lang = code?.props.className?.replace('language-', '') ?? 'text';
  // Normalize Windows line endings: a stray \r breaks line splitting and highlighting
  const text = String(code?.props.children ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const copyable = lang !== 'console' && lang !== 'tree';
  return (
    <div className="doc-code" data-lang={lang}>
      <div className="doc-code-bar">
        <span>{LANG_LABEL[lang] ?? lang}</span>
        {copyable ? <CopyButton text={text} labels={COPY_LABELS} /> : null}
      </div>
      <pre><code>{text.split('\n').map((l, i) => highlightLine(l, lang, i))}</code></pre>
    </div>
  );
}
