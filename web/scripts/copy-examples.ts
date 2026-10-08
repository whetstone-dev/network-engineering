// Copia los diagramas renderizados de la skill a public/examples para que el sitio los incruste.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, '..', 'examples', 'rendered');
const destino = join(raiz, 'public', 'examples');

function copyExamples(): void {
  if (!existsSync(origen)) {
    throw new Error(`No existe ${origen}: ejecute "netlab build" de los ejemplos antes de compilar el sitio.`);
  }
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(destino, { recursive: true });
  const archivos = readdirSync(origen).filter((f) => f.endsWith('.html'));
  for (const archivo of archivos) cpSync(join(origen, archivo), join(destino, archivo));
  console.log(`Ejemplos copiados: ${archivos.length} → public/examples/`);
}

try {
  copyExamples();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
