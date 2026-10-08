# Cisco IOS / IOS XE — convenciones y política anti-alucinación

## Contenido
- [Política de veracidad de comandos](#política-de-veracidad-de-comandos)
- [Etiquetas de soporte](#etiquetas-de-soporte)
- [Modos de la CLI](#modos-de-la-cli)
- [IOS vs IOS XE vs Packet Tracer](#ios-vs-ios-xe-vs-packet-tracer)
- [Nombres de interfaz por plataforma](#nombres-de-interfaz-por-plataforma)
- [Plantilla base de un equipo](#plantilla-base-de-un-equipo)
- [Orden correcto al configurar](#orden-correcto-al-configurar)
- [Comandos de verificación esenciales](#comandos-de-verificación-esenciales)
- [Guardar, borrar y recuperar](#guardar-borrar-y-recuperar)
- [Errores de sintaxis frecuentes](#errores-de-sintaxis-frecuentes)

## Política de veracidad de comandos

1. **Prefiera generar con `netlab config`**: el generador solo emite comandos estándar, ya revisados.
2. Si escribe comandos a mano, use solo los que aparecen en estas referencias o que conoce con certeza. Si no está seguro de la sintaxis exacta, de un parámetro o de que la plataforma lo soporte, **dígalo** ("verificar con `?` en la CLI") en lugar de presentarlo como seguro.
3. Nunca invente palabras clave, opciones ni salidas de `show`. Las salidas de ejemplo deben marcarse como **ilustrativas**.
4. Indique siempre la plataforma: un comando correcto en IOS XE puede no existir en un 2960 o en Packet Tracer.
5. Lo que el modelo no cubre va en `extraConfig` y se reporta como no verificado.

## Etiquetas de soporte

| Etiqueta | Significado |
|---|---|
| `[PT]` | Funciona en Cisco Packet Tracer (8.x) |
| `[PT?]` | Soporte en PT no confirmado o dependiente de la versión: verificar |
| `[IOS]` | IOS clásico 15.x (ISR G2: 1941/2901/2911, Catalyst 2960/3560) |
| `[XE]` | IOS XE (ISR 4000, Catalyst 3650/3850/9000) |
| `[HW]` | Requiere equipo/software real; no existe o no funciona en PT |

## Modos de la CLI

| Prompt | Modo | Entrar | Salir |
|---|---|---|---|
| `R1>` | EXEC usuario | login | `exit` |
| `R1#` | EXEC privilegiado | `enable` | `disable` |
| `R1(config)#` | Configuración global | `configure terminal` | `end` / Ctrl+Z |
| `R1(config-if)#` | Interfaz | `interface g0/0` | `exit` |
| `R1(config-subif)#` | Subinterfaz | `interface g0/0.10` | `exit` |
| `R1(config-if-range)#` | Rango | `interface range f0/1 - 10` | `exit` |
| `R1(config-line)#` | Línea | `line vty 0 4` | `exit` |
| `R1(config-router)#` | Protocolo | `router ospf 1` | `exit` |
| `R1(dhcp-config)#` | Pool DHCP | `ip dhcp pool X` | `exit` |
| `R1(config-ext-nacl)#` | ACL nombrada | `ip access-list extended X` | `exit` |

Desde configuración, los comandos EXEC se ejecutan con `do` (p. ej. `do show ip interface brief`) `[PT]`.

## IOS vs IOS XE vs Packet Tracer

| Tema | IOS 15 (ISR G2 / 2960 / 3560) | IOS XE (ISR 4000 / 3650 / 9000) | Packet Tracer |
|---|---|---|---|
| Nombres de interfaz | `Gi0/0`, `Fa0/1` | `Gi0/0/0` (ISR4k), `Gi1/0/1` (3650) | Igual que el modelo emulado |
| `switchport trunk encapsulation dot1q` | Requerido en 3560/3750; no existe en 2960 | 3650/3850: solo dot1q, normalmente no existe — verificar | Igual que el modelo |
| Routing en switch | 3560: `ip routing` | `ip routing` | `[PT]` en 3560/3650 |
| Licencias | `license boot module ... securityk9` para IPsec/ZBF | Smart licensing `[HW]` | `[PT]` en 2911 (requiere reload) |
| `show running-config | section X` | Sí | Sí | `[PT?]` (soporte parcial de pipes) |
| `write memory` / `copy run start` | Sí | Sí | `[PT]` |
| `ip ospf <pid> area <a>` en interfaz | Sí | Sí | `[PT?]` → preferir `network ... area` |
| SNMPv3, NetFlow, EEM, `archive` | Sí | Sí | `[HW]` |

## Nombres de interfaz por plataforma

Use `node scripts/netlab.ts catalog <modelo>`. Resumen:

| Modelo | Interfaces integradas |
|---|---|
| 1841 / 2811 | `FastEthernet0/0-1` |
| 1941 / 2901 | `GigabitEthernet0/0-1` |
| 2911 | `GigabitEthernet0/0-2` |
| ISR4321 / ISR4331 | `GigabitEthernet0/0/0-1` / `0/0/0-2` |
| 2960-24TT | `FastEthernet0/1-24`, `GigabitEthernet0/1-2` |
| 3560-24PS | `FastEthernet0/1-24`, `GigabitEthernet0/1-2` |
| 3650-24PS | `GigabitEthernet1/0/1-24`, `GigabitEthernet1/1/1-4` |
| PC-PT / Server-PT / Laptop-PT | `FastEthernet0` (Laptop con módulo Wi-Fi: `Wireless0`) |

Seriales: módulo HWIC-2T en ISR G2 → `Serial0/0/0-1`; NIM-2T en ISR4k → `Serial0/1/0-1`. Instalar con el equipo **apagado**.

## Plantilla base de un equipo

```
enable
configure terminal
hostname R1
no ip domain-lookup
enable secret <SECRETO>
service password-encryption
banner motd #Acceso solo para personal autorizado#
line console 0
 password <SECRETO>
 login
 logging synchronous
exit
```
`no ip domain-lookup` evita la espera cuando se escribe mal un comando (en labs). En producción, si se usa DNS para resolver nombres, no lo deshabilite: configure `ip name-server`.

## Orden correcto al configurar

1. Hostname, seguridad básica.
2. VLAN (en switches) **antes** de asignarlas a puertos.
3. ACL **antes** de aplicarlas (`ip access-group`): una ACL aplicada sin definir no filtra nada en IOS (permite todo); en algunas versiones el comportamiento varía — no lo deje así.
4. Interfaces: en subinterfaces, `encapsulation dot1Q` **antes** de `ip address`; en trunks del 3560, `encapsulation` **antes** de `mode trunk`.
5. EtherChannel: miembros con `channel-group` y luego `interface Port-channel`.
6. Routing, servicios (DHCP, NAT), líneas VTY/SSH (el hostname y `ip domain-name` deben existir antes de `crypto key generate rsa`).
7. `end` y `write memory`.

## Comandos de verificación esenciales

| Objetivo | Comando |
|---|---|
| Estado L1/L2 y L3 resumido | `show ip interface brief` |
| Detalle de interfaz (errores, duplex) | `show interfaces g0/0` |
| VLAN y puertos | `show vlan brief` |
| Trunks (modo, nativa, permitidas, activas) | `show interfaces trunk` |
| Modo administrativo/operativo de un puerto | `show interfaces f0/1 switchport` |
| Tabla MAC | `show mac address-table` |
| STP | `show spanning-tree [vlan N]` |
| Vecinos | `show cdp neighbors [detail]`, `show lldp neighbors` |
| Routing | `show ip route`, `show ip protocols` |
| OSPF | `show ip ospf neighbor`, `show ip ospf interface brief` |
| DHCP | `show ip dhcp binding`, `show ip dhcp pool` |
| NAT | `show ip nat translations`, `show ip nat statistics` |
| ACL (contadores) | `show access-lists` |
| Config | `show running-config`, `show startup-config` |

Las salidas no se inventan: si se muestra un ejemplo de salida, debe rotularse "salida ilustrativa".

## Guardar, borrar y recuperar

- Guardar: `copy running-config startup-config` (pide confirmar el nombre: Enter) o `write memory` (sin preguntas; mejor para pegar en bloque).
- Borrar config: `erase startup-config` + `reload`. En switches, la base VLAN está en `flash:vlan.dat` (`delete vlan.dat`).
- Recuperación de contraseña: requiere acceso físico (registro de configuración `0x2142` en routers) `[HW]`; en PT existe un procedimiento parcial `[PT?]`.

## Errores de sintaxis frecuentes

| Mensaje IOS (paráfrasis) | Causa |
|---|---|
| `% Invalid input detected at '^' marker.` | Comando inexistente en ese modo o plataforma |
| `% Incomplete command.` | Faltan parámetros |
| `% Ambiguous command` | Abreviatura demasiado corta |
| `... overlaps with ...` | Dos interfaces del mismo equipo en subredes solapadas |
| `Bad mask` / `Inconsistent address and mask` | Máscara inválida o red con bits de host en `ip route`/`network` |
| `Command rejected: ... is a dynamic port` | `port-security` sobre puerto sin `switchport mode access` |
| `% Access VLAN does not exist. Creating vlan X` | Aviso (no error): IOS crea la VLAN al asignarla |
