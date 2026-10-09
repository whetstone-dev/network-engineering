import type { ReactNode } from 'react';
import { getDictionary, isLocale } from '@/i18n/config';
import { DOC_GROUPS } from '@/lib/docs';
import { REPO_URL } from '@/lib/site';
import { VERSION } from '@/lib/version';
import { Nav } from '@/components/Nav';
import { DocsSidebar } from '@/components/docs/DocsSidebar';

export default async function DocsLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) throw new Error(`Unsupported language: ${lang}`);
  const t = getDictionary(lang);

  return (
    <>
      <Nav lang={lang} t={t.nav} />
      <div className="docs-shell wrap">
        <DocsSidebar
          lang={lang}
          groups={DOC_GROUPS}
          labels={{ sidebarLabel: t.docs.sidebarLabel, soon: t.docs.soon, menu: t.docs.menu, title: t.docs.title }}
        />
        <div className="docs-main">{children}</div>
      </div>
      <footer>
        <div className="wrap">
          <span>v{VERSION} · MIT · © Juan David (Juanfrxz)</span>
          <nav aria-label={t.footer.linksLabel}>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer">{t.footer.changelog}</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
