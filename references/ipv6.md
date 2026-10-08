# IPv6: direccionamiento, autoconfiguración y enrutamiento básico

## Contenido
- [Formato y compresión (RFC 5952)](#formato-y-compresión-rfc-5952)
- [Tipos de direcciones](#tipos-de-direcciones)
- [Multicast y solicited-node](#multicast-y-solicited-node)
- [Tamaños de prefijo](#tamaños-de-prefijo)
- [Subnetting por nibbles](#subnetting-por-nibbles)
- [EUI-64 paso a paso](#eui-64-paso-a-paso)
- [SLAAC, DHCPv6 stateless y stateful](#slaac-dhcpv6-stateless-y-stateful)
- [Configuración base en IOS](#configuración-base-en-ios)
- [DHCPv6 en IOS](#dhcpv6-en-ios)
- [Rutas estáticas IPv6](#rutas-estáticas-ipv6)
- [OSPFv3 básico](#ospfv3-básico)
- [Verificación](#verificación)
- [Notas de Packet Tracer](#notas-de-packet-tracer)
- [Errores típicos](#errores-típicos)

## Formato y compresión (RFC 5952)

128 bits = 8 grupos (hextetos) de 16 bits en hexadecimal, separados por `:`.

Reglas de representación canónica:
1. Minúsculas (`2001:db8::a`, no `2001:DB8::A`).
2. Suprimir ceros a la izquierda de cada hexteto (`0db8` → `db8`, `0000` → `0`).
3. `::` reemplaza **la secuencia más larga** de hextetos en cero (2 o más); solo **una vez** por dirección.
4. Empate en longitud → comprimir la **primera** secuencia.
5. No usar `::` para un único hexteto en cero.

| Completa | Canónica |
|---|---|
| 2001:0db8:0000:0000:0000:ff00:0042:8329 | 2001:db8::ff00:42:8329 |
| 2001:0db8:0000:0000:0001:0000:0000:0001 | 2001:db8::1:0:0:1 |
| 2001:0db8:0000:0001:0001:0001:0001:0001 | 2001:db8:0:1:1:1:1:1 |
| fe80:0000:0000:0000:0000:0000:0000:0001 | fe80::1 |
| 0000:…:0000 (todo ceros) | :: |

Expansión: contar hextetos presentes y rellenar `::` con los que faltan hasta 8.

## Tipos de direcciones

| Tipo | Prefijo | Notas |
|---|---|---|
| Global unicast (GUA) | 2000::/3 | Enrutable en Internet. Estructura típica: prefijo global /48 + subnet ID 16 bits + interface ID 64 bits |
| Link-local | fe80::/10 (en la práctica fe80::/64) | Obligatoria en toda interfaz IPv6; no se enruta; next-hop de protocolos de enrutamiento |
| ULA | fc00::/7 | Equivalente a privadas; se usa fd00::/8 con Global ID aleatorio de 40 bits (RFC 4193) |
| Multicast | ff00::/8 | IPv6 **no tiene broadcast** |
| Loopback | ::1/128 | Equivale a 127.0.0.1 |
| No especificada | ::/128 | Origen antes de tener dirección (p. ej. DAD) |
| Ruta por defecto | ::/0 | |
| Documentación | 2001:db8::/32 | RFC 3849; usar en ejemplos |
| IPv4-mapped | ::ffff:0:0/96 | Representación interna de IPv4 en sockets |

Anycast: se toma del espacio unicast; no tiene prefijo propio.

## Multicast y solicited-node

| Grupo | Miembros |
|---|---|
| ff02::1 | Todos los nodos del enlace |
| ff02::2 | Todos los routers del enlace (routers con `ipv6 unicast-routing`) |
| ff02::5 | Todos los routers OSPFv3 |
| ff02::6 | DR/BDR OSPFv3 |
| ff02::9 | Routers RIPng |
| ff02::a | Routers EIGRP para IPv6 |
| ff02::1:2 | Todos los agentes DHCPv6 (servidores y relays) del enlace |
| ff05::1:3 | Todos los servidores DHCPv6 (ámbito de sitio) |
| ff02::1:ffXX:XXXX | Solicited-node (reemplaza a ARP en NDP) |

Ámbito por el 4º dígito: `ff01` interfaz, `ff02` enlace, `ff05` sitio, `ff0e` global.

**Solicited-node** = `ff02::1:ff` + **últimos 24 bits** de la unicast:
- 2001:db8:acad:1::10 → últimos 24 bits `00:0010` → **ff02::1:ff00:10**
- fe80::21a:2bff:fe3c:4d5e → `3c:4d5e` → **ff02::1:ff3c:4d5e**

## Tamaños de prefijo

| Prefijo | Uso típico |
|---|---|
| /32 | Asignación a un ISP/LIR |
| /48 | Sitio/organización (65 536 subredes /64) |
| /56 | Sitio pequeño o residencial (256 subredes /64) |
| /64 | **Cada LAN/VLAN**. Obligatorio para SLAAC |
| /127 | Enlaces router-router (RFC 6164) |
| /128 | Loopback, ruta de host |

Producción: /64 en todas las LAN; /127 en P2P (reservando a menudo un /64 por enlace para documentación). Laboratorio: /64 también en P2P es aceptable por simplicidad.

## Subnetting por nibbles

Un nibble = 1 dígito hex = 4 bits. Dividir en límites de nibble (/48, /52, /56, /60, /64) mantiene las direcciones legibles.

**Ejemplo: 2001:db8:acad::/48 → /64**
- Bits de subred = 64 − 48 = 16 → 65 536 subredes: `2001:db8:acad:0000::/64` … `2001:db8:acad:ffff::/64`.
- Solo cambia el 4º hexteto.

Plan jerárquico (sede → VLAN), primero /52 por sede (16 sedes, 4 096 /64 cada una):

| Uso | Prefijo |
|---|---|
| Sede central | 2001:db8:acad:1000::/52 |
| Sucursal 1 | 2001:db8:acad:2000::/52 |
| Central VLAN 10 | 2001:db8:acad:1010::/64 |
| Central VLAN 20 | 2001:db8:acad:1020::/64 |
| Sucursal 1 VLAN 10 | 2001:db8:acad:2010::/64 |
| Infraestructura (P2P + loopbacks) | 2001:db8:acad:f000::/52 |
| Bloque enlaces P2P | 2001:db8:acad:ff00::/60 |
| Enlace R1–R2 | 2001:db8:acad:ff01::2/127 (R1 ::2, R2 ::3) |
| Loopbacks | 2001:db8:acad:fffe::/64 → R1 ::1/128, R2 ::2/128 |

Convención de laboratorio frecuente: escribir el número de VLAN "decimal" dentro del hexteto (VLAN 10 → `…:10::/64`). Es solo visual: `0x10` = 16.

## EUI-64 paso a paso

MAC de ejemplo: `00:1A:2B:3C:4D:5E`
1. Dividir en dos mitades: `001A2B` | `3C4D5E`.
2. Insertar `FFFE` en el medio: `001A2BFFFE3C4D5E`.
3. Invertir el **7º bit** (U/L) del primer byte: `00` = `0000 0000` → `0000 0010` = `02`.
4. Resultado: `021A:2BFF:FE3C:4D5E` → IID `21a:2bff:fe3c:4d5e`.
5. Con prefijo `2001:db8:acad:1::/64` → **2001:db8:acad:1:21a:2bff:fe3c:4d5e**; link-local IOS: **fe80::21a:2bff:fe3c:4d5e**.

Notas:
- Si el primer byte es `02` → pasa a `00`; `0C` → `0E`.
- Sistemas operativos modernos (Windows, macOS, muchas distros Linux) usan por defecto IID aleatorio/estable (RFC 4941 / RFC 7217), no EUI-64. IOS sí usa EUI-64 para link-local automática.

## SLAAC, DHCPv6 stateless y stateful

Flags en el Router Advertisement (RA):
- **M** (Managed): obtener dirección por DHCPv6 stateful.
- **O** (Other): obtener otros parámetros (DNS, dominio) por DHCPv6.
- **A** (Autonomous, en la Prefix Information Option): el host puede autoconfigurar dirección con ese prefijo (SLAAC).

| Método | A | O | M | Dirección | DNS | Gateway |
|---|---|---|---|---|---|---|
| SLAAC (default IOS) | 1 | 0 | 0 | SLAAC | RDNSS en RA (soporte variable) o manual | RA (link-local del router) |
| SLAAC + DHCPv6 stateless | 1 | 1 | 0 | SLAAC | DHCPv6 | RA |
| DHCPv6 stateful | 0 (recomendado) | — | 1 | DHCPv6 | DHCPv6 | RA |

**El gateway siempre viene del RA**: DHCPv6 no entrega gateway por defecto. Sin RA (sin `ipv6 unicast-routing`) los hosts no tienen ruta por defecto.

## Configuración base en IOS

```
ipv6 unicast-routing                              ! [PT] [IOS] [XE] — sin esto el router no reenvía IPv6 ni envía RA
interface g0/0
 ipv6 address 2001:db8:acad:10::1/64              ! [PT] [IOS] [XE] estática
 ipv6 address fe80::1 link-local                  ! [PT] [IOS] [XE] link-local legible (recomendado)
 no shutdown
interface g0/1
 ipv6 address 2001:db8:acad:20::/64 eui-64        ! [PT] [IOS] [XE] IID por EUI-64
interface g0/2
 ipv6 enable                                      ! [PT] [IOS] solo link-local automática
```

Router como cliente (p. ej. hacia ISP): `ipv6 address autoconfig` (SLAAC) [PT?] [IOS], `ipv6 address dhcp` [PT?] [IOS].

Convención de link-local: `fe80::1` en todas las interfaces del R1, `fe80::2` en R2… (la link-local solo debe ser única **por enlace**).

## DHCPv6 en IOS

**Stateless (SLAAC + O=1):**
```
ipv6 dhcp pool STATELESS-V10                      ! [PT] [IOS]
 dns-server 2001:db8:acad:1050::53
 domain-name ejemplo.local
interface g0/0
 ipv6 nd other-config-flag                        ! O=1 [PT] [IOS]
 ipv6 dhcp server STATELESS-V10                   ! [PT] [IOS]
```

**Stateful (M=1):**
```
ipv6 dhcp pool STATEFUL-V20                       ! [PT] [IOS]
 address prefix 2001:db8:acad:20::/64             ! [PT] [IOS]
 dns-server 2001:db8:acad:1050::53
 domain-name ejemplo.local
interface g0/1
 ipv6 nd managed-config-flag                      ! M=1 [PT] [IOS]
 ipv6 nd prefix 2001:db8:acad:20::/64 no-autoconfig   ! A=0 [PT?] [IOS]
 ipv6 dhcp server STATEFUL-V20                    ! [PT] [IOS]
```

Relay (servidor en otra red): `ipv6 dhcp relay destination 2001:db8:acad:1050::10` en la interfaz del cliente [PT?] [IOS]. Sintaxis de relay y opciones de `lifetime` varían por versión → verificar.

## Rutas estáticas IPv6

```
ipv6 route 2001:db8:acad:30::/64 2001:db8:acad:ff01::3          ! recursiva (next-hop GUA) [PT] [IOS]
ipv6 route 2001:db8:acad:30::/64 g0/1                            ! conectada directa: solo en P2P [PT] [IOS]
ipv6 route 2001:db8:acad:30::/64 g0/1 fe80::2                    ! totalmente especificada [PT] [IOS]
ipv6 route ::/0 g0/1 fe80::2                                     ! por defecto
ipv6 route ::/0 2001:db8:acad:ff02::3 200                        ! flotante (AD 200)
```

- **Next-hop link-local ⇒ interfaz de salida obligatoria**: la misma fe80:: puede existir en varios enlaces.
- En Ethernet multiacceso evitar rutas solo con interfaz de salida (dependen de ND para cada destino).
- Ver `references/routing.md` para AD y rutas flotantes.

## OSPFv3 básico

```
ipv6 unicast-routing
ipv6 router ospf 1                    ! [PT] [IOS]
 router-id 1.1.1.1                    ! obligatorio si el router no tiene ninguna IPv4 activa
 passive-interface g0/0               ! LAN sin vecinos OSPF
 default-information originate        ! si tiene ruta ::/0 que propagar
interface g0/0
 ipv6 ospf 1 area 0                   ! [PT] [IOS] se habilita por interfaz, no con "network"
interface g0/1
 ipv6 ospf 1 area 0
```

- Sin router-id y sin IPv4 el proceso no arranca (IOS muestra un aviso de que no puede asignar router ID).
- Vecinos se forman con link-local; next-hop en `show ipv6 route` aparece como `fe80::…`.
- Usa ff02::5 / ff02::6.
- Sintaxis de address families (`router ospfv3 1` + `address-family ipv6 unicast`) [IOS 15.x] [XE] [PT?].

## Verificación

| Comando | Qué mirar |
|---|---|
| `show ipv6 interface brief` [PT] | Estado y direcciones (GUA + link-local) por interfaz |
| `show ipv6 interface g0/0` [PT] | Grupos multicast unidos (ff02::2 indica router), flags ND/RA |
| `show ipv6 route` [PT] | Códigos C, L, S, O; next-hops link-local |
| `show ipv6 neighbors` [PT] | Tabla ND (equivalente a ARP) |
| `show ipv6 protocols` [PT] | Procesos de enrutamiento IPv6 |
| `show ipv6 ospf neighbor` [PT] | Adyacencias OSPFv3 en FULL |
| `show ipv6 dhcp pool` [PT] / `show ipv6 dhcp binding` [PT?] | Pool y asignaciones stateful |
| `ping 2001:db8:acad:30::10` / `ping ipv6 …` [PT] | Conectividad |
| `ping fe80::2` | IOS pide la **interfaz de salida** |
| `traceroute 2001:db8:acad:30::10` [PT] | Ruta |

En el PC de PT: `ipconfig` (muestra IPv6) y `ipv6config` [PT?]; en Windows real: `ipconfig`, `netsh interface ipv6 show neighbors`.

## Notas de Packet Tracer

- PC/Laptop/Server: **Desktop > IP Configuration**, sección IPv6: **Automatic** (SLAAC/DHCPv6 según flags del RA) o **Static** (dirección + prefijo + gateway). Las etiquetas exactas varían por versión de PT (versiones antiguas muestran "DHCP / Auto Config / Static").
- Gateway estático de un PC: usar la link-local del router (`fe80::1`) o su GUA; con link-local fija en el router es más estable.
- Los routers de PT no tienen IPv6 activado por defecto: falta `ipv6 unicast-routing` = PCs en "Automatic" sin dirección ni gateway.
- Switch 2960 con SVI IPv6: puede requerir `sdm prefer dual-ipv4-and-ipv6 default` + `reload` [PT?] [IOS].
- Tras cambiar flags M/O, en el PC alternar Static → Automatic para forzar una nueva solicitud.
- Más detalles de la herramienta en `references/packet-tracer.md`; comandos generales en `references/cisco-ios.md`.

## Errores típicos

| Error | Síntoma | Corrección |
|---|---|---|
| Falta `ipv6 unicast-routing` | Hosts sin GUA ni gateway; no hay reenvío | Habilitarlo globalmente |
| Prefijo distinto de /64 en LAN con SLAAC | Hosts no autoconfiguran | Usar /64 |
| Next-hop link-local sin interfaz | IOS rechaza el comando o la ruta no se instala | Especificar interfaz de salida |
| OSPFv3 sin router-id en router solo-IPv6 | Proceso no arranca, sin vecinos | `router-id x.x.x.x` |
| `::` usado dos veces | Dirección inválida | Solo una compresión `::` |
| Stateful sin `no-autoconfig` | Hosts con dos GUA (SLAAC + DHCPv6) | Poner A=0 en el prefijo |
| Esperar gateway de DHCPv6 | Hosts sin ruta por defecto | El gateway llega por RA |
| Link-local duplicada en el mismo enlace | DAD falla, interfaz con estado DUPLICATE | Link-local única por enlace |
