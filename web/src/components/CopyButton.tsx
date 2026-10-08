'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

interface CopyButtonProps {
  text: string;
  labels: { label: string; done: string; failed: string };
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Respaldo para contextos sin permiso de portapapeles
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function CopyButton({ text, labels }: CopyButtonProps) {
  const [estado, setEstado] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleClick(): Promise<void> {
    const ok = await copyToClipboard(text);
    setEstado(ok ? 'done' : 'failed');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setEstado('idle'), 1600);
  }

  return (
    <button className="copy" type="button" onClick={handleClick} aria-label={labels.label} data-done={estado === 'done'}>
      <CopyIcon className="i-copy" />
      <CheckIcon className="i-check" />
      <span className="sr-only" aria-live="polite">
        {estado === 'done' ? labels.done : estado === 'failed' ? labels.failed : ''}
      </span>
    </button>
  );
}
