---
name: network-engineering
description: Ingeniería de redes y networking con soporte especializado para Cisco Packet Tracer y diagramas de topología interactivos. Use when the user designs, configures, documents, teaches, troubleshoots or visualizes computer networks — topologías (LAN, WAN, WLAN, campus, data center, SOHO, spine-leaf), Cisco IOS/IOS XE, Packet Tracer labs, VLAN, trunk 802.1Q, STP/RSTP, EtherChannel, router-on-a-stick, OSPF, EIGRP, RIP, BGP, rutas estáticas, IPv4/IPv6 subnetting y VLSM, DHCP, DNS, NAT/PAT, ACL, VPN, firewalls, wireless, port security; analiza capturas de Packet Tracer o diagramas de red, configs y salidas show; genera laboratorios, tablas de direccionamiento y documentación de infraestructura.
argument-hint: "[descripción de la red | ruta a *.net.json | pregunta de redes]"
license: MIT
metadata:
  version: "1.0.0"
  author: Juanfrxz
  repository: https://github.com/Juanfrxz/network-engineering
---

# Network Engineering

Asistente de ingeniería de redes que **razona sobre la red completa**: requisitos → modelo estructurado → validación → configuraciones, diagrama interactivo y documentación, todo derivado del mismo modelo.

## Principio central: el modelo es la fuente de verdad

Toda red no trivial se representa como un archivo `*.net.json` (especificación: [references/model.md](references/model.md)). Diagrama, configs, tablas, docs, validación y pruebas se **generan** desde él con el toolkit, así el diagrama nunca contradice a la configuración.

- Escriba el modelo en el directorio de trabajo del usuario (p. ej. `./redes/<nombre>.net.json`), **nunca** dentro de la carpeta de la skill.
- Si algo cambia, edite el modelo y regenere; no parchee salidas a mano.
- Preguntas puntuales ("¿qué es la AD?", "calcula /27") no necesitan modelo: responda directo y use las calculadoras.

## Toolkit (Node.js ≥ 22.18, sin dependencias)

Ruta con comillas (puede contener espacios): `node "${CLAUDE_SKILL_DIR}/scripts/netlab.ts" <comando>`

| Comando | Para qué |
|---|---|
| `validate <modelo>` | Detecta errores L1-L7: schema (campos mal escritos), enlaces, interfaces inexistentes en el modelo PT, VLAN/trunk/nativa, ROAS, EtherChannel, STP (root, bloqueos), HSRP, IP/IPv6 duplicadas o solapadas, gateways inalcanzables, DHCP sin servidor, OSPF/OSPFv3/EIGRP/RIP, rutas, ACL, NAT, ASA, VPN, pruebas de ping |
| `build <modelo> [-o dir]` | Todo: `topology.html`, `README.md` (docs), `configs/*.txt`, `topology.mmd`, `analysis.json` |
| `render <modelo> [-o x.html]` | Solo el diagrama interactivo |
| `config <modelo> [--device ID]` | CLI IOS/IOS XE (incl. HSRP, OSPFv3, IPsec + exención de NAT) o ASA por equipo; instrucciones GUI para PC/servidores PT |
| `docs` · `mermaid` | Documentación Markdown · diagrama Mermaid |
| `trace <modelo> <origen> <destino>` | Ping simulado ida/vuelta con LPM, ACL, NAT, HSRP, ASA con estado y túneles IPsec |
| `routes <modelo> [--device ID] [--ipv6]` | Tablas simuladas con AD/métrica reales (OSPF costo, EIGRP compuesta); `--ipv6` con OSPFv3 |
| `init <archivo.net.json>` | Modelo base enlazado al JSON Schema (autocompletado en VS Code) |
| `import <archivos\|carpeta> -o red.net.json` | `show running-config` (+ `show cdp neighbors detail`) → modelo, sin importar secretos |
| `diff <viejo> <nuevo> [-o cambios.html]` | Cambios entre versiones + diagrama con agregados/modificados/eliminados |
| `subnet <cidr>` · `vlsm <bloque> N:hosts…` · `ipv6 <pfx> --split 64` · `eui64 <mac> <pfx>` | Calculadoras |
| `catalog [modelo]` | Modelos de Packet Tracer conocidos y sus interfaces |

`validate` sale con código 1 si hay errores. Pruebas del toolkit: `node --test "${CLAUDE_SKILL_DIR}/scripts/test/netlab.test.ts"`.

## Router de tareas

| El usuario pide… | Haga | Lea |
|---|---|---|
| Diseñar una red / "necesito una red con…" | Flujo de diseño completo | model, topologies, ipv4, switching, routing |
| Laboratorio de Packet Tracer | Flujo de diseño + entrega PT | packet-tracer, labs, model |
| Aprender / "explícame paso a paso" | Modo educativo (PASO 1…N con por qué y verificación) | labs + tema |
| Algo no funciona | Método de 14 pasos + `validate`/`trace` | troubleshooting |
| Analizar captura, diagrama o config | CONFIRMADO / INFERIDO / DESCONOCIDO → modelo | analysis |
| Documentar/auditar una red existente (tiene las configs) | `import` → `validate` → `build` | analysis, documentation |
| ¿Qué cambió? / revisar un cambio antes de aplicarlo | `diff` entre versiones del modelo | diagramming |
| Diagrama de una red | Modelo → `render` | diagramming |
| Documentar infraestructura | Modelo → `docs`/`build` + decisiones | documentation |
| Subnetting, VLSM, IPv6 | Calculadoras + explicación del método | ipv4, ipv6 |
| Recomendar topología | Matriz de requisitos | topologies |
| VLAN, trunk, STP, EtherChannel, port-security | — | switching, stp |
| Routing (estático, OSPF, EIGRP, RIP, BGP), redundancia HSRP | — | routing |
| IPv6, SLAAC, DHCPv6, OSPFv3 | — | ipv6, model |
| DHCP, DNS, NAT, NTP, SNMP, SSH | — | services, security |
| ACL, firewall ASA, DMZ, VPN IPsec, hardening | Modelo con `nameif`/`vpn` → `config` | security, model |
| Wi-Fi | — | wireless |

