import type { ReactNode } from 'react';
import { fontVars } from '../fonts';
import '../globals.css';

// Root layout only for "/", which redirects to the visitor's language
export default function RootRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
