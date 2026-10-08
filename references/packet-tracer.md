# Cisco Packet Tracer — módulo especializado

## Contenido
- [Flujo para construir un laboratorio desde cero](#flujo-para-construir-un-laboratorio-desde-cero)
- [Dispositivos recomendados](#dispositivos-recomendados)
- [Cableado](#cableado)
- [Módulos y hardware](#módulos-y-hardware)
- [Configuración por GUI (equipos finales y servidores)](#configuración-por-gui-equipos-finales-y-servidores)
- [Pegar configuraciones en la CLI](#pegar-configuraciones-en-la-cli)
- [Modo simulación y pruebas](#modo-simulación-y-pruebas)
- [Qué soporta y qué no](#qué-soporta-y-qué-no)
- [Problemas típicos propios de PT](#problemas-típicos-propios-de-pt)
- [Entrega estándar de un laboratorio PT](#entrega-estándar-de-un-laboratorio-pt)

## Flujo para construir un laboratorio desde cero

1. Requisitos → modelo `*.net.json` con `meta.target: "packet-tracer"` y modelos de PT (`2911`, `2960-24TT`, `PC-PT`…).
2. `node scripts/netlab.ts validate lab.net.json` hasta 0 errores.
3. `node scripts/netlab.ts build lab.net.json` → `topology.html`, `README.md`, `configs/*.txt`.
4. En PT: colocar equipos con el **mismo hostname** que el modelo, cablear según la tabla de conexiones (puerto exacto), instalar módulos si hay seriales/fuente.
5. Pegar `configs/<equipo>.txt` en cada CLI (pestaña CLI) e ingresar la IP de PCs/servidores por GUI según las instrucciones generadas.
6. Esperar la convergencia (luces naranjas → verdes; STP tarda ~30 s con PVST, menos con Rapid PVST). Botón **Fast Forward Time** acelera.
7. Ejecutar las pruebas del modelo (`ping` desde Desktop > Command Prompt) y los comandos de verificación.

## Dispositivos recomendados

| Rol | Modelo PT | Notas |
|---|---|---|
| Router de lab CCNA | **2911** (`Gi0/0-2`) | IOS 15; licencia securityk9 para VPN/ZBF |
| Router IOS XE | **ISR4331** (`Gi0/0/0-2`) | Sintaxis XE de interfaces |
| Switch de acceso | **2960-24TT** | L2 puro; sin `trunk encapsulation`; una SVI de gestión |
| Switch multicapa | **3560-24PS** (IOS) o **3650-24PS** (XE) | El 3650 llega **sin fuente**: arrastrar `AC-POWER-SUPPLY` |
| Firewall | ASA 5506-X / 5505 | Sintaxis ASA (no IOS); el generador no la produce |
| PC / Laptop / Servidor | PC-PT, Laptop-PT, Server-PT | IP por GUI; servidores con servicios por GUI |
| Wi-Fi | AccessPoint-PT, WRT300N / HomeRouter, WLC + LAP `[PT?]` | Ver `references/wireless.md` |
| WAN/ISP | Router 2911 como ISP, Cloud-PT | Loopback para simular hosts de Internet (8.8.8.8/32) |

Evite `Router-PT`/`Switch-PT` genéricos salvo que se pida: no existen como hardware real.

## Cableado

| Conexión | Cable en PT | Nota |
|---|---|---|
| PC/router/servidor ↔ switch | Copper Straight-Through | Equipos distintos |
| switch ↔ switch, router ↔ router, PC ↔ router, PC ↔ PC | Copper Cross-Over | Equipos iguales (DTE-DTE o DCE-DCE) |
| Router ↔ router serial | Serial DCE / DTE | El extremo DCE define `clock rate` |
| Consola | Console (RS-232 → puerto Console) | PC: Desktop > Terminal |
| Fibra | Fiber | Requiere puertos SFP/fibra |
| Automático | "Automatically Choose Connection Type" (rayo) | Útil, pero en enlaces seriales elige el extremo DCE solo; documente el puerto real |

Muchos equipos reales tienen Auto-MDIX (el tipo de cable no importa); el validador lo indica como nota, no como error.

## Módulos y hardware

- **Apagar** el equipo (interruptor en la pestaña Physical) antes de insertar o quitar módulos; volver a encender.
- Seriales: HWIC-2T (1941/2901/2911) → `Serial0/0/0`, `Serial0/0/1` en el slot 0.
- ISR4331: NIM-2T → `Serial0/1/0-1`.
- 3650-24PS: `AC-POWER-SUPPLY` en el slot de energía; los uplinks `Gi1/1/1-4` son del módulo de red.
- Laptop Wi-Fi: quitar el módulo Ethernet y poner `WPC300N` → aparece `Wireless0`.

## Configuración por GUI (equipos finales y servidores)

- PC/Laptop: **Desktop > IP Configuration** (Static o DHCP; IPv6 Automatic/Static) — `ipconfig`, `ipconfig /renew`, `ping`, `tracert` en **Desktop > Command Prompt**.
- Server-PT, pestaña **Services**: DHCP (un pool por red: Pool Name, Default Gateway, DNS Server, Start IP Address, Subnet Mask, Maximum Number of Users), DNS (registros A/CNAME, Service On), HTTP/HTTPS, FTP, TFTP, EMAIL, NTP, SYSLOG, AAA.
- Un servidor DHCP en otra subred requiere `ip helper-address <IP del servidor>` en el gateway de los clientes.
- El generador (`netlab config`) produce estas instrucciones para cada host/servidor del modelo.

## Pegar configuraciones en la CLI

- Pegar desde EXEC usuario (`R1>`): los bloques generados empiezan con `enable` / `configure terminal`.
- Si el equipo ya tiene `enable secret`, `enable` pedirá contraseña y el pegado se desfasa: escriba `enable` y la clave a mano y pegue desde `configure terminal`.
- `crypto key generate rsa general-keys modulus 1024`: algunas versiones de PT preguntan igualmente el tamaño; responder `1024`.
- Se usa `write memory` (sin preguntas) en vez de `copy running-config startup-config` (pide confirmar).
- Pegue por equipo, no todo a la vez; revise que no aparezcan `% Invalid input`.

## Modo simulación y pruebas

- **Realtime** (por defecto) vs **Simulation** (barra inferior derecha): en simulación se ven las PDU paso a paso, filtrables por protocolo (ICMP, ARP, DHCP, OSPF, STP…). Ideal para enseñar ARP, DHCP DORA y encapsulación 802.1Q.
- **Add Simple PDU** (sobre) = ping rápido entre dos equipos; la tabla inferior muestra Successful/Failed.
- El primer ping puede perder paquetes por ARP: repetir antes de concluir que falla.
- **Activity Wizard** permite crear actividades evaluables (instructor) `[PT]`.
- El `trace` del modelo (`netlab trace`) anticipa el resultado esperado; si PT difiere, el modelo o la construcción en PT no coinciden: compare con `show` reales.

## Qué soporta y qué no

| Generalmente soportado `[PT]` | Limitado o variable `[PT?]` | No soportado `[HW]` |
|---|---|---|
| VLAN, trunk, DTP, VTP, STP/RSTP, EtherChannel (LACP/PAgP), port-security | `show ... \| section/include` | SNMPv3 completo, NetFlow, EEM, Python/guestshell |
| Static, RIPv2, OSPFv2 single/multi-área, EIGRP, BGP básico | OSPF por interfaz (`ip ospf 1 area 0`), redistribución compleja | MPLS, QoS avanzado (MQC completo), VRF-lite completo |
| DHCP (router y Server-PT), relay, NAT/PAT, ACL std/ext/nombradas | ZBF, IPsec (requiere licencia securityk9), GRE | Cifrado tipo 9 (scrypt), AAA/RADIUS completo en todos los equipos |
| SSH v2, NTP, Syslog, CDP, LLDP básico | IPv6 avanzado (DHCPv6 stateful en todos los modelos) | Automatización (NETCONF/RESTCONF) |
| HSRP `[PT]` en 2911/3560 | DHCP snooping/DAI | |

Ante la duda: indique `[PT?]` y proponga verificarlo con `?` en la CLI del equipo concreto.

## Problemas típicos propios de PT

| Síntoma | Causa |
|---|---|
| Luces naranjas por ~30 s en puertos de switch | STP en listening/learning (normal); usar PortFast en hosts |
| Luz roja en enlace | Cable equivocado, interfaz `shutdown` (routers vienen apagados) o equipo apagado |
| 3650 no enciende | Falta la fuente `AC-POWER-SUPPLY` |
| No aparecen interfaces Serial | Falta el módulo (instalar apagado) |
| PC con IP 169.254.x.x | DHCP no respondió (pool, helper, VLAN/trunk) |
| Primer ping 1/4 o 2/4 | ARP; repetir |
| `crypto key generate` falla | Falta `hostname` o `ip domain-name` |
| Cambios perdidos al reabrir | No se guardó (`write memory`) ni el archivo .pkt |

## Entrega estándar de un laboratorio PT

1. Lista de dispositivos (modelo PT exacto y módulos).
2. Topología (diagrama interactivo + Mermaid opcional).
3. Tabla de conexiones con puerto exacto y tipo de cable.
4. Tablas de VLAN y de direccionamiento.
5. Configuración por equipo (CLI) e instrucciones GUI para hosts/servidores.
6. Routing inter-VLAN / protocolos, DHCP, NAT según el caso.
7. Comandos de verificación con lo que se espera ver.
8. Pruebas (ping esperados OK/FALLA) y troubleshooting de los fallos más probables.