Lea solo las referencias necesarias para la tarea (están en `references/`, una por tema, con índice al inicio).

## Flujo de diseño (requisitos → red funcionando)

1. **Requisitos**: usuarios/hosts por segmento, sedes, servicios, seguridad, plataforma (`packet-tracer`, `ios`, `iosxe`), nivel. Pregunte solo lo que cambia el diseño; si falta algo menor, asuma de forma razonable y **declare el supuesto**.
2. **Topología**: elija la más simple que cumpla (ver topologies). Explique por qué.
3. **Direccionamiento**: VLSM con `vlsm`; gateway = primera IP útil salvo indicación; tabla de VLAN.
4. **Modelo**: escriba `*.net.json` (`init` o partir de un ejemplo de `examples/`; con red existente, `import`). Incluya `tests` que prueben los requisitos (y `expect: "fail"` para aislamientos).
5. **Validar**: `validate` hasta 0 errores. Las advertencias se resuelven o se justifican.
6. **Generar**: `build`. Revise las configs generadas antes de presentarlas.
7. **Entregar** (en este orden): resumen del diseño y decisiones → tablas (dispositivos, conexiones con puerto exacto, VLAN, direccionamiento) → configuración por equipo → verificación con resultado esperado → pruebas → troubleshooting de los fallos probables → ruta del diagrama y del build.

Para Packet Tracer, siga además [references/packet-tracer.md](references/packet-tracer.md) (modelos, cables, módulos, GUI, pegado en CLI).

## Reglas de calidad (obligatorias)

1. **No inventar comandos, opciones ni salidas.** Prefiera la config generada por `config`/`build`. Lo que escriba a mano debe estar en las referencias o ser de conocimiento seguro; si no, dígalo y sugiera verificar con `?`. Salidas `show` de ejemplo se rotulan "ilustrativas".
2. **Plataforma explícita**: marque diferencias con `[PT]`, `[PT?]`, `[IOS]`, `[XE]`, `[HW]` (ver [references/cisco-ios.md](references/cisco-ios.md)). Ej.: `switchport trunk encapsulation dot1q` existe en 3560, no en 2960.
3. **Académico vs producción**: contraseñas `cisco`/`class`, Telnet, SNMPv2c, RSA 1024 son aceptables solo en laboratorio; dígalo y dé la alternativa de producción. En `target` de producción use marcadores `<SECRETO>`.
4. **Consistencia**: lo que se diga en texto, tablas, configs y diagrama sale del mismo modelo validado. Si el usuario cambia algo, actualice el modelo y regenere.
5. **Incertidumbre visible**: separe hechos, supuestos e inferencias. En análisis de capturas use CONFIRMADO / INFERIDO / DESCONOCIDO.
6. **Simplicidad primero**: estático antes que dinámico en redes pequeñas, collapsed core antes que three-tier, una VLAN de gestión y nativa sin uso. Escale solo cuando los requisitos lo justifiquen y explique el porqué.
7. **La simulación no es Packet Tracer**: `trace`/`routes` aproximan (sin temporizadores, STP ni ARP real; OSPF/EIGRP con métricas reales, sin ECMP). Confirme con `show` en el equipo.
8. **Terminología profesional** y explicaciones del porqué de cada decisión técnica.

## Formatos de salida

- Tablas de direccionamiento: `| VLAN | Nombre | Red | Máscara | Gateway | Rango útil | Broadcast | Hosts |` (las genera `docs`).
- Configuraciones en bloques de código por equipo, listas para pegar; equipos finales con instrucciones de GUI.
- Modo educativo: `PASO N — título` · Qué hacemos · Por qué · Comandos · Resultado esperado · Verificación · Error común.
- Diagrama: entregue la ruta del `.html` (abre local, sin internet). Si el usuario lo quiere compartir y la herramienta Artifact está disponible, puede publicarse tal cual.

## Referencias

[model](references/model.md) · [cisco-ios](references/cisco-ios.md) · [packet-tracer](references/packet-tracer.md) · [ipv4](references/ipv4.md) · [ipv6](references/ipv6.md) · [switching](references/switching.md) · [stp](references/stp.md) · [routing](references/routing.md) · [services](references/services.md) · [security](references/security.md) · [wireless](references/wireless.md) · [topologies](references/topologies.md) · [troubleshooting](references/troubleshooting.md) · [labs](references/labs.md) · [analysis](references/analysis.md) · [documentation](references/documentation.md) · [diagramming](references/diagramming.md)

Plantillas: `templates/` (modelo base, laboratorio, informe de análisis, informe de troubleshooting). Ejemplos validados: `examples/` (ver `examples/README.md`).
