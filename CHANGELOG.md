# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto usa [Versionado Semántico](https://semver.org/lang/es/):

- **MAJOR**: cambios incompatibles en el formato del modelo (`modelVersion`) o en la CLI.
- **MINOR**: nuevas capacidades compatibles (protocolos, generadores, validaciones, referencias).
- **PATCH**: correcciones de errores, de comandos o de documentación.

## [Sin publicar]

## [1.0.0] - 2026-10-08

Primera versión pública.

### Agregado
- **Modelo de red `*.net.json`** como fuente única de verdad, con JSON Schema (`schemas/network-model.schema.json`) para autocompletado en VS Code y detección de campos mal escritos.
- **CLI `netlab`** (TypeScript nativo en Node.js ≥ 22.18, sin dependencias): `validate`, `build`, `render`, `config`, `docs`, `mermaid`, `trace`, `routes`, `init`, `import`, `diff`, `schema`, `catalog` y calculadoras (`subnet`, `vlsm`, `ipv6`, `eui64`).
- **Validación de red completa**: cableado y medios, interfaces por modelo de Packet Tracer, VLAN, trunks y VLAN nativa, router-on-a-stick, EtherChannel, STP por VLAN (root y puertos bloqueados), HSRP, IPv4/IPv6, DHCP con asignación simulada, OSPF/OSPFv3/EIGRP/RIP/BGP, rutas estáticas, ACL, NAT/PAT, ASA y VPN IPsec.
- **Simulación**: tablas de routing con AD y métricas reales (costo OSPF, métrica compuesta EIGRP) y ping de ida y vuelta con LPM, ACL, NAT, HSRP, firewall ASA con estado y túneles IPsec.
- **Generación de configuración**: Cisco IOS / IOS XE (VLAN, trunks, ROAS, SVI, EtherChannel, STP, HSRP, OSPF, OSPFv3, EIGRP, RIP, BGP, DHCP, NAT con exención para VPN, ACL, SSH, IPsec crypto map), Cisco ASA 8.3+ e instrucciones de GUI para equipos finales de Packet Tracer.
- **Diagrama interactivo** autocontenido (SVG + JS sin CDN): inspector, vista física y vista L3, filtro por VLAN, búsqueda, diagnósticos, resaltado de pings, luces STP, modo oscuro, exportación SVG/PNG y layout persistente.
- **Importación** de `show running-config` y `show cdp neighbors [detail]` a modelo (sin importar secretos).
- **Diff** entre versiones del modelo con informe y diagrama de cambios.
- **17 referencias** (IOS, Packet Tracer, IPv4, IPv6, switching, STP, routing, servicios, seguridad, wireless, topologías, troubleshooting, laboratorios, análisis, documentación, diagramación, modelo), plantillas y 7 ejemplos validados.
- Suite de pruebas (`node --test`) y CI en GitHub Actions.

[Sin publicar]: https://github.com/Juanfrxz/network-engineering/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Juanfrxz/network-engineering/releases/tag/v1.0.0
