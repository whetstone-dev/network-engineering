# Modo laboratorio y modo educativo

## Contenido
- [Detectar el modo](#detectar-el-modo)
- [Generar un laboratorio](#generar-un-laboratorio)
- [Niveles](#niveles)
- [Catálogo de laboratorios base](#catálogo-de-laboratorios-base)
- [Modo educativo paso a paso](#modo-educativo-paso-a-paso)
- [Preguntas de comprensión](#preguntas-de-comprensión)
- [Laboratorios de troubleshooting](#laboratorios-de-troubleshooting)

## Detectar el modo

- **Laboratorio**: "créame un lab / ejercicio / práctica / actividad". Entregable completo con solución opcional.
- **Educativo**: el usuario está aprendiendo ("no entiendo", "explícame", "soy estudiante", "paso a paso"). No entregue solo la configuración final: explique qué, por qué, qué problema resuelve, el comando, el resultado esperado y cómo verificarlo.
- Si el nivel no está claro, asuma BEGINNER para estudiantes y pregunte solo si cambia mucho el resultado.

## Generar un laboratorio

1. Diseñe el modelo (`meta.level`, `meta.target: "packet-tracer"`), incluyendo `tests` que demuestren el objetivo (y `expect: "fail"` para aislamientos).
2. `validate` → 0 errores. `build` → diagrama, configs (solución) y documentación.
3. Redacte el enunciado con `templates/lab.md`:
   - Objetivo y escenario · Requisitos previos · Topología (diagrama + tabla de conexiones)
   - Dispositivos (modelo PT y módulos) · Tablas de VLAN y direccionamiento
   - Instrucciones por partes (sin revelar comandos en ADVANCED)
   - Pruebas esperadas · Preguntas · Solución (configs generadas) separada al final o en archivo aparte
4. Para el alumno, puede entregar el modelo **sin** configs (solo `topology.html` + enunciado) y la solución en `configs/`.

## Niveles

| Nivel | Alcance típico | Cómo se guía |
|---|---|---|
| BEGINNER | 1 router, 1-2 switches, 2-3 VLAN, ROAS, DHCP en router, rutas estáticas | Comandos completos con explicación línea por línea; verificación después de cada paso |
| INTERMEDIATE | Switch L3 con SVI, OSPF single-área, DHCP relay, NAT/PAT, ACL estándar/extendida, EtherChannel, port-security | Indicaciones de qué configurar; comandos clave solo como pista |
| ADVANCED | Multi-área OSPF o EIGRP + redistribución, HSRP, IPv6 dual-stack, VPN IPsec/GRE, ZBF/ASA, diseño de direccionamiento VLSM por el alumno | Solo requisitos y criterios de aceptación (pruebas); el alumno diseña |

## Catálogo de laboratorios base

| Laboratorio | Base sugerida |
|---|---|
| VLAN + trunk + router-on-a-stick + DHCP | `examples/pt-3vlan-roas-dhcp.net.json` |
| Campus collapsed-core con OSPF, NAT, relay, ACL de invitados, EtherChannel | `examples/campus-ospf-nat.net.json` |
| Troubleshooting de VLAN/trunk/DHCP | `examples/troubleshooting-broken-lab.net.json` |
| WAN serial entre sedes con OSPF | `examples/wan-2sedes-ospf-serial.net.json` |
| Redundancia: HSRP + STP por VLAN + EtherChannel + EIGRP | `examples/campus-hsrp-stp-eigrp.net.json` |
| Firewall ASA con DMZ, NAT estática y ACL | `examples/asa-dmz.net.json` |
| VPN IPsec site-to-site + IPv6/OSPFv3 | `examples/vpn-ipsec-ospfv3.net.json` |
| Rutas estáticas y por defecto entre 3 routers | Partir del ejemplo WAN y reemplazar OSPF por `routing.static` |
| OSPF multi-área / EIGRP | Modelo nuevo; `tests` entre extremos |
| IPv6 dual-stack / SLAAC | Interfaces con `ipv6` y `linkLocal`; ver `references/ipv6.md` |
| Seguridad L2 (port-security, BPDU guard, VLAN blackhole) | Partir de `pt-3vlan-roas-dhcp` |

Al reutilizar un ejemplo, cambie nombres, direccionamiento y detalles: cada laboratorio nuevo debe ser propio.

## Modo educativo paso a paso

Formato por paso (configuración real, sin saltos):

```
PASO 1 — Crear las VLAN
Qué hacemos: creamos las VLAN 10, 20 y 30 en SW1 y SW2.
Por qué: un switch solo conmuta tramas de VLAN que existen en su base de datos;
         sin ellas, los puertos asignados quedarían inactivos.
Comandos (SW1 y SW2):
  vlan 10
   name VENTAS
Resultado esperado: show vlan brief lista VENTAS como "active".
Verifique: show vlan brief
Error común: crear la VLAN solo en un switch → los hosts de esa VLAN no se ven entre switches.
```

Secuencia típica: PASO 1 Crear VLAN → 2 Asignar puertos → 3 Configurar trunk → 4 Routing inter-VLAN → 5 DHCP → 6 Verificar (pings y `show`). Use analogías breves solo si ayudan; termine cada paso con su verificación, no al final.

Distinga siempre **académico vs producción**: "en el lab usamos `cisco` como contraseña; en producción, `enable secret` robusto y SSH con usuarios locales o AAA".

## Preguntas de comprensión

Incluya 4-6 preguntas que exijan razonar, no memorizar:
- "¿Qué pasaría si la VLAN 20 no estuviera permitida en el trunk SW1–R1? ¿Qué ping fallaría y cuál no?"
- "¿Por qué la subinterfaz necesita `encapsulation dot1Q` antes de la IP?"
- "¿Qué cambia si mueve el servidor DHCP a otra subred?"
Dé las respuestas en la sección de solución.

## Laboratorios de troubleshooting

1. Construya la red correcta y valide (0 errores).
2. Copie el modelo e introduzca 3-6 fallas realistas de distintas capas (cable/puerto, VLAN, trunk, IP/gateway, routing, ACL, DHCP).
3. `validate` sobre la versión rota debe detectar cada falla (si una no se detecta, explíquela usted en la solución).
4. Entregue al alumno: síntomas observables y objetivo; la solución lista falla → evidencia (`show`) → corrección.
