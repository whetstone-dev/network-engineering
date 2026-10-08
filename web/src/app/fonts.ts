import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';

// Fuentes autoalojadas en el build (sin peticiones a Google en tiempo de ejecución)
export const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
export const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
export const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: 'italic', variable: '--font-serif', display: 'swap' });

export const fontVars = `${sans.variable} ${mono.variable} ${serif.variable}`;

// Aplica el tema guardado antes de pintar, para evitar el destello
export const THEME_SCRIPT = `try{var t=localStorage.getItem('ne-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}`;
