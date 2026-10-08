# Topologías de red: selección y modelado

## Contenido
- [Topologías físicas/lógicas básicas](#topologías-físicaslógicas-básicas)
- [Arquitecturas jerárquicas de campus](#arquitecturas-jerárquicas-de-campus)
- [Data center: spine-leaf](#data-center-spine-leaf)
- [Topologías WAN](#topologías-wan)
- [Tipos de red por alcance y contexto](#tipos-de-red-por-alcance-y-contexto)
- [Matriz de recomendación](#matriz-de-recomendación)
- [Procedimiento de decisión](#procedimiento-de-decisión)
- [Cómo se refleja en el modelo](#cómo-se-refleja-en-el-modelo)

Formato de cada ficha: **Qué es · Pros · Contras · Escala · SPOF** (punto único de falla) **· Cuándo · PT** (cómo modelarla en Packet Tracer).

## Topologías físicas/lógicas básicas

### Bus
- **Qué es:** todos los nodos sobre un medio compartido (coaxial 10BASE2/10BASE5), un dominio de colisión.
- **Pros:** poco cable, simple. **Contras:** colisiones, una rotura tumba el segmento, difícil de diagnosticar, obsoleta.
- **Escala:** muy baja. **SPOF:** el cable troncal y los terminadores.
- **Cuándo:** solo como concepto histórico/académico.
- **PT:** no se modela fielmente; aproximar con un **hub** (estrella física, bus lógico) solo con fines didácticos.

### Estrella
- **Qué es:** todos los nodos conectados a un dispositivo central (switch). Base de toda LAN Ethernet moderna.
- **Pros:** fallo de un cable afecta a un solo host; fácil de diagnosticar y ampliar. **Contras:** depende del equipo central.
- **Escala:** limitada por puertos del switch; se extiende como estrella extendida/árbol.
- **SPOF:** el switch central (y su fuente de energía).
- **Cuándo:** cualquier LAN pequeña; capa de acceso.
- **PT:** 1 switch 2960 + PCs con cable directo (copper straight-through).

### Anillo
- **Qué es:** cada nodo conectado a dos vecinos formando un lazo.
- **Pros:** un camino alternativo con pocos enlaces; común en fibra metro/industrial. **Contras:** en Ethernet requiere protocolo antibucle; una segunda falla parte el anillo; latencia crece con los saltos.
- **Escala:** media (convergencia y saltos limitan). **SPOF:** ninguno ante una sola falla de enlace; dos fallas aíslan nodos.
- **Cuándo:** industrial, metro Ethernet, enlaces de fibra entre edificios en campus lineales.
- **PT:** switches en lazo con STP/RSTP bloqueando un puerto, o routers en anillo con OSPF. Producción: REP/ERPS (G.8032) [HW].

### Malla completa (full mesh)
- **Qué es:** cada nodo enlazado con todos. **Enlaces = n(n−1)/2** (5 nodos → 10; 10 → 45; 20 → 190).
- **Pros:** máxima redundancia, camino directo entre cualquier par. **Contras:** costo y complejidad crecen cuadráticamente; muchas adyacencias de enrutamiento.
- **Escala:** baja (práctica hasta ~5–8 nodos). **SPOF:** ninguno.
- **Cuándo:** núcleo pequeño crítico (2–4 routers core), WAN entre pocas sedes críticas.
- **PT:** routers con módulos extra (HWIC/NIM) o switches L3 con puertos routed; OSPF para ver ECMP.

### Malla parcial
- **Qué es:** solo los nodos críticos tienen enlaces redundantes.
- **Pros:** buen equilibrio costo/redundancia. **Contras:** diseño y tráfico asimétricos; requiere análisis de fallas.
- **Escala:** media-alta. **SPOF:** los nodos con un solo enlace.
- **Cuándo:** WAN empresarial, cores regionales, interconexión de distribución.
- **PT:** igual que malla completa, omitiendo enlaces no críticos.

### Árbol (estrella extendida)
- **Qué es:** estrellas conectadas jerárquicamente a un nodo raíz.
- **Pros:** ordenado, ampliable por ramas. **Contras:** el fallo de una rama aísla todo lo que cuelga de ella; la raíz concentra tráfico.
- **Escala:** media. **SPOF:** raíz y uplinks de cada rama (si no hay redundancia).
- **Cuándo:** edificios con un switch por piso sin requisitos de redundancia.
- **PT:** switch raíz + switches por piso con cable directo (o cruzado si la versión lo requiere; PT soporta auto-MDIX en equipos recientes [PT?]).

### Híbrida
- **Qué es:** combinación de las anteriores (p. ej. estrella en acceso + malla parcial en core).
- **Pros:** cada capa usa la topología adecuada. **Contras:** más documentación y disciplina de diseño.
- **Escala:** alta. **SPOF:** depende del diseño de cada capa.
- **Cuándo:** prácticamente toda red real mediana/grande.
- **PT:** combinar bloques; usar notas/etiquetas para separar capas.

## Arquitecturas jerárquicas de campus

### Three-tier (core / distribución / acceso)
- **Qué es:**
  - **Acceso:** puertos de usuario, VLANs, PoE, port-security, QoS de borde.
  - **Distribución:** frontera L2/L3, inter-VLAN routing, FHRP, ACL/políticas, agregación de acceso.
  - **Core:** transporte rápido entre bloques de distribución; sin políticas pesadas.
- **Pros:** modular, aislamiento de fallas por bloque, escala a campus grandes. **Contras:** más equipos, costo y saltos.
- **Escala:** alta. **SPOF:** ninguno si cada capa es dual (2 core, 2 distribución por bloque, acceso con doble uplink).
- **Cuándo:** campus multi-edificio o cuando la distribución de cada edificio necesita interconectarse sin malla completa.
- **PT:** 2960 en acceso, 3560/3650 en distribución y core; EtherChannel entre capas; HSRP en distribución. Ver `references/switching.md`.

### Collapsed core (two-tier)
- **Qué es:** core y distribución fusionados en un par de switches L3; acceso conectado a ambos.
- **Pros:** menor costo, menos saltos, más simple. **Contras:** el par central concentra todo; escala limitada.
- **Escala:** media (un edificio o campus pequeño). **SPOF:** el core si es uno solo; ninguno si es par con FHRP/EtherChannel.
- **Cuándo:** pymes, sede única, la mayoría de proyectos académicos.
- **PT:** 2× 3560/3650 con HSRP y EtherChannel entre ellos + 2960 en acceso con uplink doble (STP bloqueará uno salvo que se use EtherChannel multichasis, no disponible en PT).

### Campus
- **Qué es:** red de una organización en uno o varios edificios cercanos, interconectados por fibra propia. Normalmente three-tier o collapsed core + módulo de borde (Internet/WAN) y de servidores.
- **Pros/Contras:** heredados de la arquitectura elegida.
- **Escala:** alta. **SPOF:** típicamente el borde (un solo ISP/firewall) si no se duplica.
- **Cuándo:** universidades, hospitales, sedes corporativas.
- **PT:** un "cluster" o área por edificio; enlaces entre edificios con fibra (módulos de fibra en switches/routers).

## Data center: spine-leaf

- **Qué es:** cada leaf se conecta a **todos** los spines; sin enlaces leaf-leaf ni spine-spine (salvo peer links MLAG/vPC). Cualquier par de servidores está a leaf→spine→leaf.
- **Pros:** latencia predecible, ECMP con todos los spines activos, escala horizontal (añadir leaf = más puertos; añadir spine = más ancho de banda). **Contras:** mucho cableado, requiere L3 + overlay (VXLAN/EVPN) para extender L2.
- **Escala:** muy alta (limitada por puertos del spine). **SPOF:** ninguno si cada leaf tiene ≥2 spines y servidores con doble conexión.
- **Cuándo:** tráfico **este-oeste** alto (virtualización, microservicios, almacenamiento). No aporta en una oficina.
- **PT:** switches multilayer (3650) con enlaces routed (`no switchport`) y OSPF para ver ECMP. VXLAN/EVPN, MLAG/vPC: [HW].
- **Contraste:** DC tradicional usa three-tier (acceso/agregación/core) optimizado para tráfico norte-sur.

## Topologías WAN

| WAN | Qué es | Pros | Contras | SPOF | Cuándo |
|---|---|---|---|---|---|
| Punto a punto | Enlace dedicado entre 2 sedes | Simple, predecible | No escala; costo por enlace | El enlace (sin respaldo) | 2 sedes |
| Hub-and-spoke | Sucursales conectan solo con la central | Barato, políticas centralizadas | Tráfico spoke-spoke pasa por el hub; latencia | El hub | Muchas sucursales con tráfico hacia la central |
| Full mesh | Todas las sedes entre sí | Redundancia, rutas directas | n(n−1)/2 circuitos/túneles | Ninguno | Pocas sedes críticas con tráfico entre ellas |
| Malla parcial / dual-hub | Dos hubs o enlaces extra selectivos | Redundancia del hub | Mayor complejidad | Ninguno si hay dual hub | Producción con muchas sedes |

- **PT:** routers con enlaces seriales (módulo HWIC-2T / NIM-2T según modelo; `clock rate` en el lado DCE) o Ethernet; túneles GRE [PT?]; ISP simulado con un router o Cloud-PT. DMVPN, SD-WAN: [HW].
- **Producción:** MPLS L3VPN del proveedor, Internet + IPsec/DMVPN o SD-WAN; siempre con enlace de respaldo para sedes críticas.

## Tipos de red por alcance y contexto

| Tipo | Descripción | SPOF típico | Topología base | PT |
|---|---|---|---|---|
| **LAN** | Red local de un sitio | Switch central | Estrella / árbol / jerárquica | Switches 2960 + PCs |
| **WLAN** | Acceso inalámbrico 802.11; APs autónomos o ligeros + WLC | WLC único, switch PoE de los APs | Estrella (APs colgando del acceso) | AccessPoint-PT (autónomo, SSID por GUI); WLC + LAP en versiones recientes [PT?] |
| **Data center** | Servidores, almacenamiento, virtualización | Par de agregación si no hay ECMP | Spine-leaf (moderno) / three-tier (legado) | Multilayer + servidores |
| **SOHO** | Hogar u oficina pequeña (≤ ~20 usuarios, heurística) | Router todo-en-uno, ISP único | Estrella con router inalámbrico | Home Router / WRT300N + PCs/laptops [PT?] |
| **Enterprise** | Campus + WAN + DC + borde (firewall, DMZ, doble ISP) | Borde si es simple | Híbrida jerárquica | Bloques separados por área; ISP como Cloud/router |

WLAN, notas: producción con APs gestionados por controlador o nube, SSIDs mapeados a VLANs, HA del WLC [HW]; en laboratorio, un AP autónomo por VLAN basta para demostrar el concepto.

## Matriz de recomendación

Los umbrales de usuarios son **heurísticos** para orientar, no normas.

| Escenario | Usuarios | Sedes | Redundancia | Presupuesto | Este-oeste | Crecimiento | Recomendación |
|---|---|---|---|---|---|---|---|
| Hogar / micro oficina | < 20 | 1 | No | Bajo | Nulo | Bajo | **SOHO** (estrella con router todo-en-uno) |
| Pyme, 1 edificio | 20–200 | 1 | Opcional | Bajo-medio | Bajo | Moderado | **Estrella/árbol** con 1 switch L3 o router-on-a-stick |
| Pyme con disponibilidad | 50–500 | 1 | Sí | Medio | Bajo | Moderado | **Collapsed core** dual (2× L3, HSRP, EtherChannel) |
| Campus multi-edificio | 500+ | 1 campus | Sí | Medio-alto | Bajo-medio | Alto | **Three-tier** (core dedicado) |
| Central + sucursales | Cualquiera | 3+ | Según criticidad | Variable | Bajo | Alto | **WAN hub-and-spoke** (dual-hub en producción) |
| Pocas sedes críticas | Cualquiera | 2–5 | Alta | Alto | Inter-sede alto | Bajo | **WAN full mesh** o malla parcial |
| Dos sedes | Cualquiera | 2 | Según criticidad | Bajo | — | Bajo | **Punto a punto** (+ respaldo VPN) |
| Data center / virtualización | — (servidores) | 1 | Alta | Alto | **Alto** | Alto | **Spine-leaf** |
| Industrial / fibra lineal | Variable | 1 | Sí, con pocos enlaces | Medio | Bajo | Bajo | **Anillo** (REP/ERPS en producción; STP en lab) |
| Núcleo pequeño crítico | — | — | Máxima | Alto | — | Bajo | **Malla completa** entre 2–4 cores |

## Procedimiento de decisión

1. **Empieza simple:** SOHO → collapsed core → three-tier. Subir de nivel solo cuando un requisito lo exija.
2. ¿Más de una sede? Añade una WAN: 2 sedes = P2P; 3+ = hub-and-spoke; malla solo si hay tráfico crítico entre sucursales.
3. ¿Se exige alta disponibilidad? Duplica cada capa (2 core/distribución, doble uplink, FHRP) antes de añadir capas.
4. ¿Hay varios edificios cuyas distribuciones deben interconectarse? → three-tier con core dedicado.
5. **Spine-leaf solo para tráfico este-oeste de data center**; nunca para una LAN de oficina.
6. Diferenciar entregables:
   - **Académico/laboratorio:** priorizar demostrar conceptos (VLANs, STP, FHRP, enrutamiento); equipos mínimos que PT soporte.
   - **Producción:** priorizar disponibilidad, operación y presupuesto; validar características [HW] en el hardware real.
7. Documentar la elección: requisitos → topología → SPOF residuales aceptados.

## Cómo se refleja en el modelo

La skill guarda la topología en un modelo JSON (especificación completa en `references/model.md`). Campos relevantes:

- `devices[].role` ∈ `{internet, edge, core, distribution, access, server, endpoint, wireless}`
- `layout.algorithm` ∈ `{"hierarchical", "circular", "manual"}`

| Topología | Roles usados | `layout.algorithm` |
|---|---|---|
| SOHO | internet, edge, endpoint, wireless | hierarchical |
| Estrella / árbol | edge, access, endpoint | hierarchical |
| Collapsed core | internet, edge, core, access, server, endpoint, wireless | hierarchical |
| Three-tier / campus | internet, edge, core, distribution, access, server, endpoint, wireless | hierarchical |
| Spine-leaf | core (spines), access (leafs), server | hierarchical (spines arriba, leafs abajo) |
| Anillo | core o distribution (nodos del anillo) + endpoint | circular |
| Malla completa / parcial | core o edge | circular |
| WAN hub-and-spoke | edge (hub y spokes), internet | hierarchical (hub arriba) o manual |
| WAN full mesh | edge, internet | circular |
| Bus | access (hub), endpoint | manual |
| Híbrida / enterprise | todos los necesarios | hierarchical; `manual` si hay que fijar posiciones |

Reglas:
- Asignar el `role` por **función**, no por modelo de equipo (un 3650 puede ser `core` o `distribution`).
- Spine-leaf no tiene roles propios: mapear spine → `core` y leaf → `access` (o `distribution` si los leafs hacen L3 para switches de acceso).
- Usar `circular` cuando no existe jerarquía (anillo, malla); `hierarchical` ordena por capas internet → edge → core → distribution → access → endpoint.
