import type { ComponentType } from 'react';

// Docs navigation. Order here = sidebar order = previous/next order.
export interface DocPage {
  slug: string;
  title: string;
  description: string;
  /** Minutes, shown in the page header */
  minutes?: number;
  /** Pages without content yet are listed as "Soon" and not generated */
  ready: boolean;
}

export interface DocGroup {
  title: string;
  color: 'blue' | 'teal' | 'violet' | 'amber' | 'rose' | 'green';
  pages: DocPage[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    title: 'Getting started',
    color: 'blue',
    pages: [
      { slug: 'introduction', title: 'Introduction', description: 'What the skill does and why the network model is the source of truth.', minutes: 3, ready: true },
      { slug: 'installation', title: 'Installation', description: 'Install with the Skills CLI or git, per user or per project, and keep it updated.', minutes: 3, ready: true },
      { slug: 'quickstart', title: 'Quickstart', description: 'Your first Packet Tracer lab in five minutes: ask, validate, explore the diagram and assemble it.', minutes: 5, ready: true },
    ],
  },
  {
    title: 'Using the skill',
    color: 'teal',
    pages: [
      { slug: 'writing-requests', title: 'Writing good requests', description: 'How to ask for designs, labs, lessons, troubleshooting, audits and change reviews.', minutes: 6, ready: true },
    ],
  },
  {
    title: 'netlab CLI',
    color: 'amber',
    pages: [
      { slug: 'cli-reference', title: 'Command reference', description: 'Every netlab command, its flags, outputs and exit codes.', minutes: 8, ready: true },
    ],
  },
  {
    title: 'Safety & limits',
    color: 'rose',
    pages: [
      { slug: 'safety-and-limits', title: 'Quality gates, secrets & limits', description: 'What the validation gate blocks, how secrets are redacted and what the simulation does not model.', minutes: 5, ready: true },
    ],
  },
];

export const ALL_PAGES: (DocPage & { group: DocGroup })[] = DOC_GROUPS.flatMap((g) => g.pages.map((p) => ({ ...p, group: g })));
export const READY_PAGES = ALL_PAGES.filter((p) => p.ready);

// Static map so the bundler knows every MDX file (no dynamic paths)
export const DOC_CONTENT: Record<string, () => Promise<{ default: ComponentType }>> = {
  introduction: () => import('@/content/docs/introduction.mdx'),
  installation: () => import('@/content/docs/installation.mdx'),
  quickstart: () => import('@/content/docs/quickstart.mdx'),
  'writing-requests': () => import('@/content/docs/writing-requests.mdx'),
  'cli-reference': () => import('@/content/docs/cli-reference.mdx'),
  'safety-and-limits': () => import('@/content/docs/safety-and-limits.mdx'),
};

export function findPage(slug: string) {
  const i = READY_PAGES.findIndex((p) => p.slug === slug);
  if (i < 0) return null;
  return { page: READY_PAGES[i], prev: READY_PAGES[i - 1] ?? null, next: READY_PAGES[i + 1] ?? null };
}

export const DOCS_SOURCE_DIR = 'web/src/content/docs';
