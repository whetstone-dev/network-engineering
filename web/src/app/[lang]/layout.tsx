import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { getDictionary, isLocale, locales } from '@/i18n/config';
import { BASE_PATH } from '@/lib/site';
import { fontVars, THEME_SCRIPT } from '../fonts';
import '../globals.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = getDictionary(lang);
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: { languages: Object.fromEntries(locales.map((l) => [l, `/${l}/`])) },
    openGraph: { title: t.meta.title, description: t.meta.description, type: 'website', locale: lang },
    icons: { icon: [{ url: `${BASE_PATH}/icon.svg`, type: 'image/svg+xml' }, { url: `${BASE_PATH}/favicon.ico`, sizes: '48x48' }] },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0d13' },
  ],
};

export default async function LangLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) throw new Error(`Unsupported language: ${lang}`);
  return (
    <html lang={lang} className={fontVars} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
        {children}
      </body>
    </html>
  );
}
