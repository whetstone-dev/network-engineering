import type { MDXComponents } from 'mdx/types';
import { CodeBlock } from '@/components/docs/CodeBlock';
import { Callout, Card, Cards, H2, H3, Prompt, Step, Steps } from '@/components/docs/DocParts';

// Components available in every MDX page (required by @next/mdx in the App Router)
const components: MDXComponents = {
  h2: H2,
  h3: H3,
  pre: CodeBlock,
  table: (props) => <div className="doc-table"><table {...props} /></div>,
  Callout,
  Steps,
  Step,
  Prompt,
  Cards,
  Card,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
