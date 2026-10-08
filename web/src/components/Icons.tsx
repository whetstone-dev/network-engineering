import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export const LogoIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={2} {...p}><circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="19" r="2.2" /><circle cx="19" cy="19" r="2.2" /><path d="M12 7.2v4.3M12 11.5 6.4 17.2M12 11.5l5.6 5.7M7.2 19h9.6" /></svg>
);
export const MoonIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.8} {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
);
export const SunIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.8} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
);
export const CopyIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.8} {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>
);
export const CheckIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={2.2} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const LockIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={2} {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const ReplayIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={2} {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
);
export const TopologyIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8.5 6h7M7.2 8.2l3.6 7.6M16.8 8.2l-3.6 7.6" /></svg>
);
export const CodeIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="m8 8-4 4 4 4M16 8l4 4-4 4" /></svg>
);
export const DocIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
);
export const ChartIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></svg>
);
export const ShieldIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="M12 3 4 7v5c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V7z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
);
export const SlashCodeIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" /></svg>
);
export const AlertIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
);
export const BookIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M8 7h7" /></svg>
);
export const ImportIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
);
export const SearchIcon = (p: IconProps) => (
  <svg {...base} strokeWidth={1.9} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
