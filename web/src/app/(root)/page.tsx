import type { Metadata } from 'next';
import { defaultLocale, localeNames, locales } from '@/i18n/config';
import { BASE_PATH } from '@/lib/site';

export const metadata: Metadata = { title: 'network-engineering', robots: { index: false } };

// Static export: there is no middleware, so the language is chosen in the browser.
// English by default; another language is used only if the visitor picked it in the switcher before.
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
