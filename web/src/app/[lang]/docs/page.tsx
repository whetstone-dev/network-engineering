import type { Metadata } from 'next';
import Link from 'next/link';
import { getDictionary, isLocale } from '@/i18n/config';
import { DOC_GROUPS } from '@/lib/docs';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const t = getDictionary(lang).docs;
  return { title: `${t.title} — network-engineering`, description: t.description };
}

// Docs home: every group with its pages (pages without content yet show as "Soon")
export default async function DocsHome({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) throw new Error(`Unsupported language: ${lang}`);
  const t = getDictionary(lang).docs;

  return (
    <div className="doc-layout">
      <article className="doc-article">
        <header className="doc-header" data-c="blue">
          <h1>{t.title}</h1>
          <p className="doc-lead">{t.description}</p>
          {t.notTranslated ? <p className="doc-notice">{t.notTranslated}</p> : null}
        </header>
        <div className="docs-index">
          {DOC_GROUPS.map((g) => (
            <section key={g.title} className="docs-index-group" data-c={g.color}>
              <h2><i aria-hidden="true" />{g.title}</h2>
              <div className="doc-cards">
                {g.pages.map((p) =>
                  p.ready ? (
                    <Link key={p.slug} href={`/${lang}/docs/${p.slug}/`} className="doc-card">
                      <strong>{p.title} <span aria-hidden="true">→</span></strong>
                      <span>{p.description}</span>
                    </Link>
                  ) : (
                    <div key={p.slug} className="doc-card" aria-disabled="true">
                      <strong>{p.title} <em>{t.soon}</em></strong>
                      <span>{p.description}</span>
                    </div>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
