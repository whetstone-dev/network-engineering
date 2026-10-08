# Diagramas interactivos de red

## Contenido
- [Decisión de tecnología](#decisión-de-tecnología)
- [Generar un diagrama](#generar-un-diagrama)
- [Qué muestra y qué permite hacer](#qué-muestra-y-qué-permite-hacer)
- [Vista L3 y comparación de versiones](#vista-l3-y-comparación-de-versiones)
- [Controlar el layout](#controlar-el-layout)
- [Estados y confianza](#estados-y-confianza)
- [Entregar el diagrama](#entregar-el-diagrama)
- [Mermaid (secundario)](#mermaid-secundario)
- [Extender el renderer](#extender-el-renderer)

## Decisión de tecnología

| Opción | Interactividad | Dependencias | Offline/local | Generación desde el modelo | Veredicto |
|---|---|---|---|---|---|
| Mermaid | Baja (sin inspector) | Runtime JS de Mermaid | Necesita el visor | Muy fácil | Exportación secundaria |
| Graphviz | Nula (imagen) | Binario `dot` (no instalado) | Sí | Fácil | Descartado |
| React / React Flow | Alta | Build + npm | Requiere bundle | Media | Sobreingeniería para un artefacto |
| Cytoscape.js / D3 | Alta | Librería de 300+ KB (CDN o embebida) | Solo si se embebe | Media | Innecesario a esta escala |
| **SVG + JS vanilla embebido** | Alta (inspector, filtros, trazas) | **Ninguna** | **Sí, un solo .html** | Directa (layout en Node) | **Elegido** |

Motivos: un único archivo HTML autocontenido que abre con doble clic, publicable como Artifact, sin CDN ni build, y con layout **determinista** calculado en `scripts/lib/layout.ts` según roles de red. El viewer (`assets/viewer.js`, `assets/viewer.css`) se incrusta al generar.

## Generar un diagrama

```bash
node scripts/netlab.ts render red.net.json                 # → red.html junto al modelo
node scripts/netlab.ts render red.net.json -o salida.html
node scripts/netlab.ts build red.net.json                  # diagrama + docs + configs
```
Siempre ejecute `validate` antes de entregar: el diagrama muestra los errores, pero el usuario no debe recibir una red rota sin saberlo.

## Qué muestra y qué permite hacer

- **Equipos** con íconos propios por tipo (router, switch, switch L3, firewall, nube/ISP, PC, laptop, servidor, AP, router inalámbrico, WLC, teléfono, impresora, IoT, módem, hub) y debajo: id, modelo e IP principal (o IP DHCP simulada).
- **Enlaces** por medio: cobre (sólido), cruzado (guiones), trunk (grueso), serial (rojo), fibra (naranja), inalámbrico (punteado), consola. Etiquetas de puerto en cada extremo (`Gi0/1 .1`) y central (subred, `802.1Q 10,20,30` o `VLAN 10`). Luces de enlace por extremo (verde/rojo/ámbar) al estilo de Packet Tracer.
- **Interacción**: clic en equipo → inspector (propiedades, interfaces con IP/VLAN/peer, tabla de routing simulada, servicios, configuración generada con botón Copiar, comandos de verificación, hallazgos). Clic en enlace → extremos, VLAN, subred, estado.
- **Filtros**: por VLAN (atenúa lo que no transporta esa VLAN), búsqueda por nombre/IP (`/`), capas de etiquetas (Puertos, IP, Etiquetas, Color VLAN).
- **Diagnóstico**: marcadores «!» en equipos/enlaces con errores; pestaña con todos los hallazgos, clic para ubicar el sujeto.
- **Pruebas**: lista de pings simulados; clic resalta el camino de ida y vuelta, incluidos los switches intermedios.
- **Tablas**: direccionamiento, VLAN, conexiones, puertos, inventario.
- **Exportar**: SVG y PNG del diagrama; **Layout** copia las posiciones para guardarlas en el modelo.
- **STP**: las luces de los puertos bloqueados (alternate) se ven ámbar; con el filtro de VLAN se muestran los bloqueos de esa VLAN. El root bridge lleva la etiqueta «root STP» y el inspector lista root/bloqueos por VLAN.
- **HSRP e IPv6**: el inspector muestra el rol HSRP de cada interfaz (activo/standby, prioridad) y la tabla IPv6 simulada (OSPFv3).
- Pan (arrastrar fondo), zoom (rueda, botones), arrastrar equipos, tema claro/oscuro, responsive.

## Vista L3 y comparación de versiones

- Botón **L3**: dibuja solo routers, switches multicapa, firewalls e Internet, y cada subred como una «píldora» (CIDR, VLAN, cantidad de hosts, HSRP). Útil para explicar routing y planes de direccionamiento. Clic en una subred: gateways, IP virtual HSRP activa, switches y equipos del dominio. Búsqueda, filtro por VLAN y resaltado de pruebas funcionan también aquí.
- `netlab diff viejo.net.json nuevo.net.json -o cambios.html`: el diagrama del modelo nuevo con equipos/enlaces **agregados** (verde), **modificados** (ámbar punteado) y **eliminados** (fantasmas rojos en su posición anterior), más la pestaña **Cambios** (detalle por campo, problemas nuevos/resueltos y pruebas que cambian).

## Controlar el layout

- `hierarchical` (defecto): filas por función. Raíz = equipos de mayor jerarquía (Internet/ISP, firewall/routers de borde). Pares del mismo nivel conectados entre sí (routers WAN, dos cores) quedan en la misma fila.
- Ajustes sin coordenadas: `role` (`internet`, `edge`, `core`, `distribution`, `access`, `server`, `endpoint`, `wireless`) o `tier` numérico.
- `circular`: anillos y mallas (infraestructura en círculo, hosts hacia afuera).
- `manual`: el usuario arrastra equipos en el HTML, pulsa **Layout**, y el JSON se pega en `layout` del modelo (`algorithm: "manual"`, `positions`). Los equipos sin posición se ubican automáticamente.
- `zones`: cajas punteadas alrededor de grupos (DMZ, sede, granja de servidores).

## Estados y confianza

| Campo | Valores | Visual |
|---|---|---|
| `devices[].status`, `interfaces[].status`, `links[].status` | `up`, `down`, `warning`, `error`, `unknown` | Luz de estado del equipo y luces de extremo; enlace `down` en rojo discontinuo |
| `interfaces[].shutdown` | `true` | Extremo rojo (DOWN) |
| `confidence` | `confirmed`, `inferred`, `unknown` | Borde discontinuo (`~`) o punteado (`?`) |
| Hallazgos del validador | error / warning | Marcador «!» rojo/ámbar |

El estado por defecto es "según diseño" (UP). Use `status` solo para reflejar observaciones reales (capturas, `show`), nunca para inventar estados.

## Entregar el diagrama

- **Local**: el `.html` se abre con doble clic en cualquier navegador moderno, sin conexión.
- **Artifact** (si la herramienta Artifact está disponible en la sesión): el HTML es compatible (sin scripts externos, tokens de color con modo oscuro, responsive). Publicarlo solo si el usuario quiere compartirlo o lo pide; el HTML local siempre se entrega.
- Indique la ruta del archivo y qué revisar primero (pestaña Diagnóstico si hay errores, pestaña Pruebas).

## Mermaid (secundario)

`node scripts/netlab.ts mermaid red.net.json -o red.mmd` genera un `flowchart` para README/wikis (subgrafos por zona, trunks con `===`, inalámbricos con `-.-`). No sustituye al HTML: no tiene inspector ni estados.

## Extender el renderer

- Nuevo tipo de equipo: agregarlo a `DeviceType` (`scripts/lib/model.ts`), al rango de layout (`baseRank` en `layout.ts`), y un `<symbol>` en `SYMBOLS` + `ICON` de `assets/viewer.js`.
- Nuevo dato en el inspector: añadirlo en `buildViewerData` (`scripts/lib/render.ts`) y mostrarlo en `renderInspector` (viewer).
- Mantener el viewer sin dependencias externas: es un requisito de portabilidad.
