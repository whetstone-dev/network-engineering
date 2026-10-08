import type { Metadata } from 'next';
import { defaultLocale, localeNames, locales } from '@/i18n/config';
import { BASE_PATH } from '@/lib/site';

export const metadata: Metadata = { title: 'network-engineering', robots: { index: false } };

// Export estático: no hay middleware, así que el idioma se elige en el navegador.
// Inglés por defecto; solo se usa otro idioma si el visitante lo eligió antes en el selector.
const script = `(function(){
  var soportados=${JSON.stringify(locales)}, elegido='${defaultLocale}';
  try{var g=localStorage.getItem('ne-lang');if(soportados.indexOf(g)>=0)elegido=g}catch(e){}
  location.replace('${BASE_PATH}/'+elegido+'/'+location.hash);
})();`;

export default function RootRedirect() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', gap: 12 }}>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <noscript>
        <p>
          {locales.map((l) => (
            <a key={l} href={`${BASE_PATH}/${l}/`} style={{ margin: '0 8px' }}>{localeNames[l]}</a>
          ))}
        </p>
      </noscript>
    </main>
  );
}
