import type { NextConfig } from 'next';
import createMDX from '@next/mdx';

// On GitHub Pages the site lives under /network-engineering; locally it is served at the root
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
};

// Docs pages are MDX files in src/content/docs (rendered through src/mdx-components.tsx)
// GitHub-flavored Markdown (tables, task lists). Plugins go by name so Turbopack can load them.
const withMDX = createMDX({ options: { remarkPlugins: [['remark-gfm', {}]] } });

export default withMDX(nextConfig);
