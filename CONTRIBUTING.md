# Contribuir

¡Gracias por mejorar la skill! Reglas cortas:

## Antes de abrir un PR

```bash
node --test scripts/test/netlab.test.ts      # todas las pruebas deben pasar
for f in examples/*.net.json; do node scripts/netlab.ts validate "$f"; done
```

- Requiere Node.js ≥ 22.18 (TypeScript nativo). **No agregue dependencias npm**: la skill debe funcionar copiando la carpeta.
- Si cambia un generador o el viewer, vuelva a renderizar los ejemplos: `node scripts/netlab.ts render examples/<x>.net.json -o examples/rendered/<x>.html`.
- Nuevos campos del modelo: actualice `scripts/lib/model.ts`, `schemas/network-model.schema.json` y `references/model.md` (las pruebas validan todos los ejemplos contra el schema).
- Nuevos modelos de Packet Tracer: `scripts/lib/catalog.ts` (interfaces reales del equipo).

## Comandos Cisco

La regla principal de la skill es **no inventar comandos**. Todo comando nuevo en un generador o referencia debe:
- existir en la plataforma indicada (IOS 15, IOS XE, ASA, Packet Tracer) con esa sintaxis exacta;
- marcarse `[PT?]` / "verificar" si no hay certeza de soporte en Packet Tracer;
- venir acompañado de una prueba en `scripts/test/` cuando se genera desde el modelo.

## Estilo

- Comentarios y textos para el usuario en español; nombres de funciones en inglés.
- Manejo de errores explícito (mensajes claros, sin stack traces para errores de usuario).
- Preferir soluciones simples; documentar las aproximaciones de la simulación.

## Versiones

Se sigue [SemVer](https://semver.org/lang/es/). Agregue su cambio en `CHANGELOG.md` bajo **[Sin publicar]**. Para publicar: actualizar `metadata.version` en `SKILL.md`, mover las entradas a la nueva versión, crear el tag `vX.Y.Z` y la release.
