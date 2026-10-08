import type { NextConfig } from 'next';

// On GitHub Pages the site lives under /network-engineering; locally it is served at the root
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
