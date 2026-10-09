import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getDictionary, isLocale } from '@/i18n/config';
import { rich } from '@/lib/rich';
import { INSTALL_CMD, REPO_URL, SECTION_COLORS } from '@/lib/site';
import { VERSION } from '@/lib/version';
import { CopyCommand } from '@/components/CopyCommand';
import { Flow } from '@/components/Flow';
import { Install } from '@/components/Install';
import { Nav } from '@/components/Nav';
import { RevealObserver } from '@/components/RevealObserver';
import { Features, SectionHead, Steps, Toolkit } from '@/components/Sections';
import { Tour } from '@/components/Tour';
import { Usage } from '@/components/Usage';

const REPO = 'whetstone-dev/network-engineering';
const WORKS_COLORS = ['green', 'teal', 'blue', 'violet'];
const STAT_COLORS = ['blue', 'violet', 'teal', 'rose', 'amber'];

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) throw new Error(`Unsupported language: ${lang}`);
  const t = getDictionary(lang);
  const c = SECTION_COLORS;

  return (
    <>
      <Nav lang={lang} t={t.nav} />
      <main id="top">
        {/* ============ Hero ============ */}
        <section className="hero">
          <div className="mesh" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          <div className="wrap">
            <a className="pill-badge" href={`${REPO_URL}/releases`} target="_blank" rel="noopener noreferrer">
              <b>v{VERSION}</b> {t.hero.badge} <span className="arrow" aria-hidden="true">→</span>
            </a>
            <h1>
              {t.hero.titleA} <span className="h1-accent">{t.hero.titleAccent}</span>
            </h1>
            <p className="lede">{rich(t.hero.lede)}</p>
            <div className="install-row">
              <CopyCommand cmd={INSTALL_CMD} highlight={REPO} copy={t.copy} />
              <Link className="btn btn-ghost" href={`/${lang}/docs/quickstart/`}>{t.hero.readDocs} <span aria-hidden="true">→</span></Link>
            </div>
            <div className="works">
              {t.hero.works.map((w, i) => (
                <span key={w} data-c={WORKS_COLORS[i]}><i aria-hidden="true" />{w}</span>
              ))}
            </div>
          </div>

          {/* ============ Live tour ============ */}
          <div className="tour">
            <div className="wrap">
              <Tour t={t.tour} />
              <p className="tour-note">{rich(t.tour.note)}</p>
              <div className="stats reveal">
                {t.stats.map((s, i) => (
                  <div className="stat" key={s.label} data-c={STAT_COLORS[i]}>
                    <b>{s.value}</b>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============ 01 How it works ============ */}
        <section className="block" id="how" data-c={c.how.color}>
          <div className="section-glow" style={{ left: '-10%' } as CSSProperties} aria-hidden="true" />
          <div className="wrap">
            <SectionHead num="01" vlan={c.how.vlan} head={t.how} />
            <Flow t={t.how} />
          </div>
        </section>

        {/* ============ 02 Usage examples ============ */}
        <section className="block" id="examples" data-c={c.usage.color}>
          <div className="section-glow" style={{ right: '-8%' } as CSSProperties} aria-hidden="true" />
          <div className="wrap">
            <SectionHead num="02" vlan={c.usage.vlan} head={t.usage} />
            <Usage t={t.usage} />
          </div>
        </section>

        {/* ============ 03 What's inside ============ */}
        <section className="block" id="features" data-c={c.features.color}>
          <div className="section-glow" style={{ left: '20%' } as CSSProperties} aria-hidden="true" />
          <div className="wrap">
            <SectionHead num="03" vlan={c.features.vlan} head={t.features} />
            <Features t={t.features} />
          </div>
        </section>

        {/* ============ 04 Toolkit ============ */}
        <section className="block" id="toolkit" data-c={c.toolkit.color}>
          <div className="section-glow" style={{ right: '5%' } as CSSProperties} aria-hidden="true" />
          <div className="wrap">
            <SectionHead num="04" vlan={c.toolkit.vlan} head={t.toolkit} />
            <Toolkit t={t.toolkit} copy={t.copy} docsHref={`/${lang}/docs/cli-reference/`} />
          </div>
        </section>

        {/* ============ 05 Install ============ */}
        <section className="block" id="install" data-c={c.install.color}>
          <div className="section-glow" style={{ left: '-5%' } as CSSProperties} aria-hidden="true" />
          <div className="wrap">
            <SectionHead num="05" vlan={c.install.vlan} head={t.install} />
            <div className="install">
              <Install t={t.install} copy={t.copy} />
              <Steps t={t.install} />
            </div>

            <div className="cta-wrap reveal" id="cta">
              <div className="cta-orbs" aria-hidden="true"><i /><i /><i /></div>
              <div className="cta">
                <h2>{rich(t.cta.title)}</h2>
                <div className="install-row">
                  <CopyCommand cmd={INSTALL_CMD} highlight={REPO} copy={t.copy} />
                  <a className="btn btn-primary" href={REPO_URL} target="_blank" rel="noopener noreferrer">{t.cta.github} ↗</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>v{VERSION} · MIT · © Juan David (Juanfrxz)</span>
          <nav aria-label={t.footer.linksLabel}>
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noopener noreferrer">{t.footer.changelog}</a>
            <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer">{t.footer.contributing}</a>
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">{t.footer.license}</a>
          </nav>
        </div>
      </footer>
      <RevealObserver />
    </>
  );
}
