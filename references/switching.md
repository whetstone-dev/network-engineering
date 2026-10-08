# Switching: VLANs, trunks, inter-VLAN, port security, EtherChannel

## Contenido
- [Rangos de VLAN](#rangos-de-vlan)
- [Creación de VLANs y puertos access](#creación-de-vlans-y-puertos-access)
- [Trunks 802.1Q](#trunks-8021q)
- [DTP](#dtp)
- [Native VLAN](#native-vlan)
- [VLAN de gestión y SVI en switch L2](#vlan-de-gestión-y-svi-en-switch-l2)
- [Inter-VLAN routing](#inter-vlan-routing)
- [Port security](#port-security)
- [EtherChannel](#etherchannel)
- [CDP, LLDP y tabla MAC](#cdp-lldp-y-tabla-mac)
- [Puertos no usados](#puertos-no-usados)
- [Comandos de verificación](#comandos-de-verificación)
- [Inconsistencias que detectar](#inconsistencias-que-detectar)

Convención de etiquetas: `[PT]` Packet Tracer, `[IOS]` IOS 15.x clásico, `[XE]` IOS XE, `[HW]` solo hardware real, `[PT?]` soporte en PT no confirmado.
Direccionamiento de ejemplo: VLAN 10 = 192.0.2.0/24, VLAN 20 = 198.51.100.0/24, VLAN 99 (gestión) = 203.0.113.0/25, enlace ruteado = 203.0.113.252/30.

## Rangos de VLAN

| Rango | Tipo | Notas |
|---|---|---|
| 0, 4095 | Reservadas | No utilizables |
| 1 | Default | No se puede borrar ni renombrar; todos los puertos inician aquí |
| 2–1001 | Rango normal | Se guardan en `vlan.dat` (flash), propagables por VTP v1/v2 |
| 1002–1005 | Reservadas | Legado FDDI/Token Ring; no se pueden borrar |
| 1006–4094 | Rango extendido | Con VTP v1/v2 requieren `vtp mode transparent` (o `off`); se guardan en running-config. VTP v3 sí las propaga |

- `vlan.dat` NO se borra con `erase startup-config`; para reset completo de lab: `delete flash:vlan.dat` + `erase startup-config` + `reload`.

## Creación de VLANs y puertos access

```
SW1(config)# vlan 10
SW1(config-vlan)# name VENTAS
SW1(config-vlan)# vlan 20
SW1(config-vlan)# name CONTABILIDAD
SW1(config-vlan)# exit
SW1(config)# interface range FastEthernet0/1 - 10
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# switchport access vlan 10
```

- `interface range` [PT][IOS][XE]: lleva espacio a ambos lados del guion; se pueden combinar rangos con coma: `interface range fa0/1 - 10 , gi0/1 - 2`.
- Si se asigna `switchport access vlan 30` y la VLAN 30 no existe, IOS normalmente la crea automáticamente (mensaje "% Access VLAN does not exist. Creating vlan 30"); no confiar en esto: crear y nombrar explícitamente.
- `switchport mode access` fija el modo y desactiva la negociación de trunk (DTP sigue sin formar trunk).

### Voice VLAN
```
SW1(config-if)# switchport mode access
SW1(config-if)# switchport access vlan 10
SW1(config-if)# switchport voice vlan 150
SW1(config-if)# mls qos trust device cisco-phone   ! [IOS] [PT?] depende del modelo
```
- El puerto sigue siendo access: datos del PC sin etiquetar (VLAN 10), voz etiquetada 802.1Q (VLAN 150). CDP/LLDP-MED informa la voice VLAN al teléfono.
- `show interfaces fa0/5 switchport` muestra "Voice VLAN: 150".

## Trunks 802.1Q

```
SW1(config)# interface GigabitEthernet0/1
SW1(config-if)# switchport trunk encapsulation dot1q   ! solo donde aplique (ver tabla)
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk native vlan 999
SW1(config-if)# switchport trunk allowed vlan 10,20,99
SW1(config-if)# switchport nonegotiate
```

| Plataforma | `switchport trunk encapsulation dot1q` |
|---|---|
| 2960 / 2960-x | No existe (solo 802.1Q) |
| 3560 / 3750 (soportan ISL) | Obligatorio ANTES de `switchport mode trunk`; si no: error "trunk encapsulation is Auto" |
| 3650 / 3850 / Cat9k (IOS XE) | Normalmente no existe (solo dot1q); verificar en la versión de IOS XE/PT |

### Lista de VLANs permitidas (peligro común)
| Comando | Efecto |
|---|---|
| `switchport trunk allowed vlan 10,20` | REEMPLAZA la lista completa por 10,20 |
| `switchport trunk allowed vlan add 30` | Agrega 30 a la lista actual |
| `switchport trunk allowed vlan remove 20` | Quita 20 |
| `switchport trunk allowed vlan except 1` | Todas excepto la 1 |
| `switchport trunk allowed vlan all` / `none` | Todas / ninguna |

> En producción, olvidar `add` en un trunk ya operativo corta todas las VLANs no listadas. Revisar siempre con `show interfaces trunk` antes y después.

## DTP

Modos: `access`, `trunk`, `dynamic auto` (espera), `dynamic desirable` (inicia negociación). Default en 2960: `dynamic auto` (verificar por modelo/versión; algunos modelos antiguos usaban `desirable`).

| Lado A \ Lado B | dynamic auto | dynamic desirable | trunk | access |
|---|---|---|---|---|
| **dynamic auto** | access | trunk | trunk | access |
| **dynamic desirable** | trunk | trunk | trunk | access |
| **trunk** | trunk | trunk | trunk | conectividad limitada (mismatch) |
| **access** | access | access | mismatch | access |

- Recomendación (lab y producción): modo estático en todos los puertos (`access` o `trunk`) y `switchport nonegotiate` en trunks hacia equipos que no hablan DTP o para eliminar DTP. `nonegotiate` no se acepta en modos `dynamic`.
- Ver modo operativo: `show interfaces gi0/1 switchport` (Administrative Mode vs Operational Mode, Negotiation of Trunking).

## Native VLAN

- Tráfico de la native VLAN viaja SIN etiqueta por el trunk. Default: VLAN 1.
- Mismatch: CDP lo reporta con `%CDP-4-NATIVE_VLAN_MISMATCH` en ambos switches; el tráfico sin etiquetar cae en VLAN distinta en cada lado (fuga entre VLANs, problemas de STP).
- Riesgo de seguridad: VLAN hopping por double-tagging cuando la native VLAN coincide con la VLAN de un atacante en un puerto access.
- Buenas prácticas: native VLAN dedicada SIN puertos ni hosts (ej. 999), igual en ambos extremos; no usar VLAN 1 para usuarios ni gestión. Opcional `[IOS][PT?]`: `vlan dot1q tag native` (global) para etiquetar también la native.

## VLAN de gestión y SVI en switch L2

```
SW1(config)# vlan 99
SW1(config-vlan)# name GESTION
SW1(config)# interface vlan 99
SW1(config-if)# ip address 203.0.113.11 255.255.255.128
SW1(config-if)# no shutdown
SW1(config)# ip default-gateway 203.0.113.1
```
- En switch L2 (sin `ip routing`) se usa `ip default-gateway`, no rutas estáticas.
- Una SVI pasa a up/up solo si: la VLAN existe, la SVI no está en shutdown y hay al menos un puerto activo en esa VLAN (access o trunk que la transporte en estado forwarding).
- Acceso remoto (SSH, VTY): ver `references/cisco-ios.md`.

## Inter-VLAN routing

### 1. Legacy (un puerto físico por VLAN)
Cada VLAN usa un puerto access del switch conectado a una interfaz física distinta del router, con la IP gateway. No escala; solo didáctico.

### 2. Router-on-a-stick [PT][IOS][XE]
```
R1(config)# interface GigabitEthernet0/0
R1(config-if)# no shutdown                       ! física sin IP
R1(config)# interface GigabitEthernet0/0.10
R1(config-subif)# encapsulation dot1Q 10
R1(config-subif)# ip address 192.0.2.1 255.255.255.0
R1(config)# interface GigabitEthernet0/0.20
R1(config-subif)# encapsulation dot1Q 20
R1(config-subif)# ip address 198.51.100.1 255.255.255.0
R1(config)# interface GigabitEthernet0/0.99
R1(config-subif)# encapsulation dot1Q 99 native   ! solo si la 99 es native del trunk
R1(config-subif)# ip address 203.0.113.1 255.255.255.128
```
- El puerto del switch hacia el router debe ser `switchport mode trunk` con las VLANs permitidas.
- `encapsulation dot1Q` debe ir ANTES de `ip address` en la subinterfaz.
- Si la native del switch no es la del router, usar `native` en la subinterfaz correspondiente o dejar la native sin subinterfaz.

### 3. SVI en switch multicapa [PT: 3560/3650][IOS][XE]
```
DSW1(config)# ip routing
DSW1(config)# interface vlan 10
DSW1(config-if)# ip address 192.0.2.1 255.255.255.0
DSW1(config-if)# no shutdown
DSW1(config)# interface vlan 20
DSW1(config-if)# ip address 198.51.100.1 255.255.255.0
DSW1(config-if)# no shutdown
DSW1(config)# interface GigabitEthernet0/1
DSW1(config-if)# no switchport                    ! puerto ruteado hacia router/ISP
DSW1(config-if)# ip address 203.0.113.253 255.255.255.252
```
- Sin `ip routing` las SVIs existen pero el switch NO enruta entre ellas.
- 2960 en PT: no usar para enrutar. En hardware real, algunos 2960 con IOS 15 soportan ruteo estático con `sdm prefer lanbase-routing` + reload [HW]; verificar modelo.
- El puerto ruteado usa su propio segmento (/30) distinto de las VLANs de usuarios.

| Criterio | Legacy | Router-on-a-stick | SVI en multicapa |
|---|---|---|---|
| Puertos | 1 por VLAN | 1 trunk | Interno (backplane) |
| Escalabilidad | Muy baja | Media (cuello de botella en un enlace) | Alta |
| Rendimiento | Bueno por VLAN | Limitado por un enlace | Hardware (ASIC), el mejor |
| Costo | Muchos puertos de router | Bajo | Requiere switch L3 |
| Uso típico | Didáctico | Labs, sucursales pequeñas | Campus / producción |

## Port security

Requisito: puerto en modo estático (`switchport mode access`; en modo dynamic devuelve "is a dynamic port"). Algunas plataformas permiten también trunks.

```
SW1(config-if)# switchport mode access
SW1(config-if)# switchport port-security
SW1(config-if)# switchport port-security maximum 2
SW1(config-if)# switchport port-security mac-address sticky
SW1(config-if)# switchport port-security violation restrict
```
- Defaults: maximum 1, violation shutdown, sin sticky.
- `sticky` aprende MACs dinámicas y las escribe en running-config; hay que hacer `copy running-config startup-config` para conservarlas.

| Modo violation | Descarta tráfico | Syslog/SNMP | Incrementa contador | Puerto |
|---|---|---|---|---|
| `protect` | Sí | No | No | Sigue up |
| `restrict` | Sí | Sí | Sí | Sigue up |
| `shutdown` (default) | Sí | Sí | Sí | err-disabled |

Recuperación de err-disabled:
```
SW1(config)# interface fa0/5
SW1(config-if)# shutdown
SW1(config-if)# no shutdown
! Automática [IOS][XE][PT?]:
SW1(config)# errdisable recovery cause psecure-violation
SW1(config)# errdisable recovery interval 300
```
Verificación: `show port-security`, `show port-security interface fa0/5` (Port Status: Secure-shutdown, Violation Count, Last Source Address), `show port-security address`, `show interfaces status err-disabled`.

## EtherChannel

| Lado A \ Lado B | on | active (LACP) | passive (LACP) | desirable (PAgP) | auto (PAgP) |
|---|---|---|---|---|---|
| **on** | Sí | No | No | No | No |
| **active** | No | Sí | Sí | No | No |
| **passive** | No | Sí | **No** | No | No |
| **desirable** | No | No | No | Sí | Sí |
| **auto** | No | No | No | Sí | **No** |

- LACP = IEEE 802.3ad/802.1AX (estándar, multivendor); PAgP = propietario Cisco; `on` = sin protocolo (riesgo de bucle si un lado no está configurado).
- Hasta 8 enlaces activos por canal (LACP admite además hasta 8 en standby; verificar por plataforma).
- Consistencia obligatoria en todos los miembros: speed, duplex, modo (access/trunk), access VLAN o native/allowed VLANs, tipo L2/L3. Si difieren, los puertos quedan suspendidos (`s`).

```
SW1(config)# interface range GigabitEthernet0/1 - 2
SW1(config-if-range)# channel-group 1 mode active
SW1(config)# interface port-channel 1
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk allowed vlan 10,20,99
SW1(config)# port-channel load-balance src-dst-ip   ! global; opciones según plataforma
```
- Configurar después los cambios L2 sobre `interface port-channel 1`: se heredan a los miembros.
- Ver balanceo: `show etherchannel load-balance`.

Lectura de `show etherchannel summary`:
```
Group  Port-channel  Protocol    Ports
------+-------------+-----------+----------------------------
1      Po1(SU)         LACP      Gi0/1(P)    Gi0/2(P)
```
| Flag | Significado |
|---|---|
| `S` / `R` | Port-channel Layer 2 / Layer 3 |
| `U` | Port-channel en uso (OK). `SU` = L2 operativo, `RU` = L3 operativo |
| `D` | Down. `SD` = canal L2 caído |
| `P` | Miembro agrupado (bundled) — correcto |
| `I` | Stand-alone (no negocia, p.ej. otro lado sin canal) |
| `s` | Suspendido (inconsistencia de configuración) |
| `H` | Hot-standby (LACP) |

## CDP, LLDP y tabla MAC

| Acción | Comando | Soporte |
|---|---|---|
| CDP global on/off | `cdp run` / `no cdp run` | [PT][IOS][XE] |
| CDP por interfaz | `no cdp enable` | [PT][IOS][XE] |
| Vecinos CDP | `show cdp neighbors [detail]` | [PT][IOS][XE] |
| LLDP global | `lldp run` (deshabilitado por defecto en IOS) | [IOS][XE][PT?] |
| LLDP por interfaz | `lldp transmit` / `lldp receive` | [IOS][XE][PT?] |
| Vecinos LLDP | `show lldp neighbors [detail]` | [IOS][XE][PT?] |

- Producción: deshabilitar CDP/LLDP en puertos hacia usuarios/Internet (fuga de información), mantener en enlaces de infraestructura.

Tabla MAC:
- `show mac address-table` [PT][IOS][XE] (IOS muy antiguos: `show mac-address-table`).
- Filtros: `show mac address-table dynamic`, `... interface fa0/1`, `... vlan 10`, `... address 0011.2233.4455`.
- `clear mac address-table dynamic`; aging por defecto 300 s.
- Varias MACs en un puerto access = probablemente hub/switch no gestionado o teléfono IP + PC.

## Puertos no usados

```
SW1(config)# vlan 666
SW1(config-vlan)# name BLACKHOLE
SW1(config)# interface range fa0/11 - 24
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# switchport access vlan 666
SW1(config-if-range)# shutdown
```
- VLAN blackhole: sin SVI, sin ruteo y no permitida en ningún trunk.

## Comandos de verificación

| Comando | Qué revisar |
|---|---|
| `show vlan brief` | VLANs existentes, nombres, puertos access asignados (los trunks NO aparecen) |
| `show interfaces trunk` | Puertos trunk, modo, encapsulación, native VLAN, allowed, "active and not pruned" |
| `show interfaces fa0/1 switchport` | Modo administrativo/operativo, access VLAN, native, voice VLAN, negociación |
| `show interfaces status` | Estado (connected/notconnect/err-disabled), VLAN o "trunk", duplex, speed |
| `show etherchannel summary` | Flags de canal y miembros |
| `show port-security interface fa0/1` | Estado y violaciones |
| `show cdp neighbors` | Topología física real vs esperada |

## Inconsistencias que detectar

| Síntoma / hallazgo | Causa probable | Cómo confirmar / corregir |
|---|---|---|
| Un extremo trunk y el otro access | Modo estático distinto o DTP | `show interfaces switchport` en ambos; igualar a `trunk` |
| `%CDP-4-NATIVE_VLAN_MISMATCH` | Native distinta en cada lado | `show interfaces trunk`; igualar `native vlan` |
| Hosts de una VLAN no se ven entre switches | VLAN no está en allowed o fue reemplazada sin `add` | `show interfaces trunk` (columna allowed / active) |
| Puerto access "inactive" o VLAN ausente en otro switch | VLAN no creada en ese switch | `show vlan brief`; crear la VLAN |
| Host sin conectividad con su gateway | Puerto en VLAN equivocada | `show vlan brief` / `show mac address-table interface` |
| SVI down/down | VLAN sin puertos activos o no creada | `show ip interface brief`, `show vlan brief` |
| Port-channel `SD` o miembros `s`/`I` | Modos incompatibles o parámetros inconsistentes | `show etherchannel summary`, comparar config de miembros |
| Puerto `err-disabled` | Port security (psecure-violation) o BPDU guard | `show interfaces status err-disabled`, `show port-security interface` |
| Inter-VLAN no funciona en multicapa | Falta `ip routing` | `show running-config | include ip routing` |
| Router-on-a-stick sin respuesta | Física en shutdown, VLAN ID de `encapsulation` errado o puerto del switch no trunk | `show ip interface brief`, `show interfaces trunk` |

Diagnóstico general por capas: ver `references/troubleshooting.md`.
