# Troubleshooting sistemático

## Contenido
- [Método (14 pasos)](#método-14-pasos)
- [Comandos por capa](#comandos-por-capa)
- [Síntoma → causa probable](#síntoma--causa-probable)
- [Usar el toolkit para diagnosticar](#usar-el-toolkit-para-diagnosticar)
- [Códigos del validador y su corrección](#códigos-del-validador-y-su-corrección)
- [Formato del informe](#formato-del-informe)

## Método (14 pasos)

Trabaje de abajo hacia arriba (OSI) salvo que la evidencia apunte a una capa concreta; cambie **una cosa a la vez** y verifique.

1. **Definir el problema**: qué falla exactamente, desde dónde, hacia dónde, desde cuándo, qué cambió.
2. **Alcance**: ¿un host, una VLAN, un sitio, todos? ¿Solo un servicio (DNS, HTTP) o toda la conectividad?
3. **Capa física**: luces, cable correcto, puerto correcto, equipo encendido, módulos.
4. **Interfaces**: `show ip interface brief` (up/up; administratively down; up/down), `show interfaces` (errores, duplex).
5. **VLAN**: `show vlan brief` (puerto en la VLAN correcta; VLAN existe en *todos* los switches del camino).
6. **Trunks**: `show interfaces trunk` (modo, nativa igual en ambos lados, VLAN permitidas y "active in management domain").
7. **Direccionamiento**: IP/máscara correctas, sin duplicados, en la subred de su VLAN (`ipconfig`, `show ip interface brief`).
8. **Gateway**: el host apunta a la IP correcta y esta responde (`ping <gateway>`); ARP (`show ip arp`, `arp -a`).
9. **Routing**: `show ip route` en cada salto hacia el destino **y de regreso** (falta de ruta de retorno es muy común); `show ip protocols`, vecinos.
10. **ACL/firewall**: `show access-lists` (contadores que suben), `show ip interface` (ACL aplicada, dirección), deny implícito.
11. **Servicios**: DHCP (`show ip dhcp binding`, helper), DNS (resuelve por IP pero no por nombre), NAT (`show ip nat translations`).
12. **Pruebas**: `ping`, `traceroute`/`tracert`, ping extendido con origen (`ping 8.8.8.8 source g0/1`).
13. **Causa raíz**: explique por qué el síntoma ocurre con esa causa (no solo "se arregló").
14. **Solución y verificación**: aplicar, re-probar todo lo afectado, documentar (actualizar el modelo).

## Comandos por capa

| Capa | Comandos |
|---|---|
| 1 | `show interfaces status`, `show interfaces <if>` (CRC, collisions, duplex), `show controllers` (seriales: DCE/DTE y clock) |
| 2 | `show vlan brief`, `show interfaces trunk`, `show interfaces <if> switchport`, `show mac address-table`, `show spanning-tree`, `show etherchannel summary`, `show port-security`, `show cdp neighbors detail`, `show lldp neighbors` |
| 3 | `show ip interface brief`, `show ip route`, `show ip protocols`, `show ip ospf neighbor`, `show ip eigrp neighbors`, `show ip arp`, `ping`, `traceroute` |
| 4-7 | `show access-lists`, `show ip nat translations`, `show ip dhcp binding`, `show ip dhcp conflict`, `show ip ssh`, `show ntp status`, `nslookup` (PC) |
| Hosts PT | `ipconfig /all`, `ipconfig /renew`, `ping`, `tracert`, `arp -a`, `nslookup` |

`debug` (p. ej. `debug ip dhcp server events`, `debug ip ospf adj`) solo en laboratorio o con mucho cuidado en producción; desactivar con `undebug all`.

## Síntoma → causa probable

| Síntoma | Causas a revisar primero |
|---|---|
| PC con 169.254.x.x | Sin respuesta DHCP: pool inexistente, falta `ip helper-address`, VLAN/trunk no lleva la VLAN, servidor caído |
| Ping al gateway falla, misma VLAN OK | Subinterfaz/SVI con VLAN o IP mal, VLAN no permitida en el trunk hacia el router, interfaz física del router `shutdown` |
| Misma VLAN entre switches falla | VLAN no creada en un switch, no permitida en el trunk, enlace en access, native mismatch |
| Inter-VLAN falla, gateway OK | Falta `ip routing` (switch L3), ACL, gateway del host equivocado, máscara del host distinta |
| Internet falla, LAN OK | Falta ruta por defecto, NAT (inside/outside invertido, ACL de NAT no coincide), sin ruta de retorno en el ISP para la IP pública |
| Funciona por IP, no por nombre | DNS del host o del pool DHCP, registro DNS, servicio DNS apagado |
| Vecino OSPF no aparece | Área, subred/máscara, hello/dead, interfaz pasiva, `network` que no coincide, router-id duplicado |
| Puerto err-disabled | Port-security (violation shutdown), BPDU guard; `show interfaces status err-disabled` |
| Intermitencia / lentitud | Duplex mismatch, bucle STP, errores CRC, EtherChannel con miembros suspendidos |
| CDP "Native VLAN mismatch" | Nativa distinta en cada extremo del trunk |
| SSH rechazado | Sin `ip domain-name`/clave RSA, `transport input`, `login local` sin usuario, ACL en VTY |

## Usar el toolkit para diagnosticar

Cuando el usuario describe o pega una red (config, `show`, captura):

1. Construir/actualizar el modelo con lo **confirmado** (marcar lo inferido con `confidence`).
2. `node scripts/netlab.ts validate red.net.json` → lista de causas candidatas con código.
3. `node scripts/netlab.ts trace red.net.json PC1 PC3` → dónde se corta el camino (ida o vuelta), ACL que bloquea, NAT aplicada.
4. `node scripts/netlab.ts routes red.net.json --device R1` → tabla simulada para comparar con `show ip route` real. **Las diferencias entre lo simulado y lo real son la pista**.
5. Proponer la corrección mínima, aplicarla en el modelo, re-validar y entregar los comandos exactos para el equipo.

El simulador es un modelo: no reproduce temporizadores, STP ni ARP real. Confirme siempre con `show` en el equipo.

## Códigos del validador y su corrección

| Código | Corrección habitual |
|---|---|
| `TRUNK-MODE-MISMATCH` | `switchport mode trunk` en ambos extremos |
| `NATIVE-VLAN-MISMATCH` | Misma `switchport trunk native vlan` en ambos extremos |
| `ALLOWED-VLAN-MISMATCH` / `ROAS-VLAN-NOT-ALLOWED` | `switchport trunk allowed vlan add N` (¡con `add`!) |
| `ROAS-ACCESS-PORT` | Puerto del switch hacia el router en trunk |
| `GW-UNREACHABLE` | VLAN del puerto del host, trunks del camino, subinterfaz/SVI de esa VLAN |
| `GW-NOT-IN-SUBNET` / `SEGMENT-SUBNET-MISMATCH` | IP/máscara/gateway del host o de la interfaz |
| `DHCP-NO-SERVER` | Pool para esa red o `ip helper-address` en el gateway |
| `DHCP-GW-NOT-EXCLUDED` | `ip dhcp excluded-address` para gateway y servidores |
| `OSPF-AREA-MISMATCH` / `OSPF-PASSIVE-NEIGHBOR` | Igualar área; quitar `passive-interface` en enlaces entre routers |
| `OSPF-NO-ADJACENCY` (o EIGRP/RIP) | Agregar la red del enlace al protocolo en el router que no la anuncia |
| `SERIAL-MEDIUM` / `SERIAL-NO-DCE` / `SERIAL-NO-CLOCK` / `SERIAL-CLOCK-ON-DTE` | Cable serial; `clock rate` solo en el extremo DCE |
| `IF-NOT-IN-MODEL` | Nombre de interfaz real del modelo o instalar el módulo indicado |
| `STATIC-UNRESOLVED` | Next-hop debe ser la IP del vecino en una red conectada |
| `L3-NO-IP-ROUTING` | `ip routing` en el switch multicapa |
| `ETHERCHANNEL-MODE` | LACP active/passive, PAgP desirable/auto, o on/on |
| `ACL-UNDEFINED` | Crear la ACL o corregir el nombre aplicado |
| `NAT-INTERFACES` | `ip nat inside` / `ip nat outside` en las interfaces correctas |
| `TEST-FAILED` | Leer la razón: indica equipo, interfaz y motivo (ruta, ACL, L2, NAT, ASA, VPN) |
| `HSRP-VIP-MISMATCH` / `HSRP-NO-PREEMPT` | Misma IP virtual en el grupo; `standby N preempt` en el de mayor prioridad |
| `STP-ROOT-UNDESIRED` / `STP-HSRP-MISALIGNED` | `spanning-tree vlan X root primary` en el core/distribución activo de HSRP |
| `ASA-NO-NAMEIF` / mensaje «requiere una ACL» | nameif + security-level; tráfico de menor a mayor nivel necesita ACL + access-group |
| mensaje «falta inspect icmp» | `policy-map global_policy` → `class inspection_default` → `inspect icmp` |
| `VPN-NO-MIRROR` / `VPN-ACL-NOT-MIRRORED` / `VPN-PSK-MISMATCH` / `VPN-IKE-MISMATCH` | Ambos extremos espejo: redes invertidas, misma clave, misma política IKE y transform-set |
| `VPN-NO-ROUTE` | Ruta (normalmente la default) hacia las redes remotas por la interfaz del crypto map |
| `OSPFV3-NO-RID` / `IPV6-GW-UNREACHABLE` | `router-id` en `ipv6 router ospf`; gateway IPv6 = link-local del router en ese enlace |
| `SCHEMA-UNKNOWN-FIELD` | Campo mal escrito en el modelo (el mensaje sugiere el correcto) |

## Formato del informe

Use `templates/troubleshooting-report.md`: problema, alcance, evidencias (con su origen), hipótesis descartadas, causa raíz, corrección (comandos), verificación y prevención.
