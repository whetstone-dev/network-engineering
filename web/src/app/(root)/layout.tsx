import type { ReactNode } from 'react';
import { fontVars } from '../fonts';
import '../globals.css';

// Layout raíz solo para "/", que redirige al idioma del visitante
export default function RootRedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
