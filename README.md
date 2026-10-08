# network-engineering — Skill de redes para Claude Code

[![CI](https://github.com/Juanfrxz/network-engineering/actions/workflows/ci.yml/badge.svg)](https://github.com/Juanfrxz/network-engineering/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Node ≥ 22.18](https://img.shields.io/badge/node-%E2%89%A5%2022.18-green.svg)

Skill para [Claude Code](https://claude.com/claude-code) que convierte a Claude en un asistente de **ingeniería de redes**: diseña, configura, valida, documenta, enseña y diagnostica redes, con soporte especializado para **Cisco Packet Tracer** y **diagramas de topología interactivos**.

La red se describe en un modelo JSON (`*.net.json`) que es la **fuente única de verdad**: las configuraciones, el diagrama, la documentación, la validación y las pruebas se generan desde ese modelo, así nunca se contradicen.

> *Skill for Claude Code (Spanish-first): network design, Cisco IOS/ASA config generation, Packet Tracer labs, full-network validation and simulation, and interactive topology diagrams.*

## Qué hace

- **Diseña redes completas** a partir de requisitos: topología, VLSM, VLAN, routing, servicios y seguridad.
- **Genera configuraciones** listas para pegar: Cisco IOS / IOS XE (VLAN, trunks, router-on-a-stick, SVI, EtherChannel, STP, HSRP, OSPF/OSPFv3, EIGRP, RIP, BGP, DHCP, NAT/PAT, ACL, SSH, VPN IPsec) y Cisco ASA; instrucciones de GUI para PCs y servidores de Packet Tracer.
- **Valida la red entera**, no solo la sintaxis: trunks y VLAN nativa, gateways inalcanzables, subredes solapadas, DHCP sin servidor, adyacencias OSPF/EIGRP, STP (root y bloqueos), HSRP, ACL, NAT, firewall, VPN… y ejecuta **pings simulados** de ida y vuelta.
- **Diagrama interactivo** en un solo HTML (sin internet): inspector por equipo con su configuración, vista física y vista L3, filtro por VLAN, diagnósticos, caminos de ping resaltados, exportación SVG/PNG.
- **Importa redes existentes** desde `show running-config` + `show cdp neighbors`, y **compara versiones** (`diff`) con un diagrama de cambios.
- **Modo laboratorio y modo educativo** (BEGINNER / INTERMEDIATE / ADVANCED, paso a paso con el porqué) y **troubleshooting** sistemático.
- **No inventa comandos**: marca diferencias entre Packet Tracer, IOS, IOS XE y hardware real, y separa lo confirmado de lo inferido.

## Requisitos

- [Claude Code](https://claude.com/claude-code)
- **Node.js ≥ 22.18** (ejecuta TypeScript de forma nativa). No hay dependencias npm.

## Instalación

**Opción 1 — Skills CLI** ([skills.sh](https://skills.sh)):

```bash
npx skills add Juanfrxz/network-engineering
```

**Opción 2 — Clonar como skill personal** (disponible en todos los proyectos):

```bash
# macOS / Linux
git clone https://github.com/Juanfrxz/network-engineering.git ~/.claude/skills/network-engineering
```
```powershell
# Windows (PowerShell)
git clone https://github.com/Juanfrxz/network-engineering.git "$HOME\.claude\skills\network-engineering"
```

**Opción 3 — Solo para un proyecto**: clone en `.claude/skills/network-engineering` dentro del repositorio del proyecto.

La carpeta debe llamarse `network-engineering` (igual que la skill). Reinicie Claude Code para que la detecte.

### Actualizar

```bash
git -C ~/.claude/skills/network-engineering pull     # instalación por git
npx skills update                                    # instalación con Skills CLI
```

Las versiones se publican en [Releases](https://github.com/Juanfrxz/network-engineering/releases) siguiendo [SemVer](https://semver.org/lang/es/); los cambios están en [CHANGELOG.md](CHANGELOG.md).

## Uso

Pídale a Claude cualquier tarea de redes y la skill se activa sola:

- *"Necesito un laboratorio de Packet Tracer con 3 VLAN, un router, dos switches y DHCP."*
- *"Explícame paso a paso cómo configurar router-on-a-stick, soy principiante."*
- *"Diseña la red de una empresa con dos sedes unidas por VPN y salida a Internet con NAT."*
- *"Los PCs de la VLAN 30 no obtienen IP, te paso el show running-config del switch."*
- *"Analiza esta captura de Packet Tracer."*
- *"Documenta esta red a partir de estas configuraciones."*

O invóquela explícitamente: `/network-engineering <descripción o ruta a un .net.json>`.

### Toolkit `netlab` (también usable sin Claude)

```bash
node scripts/netlab.ts help
node scripts/netlab.ts init mi-red.net.json                      # modelo base con autocompletado (JSON Schema)
node scripts/netlab.ts validate mi-red.net.json                  # validación completa + pings simulados
node scripts/netlab.ts build mi-red.net.json -o salida           # diagrama + docs + configs
node scripts/netlab.ts trace mi-red.net.json PC1 8.8.8.8         # ping simulado con el camino
node scripts/netlab.ts import configs/ -o red.net.json           # desde show running-config + CDP
node scripts/netlab.ts diff v1.net.json v2.net.json -o cambios.html
node scripts/netlab.ts vlsm 192.168.0.0/24 VENTAS:60 TI:25 WAN:2
```

Ejemplos listos para explorar en [`examples/`](examples/) (los `.html` de `examples/rendered/` se abren con doble clic tras clonar).

## Estructura

| Ruta | Contenido |
|---|---|
| `SKILL.md` | Punto de entrada: router de tareas, flujo de diseño, reglas de calidad |
| `references/` | Conocimiento por tema, cargado bajo demanda (IOS, Packet Tracer, IPv4/IPv6, switching, STP, routing, servicios, seguridad, wireless, topologías, troubleshooting, laboratorios…) |
| `scripts/netlab.ts` | CLI del toolkit |
| `scripts/lib/` | Modelo, schema, análisis L2/STP/L3/IPv6/HSRP, simulación (ACL, NAT, ASA, IPsec), generadores IOS y ASA, importador, diff, layout, renderer, documentación |
| `schemas/` | JSON Schema del modelo |
| `assets/` | Viewer del diagrama (JS/CSS sin dependencias, incrustado en el HTML) |
| `templates/` | Modelo base, laboratorio, informes de análisis y troubleshooting |
| `examples/` | Modelos validados y diagramas renderizados |

## Limitaciones conocidas

- La simulación aproxima a IOS: no modela temporizadores, ECMP, redistribución ni MST por instancia; confirme siempre con `show` en el equipo.
- VPN solo en IOS (crypto map); no genera VPN en ASA.
- La lectura de capturas depende de la calidad de la imagen; la skill separa CONFIRMADO / INFERIDO / DESCONOCIDO.

## Contribuir

Ver [CONTRIBUTING.md](CONTRIBUTING.md). Issues y PRs bienvenidos.

## Licencia

[MIT](LICENSE) © Juan David (Juanfrxz)
