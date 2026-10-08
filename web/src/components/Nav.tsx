'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { locales, type Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/types';
import { REPO_URL, SECTION_COLORS } from '@/lib/site';
import { LogoIcon, MoonIcon, SunIcon } from './Icons';

interface NavProps {
  lang: Locale;
  t: Dictionary['nav'];
}

function guardarPreferencia(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura solo esta visita
  }
}

function temaActual(): 'dark' | 'light' {
  const forzado = document.documentElement.dataset.theme;
  if (forzado === 'dark' || forzado === 'light') return forzado;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Nav({ lang, t }: NavProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toggleTheme(): void {
    const next = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    guardarPreferencia('ne-theme', next);
  }

  const links = [
    { href: '#how', label: t.how, c: SECTION_COLORS.how.color },
    { href: '#examples', label: t.examples, c: SECTION_COLORS.usage.color },
    { href: '#toolkit', label: t.toolkit, c: SECTION_COLORS.toolkit.color },
    { href: '#install', label: t.install, c: SECTION_COLORS.install.color },
  ];

  return (
    <header className="nav" data-scrolled={scrolled}>
      <div className="wrap">
        <a className="brand" href="#top" aria-label="network-engineering">
          <span className="brand-mark"><LogoIcon /></span>
          <span className="brand-text">network-engineering</span>
        </a>
        <nav className="nav-links" aria-label={t.sectionsLabel}>
          {links.map((l) => (
            <a key={l.href} href={l.href} data-c={l.c}><i aria-hidden="true" />{l.label}</a>
          ))}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        </nav>
        <div className="lang" role="group" aria-label={t.languageLabel}>
          {locales.map((l) => (
            <Link key={l} href={`/${l}/`} hrefLang={l} aria-current={l === lang} onClick={() => guardarPreferencia('ne-lang', l)}>
              {l.toUpperCase()}
            </Link>
          ))}
        </div>
        <button className="icon-btn" type="button" onClick={toggleTheme} aria-label={t.themeLabel}>
          <MoonIcon className="theme-moon" />
          <SunIcon className="theme-sun" />
        </button>
        <a className="btn btn-primary" href="#install" aria-label={t.installCta}>
          {t.install}<span className="long">skill</span>
        </a>
      </div>
    </header>
  );
}
