// Contract every language must fulfill. Copy supports lightweight markup:
// {code|...} {b|...} {em|...} and, in the terminal, {u|...} {d|...} {s|...} {ok|...} {er|...} {nt|...} {sk|...} {hl|...}

export interface SectionHead {
  tag: string;
  title: string;
  sub?: string;
}

export interface ExampleCopy {
  tab: string;
  level: string;
  status: string;
  desc: string;
}

export interface UsagePrompt {
  id: string;
  q: string;
  tag: string;
  term: string;
}

export interface FeatureCopy {
  title: string;
  body: string;
}

export interface InstallTab {
  label: string;
  blocks: { comment: string; cmd: string; prompt: '$' | '>' }[];
  hint: string;
}

export interface Dictionary {
  meta: { title: string; description: string };
  nav: {
    how: string;
    examples: string;
    toolkit: string;
    install: string;
    installCta: string;
    themeLabel: string;
    languageLabel: string;
    sectionsLabel: string;
    docs: string;
  };
  copy: { label: string; done: string; failed: string };
  hero: {
    badge: string;
    titleA: string;
    titleAccent: string;
    lede: string;
    readDocs: string;
    works: string[];
  };
  tour: {
    open: string;
    note: string;
    tablistLabel: string;
    iframeTitle: string;
    examples: ExampleCopy[];
  };
  stats: { value: string; label: string }[];
  how: SectionHead & {
    nodes: { key: string; title: string; body: string }[];
    buildKey: string;
    outputs: { file: string; label: string }[];
    foot: string;
    replay: string;
  };
  usage: SectionHead & { prompts: UsagePrompt[]; foot: string; tablistLabel: string };
  features: SectionHead & {
    validate: FeatureCopy;
    diagram: FeatureCopy;
    configs: FeatureCopy;
    honest: FeatureCopy & { chips: string[] };
    edu: FeatureCopy;
    import: FeatureCopy;
    analyze: FeatureCopy & { rows: { level: string; text: string }[] };
  };
  toolkit: SectionHead & {
    groups: { title: string; sub: string; items: { cmd: string; desc: string }[] }[];
    ciNote: string;
    docsLink: string;
  };
  install: SectionHead & {
    tablistLabel: string;
    tabs: InstallTab[];
    steps: { title: string; body: string }[];
    reqs: string[];
  };
  cta: { title: string; github: string };
  footer: { changelog: string; contributing: string; license: string; linksLabel: string };
  docs: {
    title: string;
    description: string;
    sidebarLabel: string;
    onThisPage: string;
    previous: string;
    next: string;
    edit: string;
    soon: string;
    menu: string;
    minutes: string;
    /** Shown when the docs content is not available in this language yet */
    notTranslated?: string;
  };
}
