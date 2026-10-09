import type { Metadata } from 'next';
import Link from 'next/link';
import { getDictionary, isLocale } from '@/i18n/config';
import { DOC_CONTENT, DOCS_SOURCE_DIR, READY_PAGES, findPage } from '@/lib/docs';
import { REPO_URL } from '@/lib/site';
import { DocsToc } from '@/components/docs/DocsToc';

export const dynamicParams = false;

// Combined with the parent's languages: one page per (lang, slug)
export function generateStaticParams() {
  return READY_PAGES.map((p) => ({ slug: p.slug }));
}

type Params = Promise<{ lang: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const found = findPage(slug);
  if (!found) return {};
  return { title: `${found.page.title} — network-engineering docs`, description: found.page.description };
}

export default async function DocPage({ params }: { params: Params }) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) throw new Error(`Unsupported language: ${lang}`);
  const found = findPage(slug);
  const load = DOC_CONTENT[slug];
  if (!found || !load) throw new Error(`Unknown docs page: ${slug}`);
  const t = getDictionary(lang).docs;
  const { page, prev, next } = found;
  const { default: Content } = await load();

  return (
    <div className="doc-layout">
      <article className="doc-article">
        <header className="doc-header" data-c={page.group.color}>
          <p className="doc-eyebrow"><i aria-hidden="true" />{page.group.title}</p>
          <h1>{page.title}</h1>
          <p className="doc-lead">{page.description}</p>
          <div className="doc-meta">
            {page.minutes ? <span>{page.minutes} {t.minutes}</span> : null}
            <a href={`${REPO_URL}/blob/main/${DOCS_SOURCE_DIR}/${slug}.mdx`} target="_blank" rel="noopener noreferrer">{t.edit} ↗</a>
          </div>
          {t.notTranslated ? <p className="doc-notice">{t.notTranslated}</p> : null}
        </header>
        <div className="doc-body" lang="en">
          <Content />
        </div>
        <nav className="doc-pager" aria-label={`${t.previous} / ${t.next}`}>
          {prev ? (
            <Link href={`/${lang}/docs/${prev.slug}/`} className="doc-pager-link"><small>← {t.previous}</small>{prev.title}</Link>
          ) : <span />}
          {next ? (
            <Link href={`/${lang}/docs/${next.slug}/`} className="doc-pager-link next"><small>{t.next} →</small>{next.title}</Link>
          ) : <span />}
        </nav>
      </article>
      <DocsToc label={t.onThisPage} />
    </div>
  );
}
