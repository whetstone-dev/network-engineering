import type { Dictionary } from './types';
import { es } from './dictionaries/es';
import { en } from './dictionaries/en';

// Para agregar un idioma: crear dictionaries/<código>.ts y registrarlo aquí
export const locales = ['en', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = { en: 'English', es: 'Español' };

const dictionaries: Record<Locale, Dictionary> = { en, es };

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function getDictionary(locale: string): Dictionary {
  if (!isLocale(locale)) throw new Error(`Idioma no soportado: ${locale}`);
  return dictionaries[locale];
}
