# Routing (enrutamiento IPv4)

## Contenido
- [1. Cómo decide un router](#1-cómo-decide-un-router)
- [2. Leer `show ip route`](#2-leer-show-ip-route)
- [3. Rutas estáticas](#3-rutas-estáticas)
- [4. RIPv2](#4-ripv2)
- [5. OSPFv2](#5-ospfv2)
- [6. EIGRP](#6-eigrp)
- [7. BGP básico](#7-bgp-básico)
- [8. Redistribución (breve)](#8-redistribución-breve)
- [9. Verificación por protocolo](#9-verificación-por-protocolo)
- [10. Síntoma → causa probable](#10-síntoma--causa-probable)
- [11. Redundancia de gateway: HSRP](#11-redundancia-de-gateway-hsrp)
- [12. Métricas en la simulación del toolkit](#12-métricas-en-la-simulación-del-toolkit)

Etiquetas: `[PT]` Packet Tracer, `[IOS]` IOS clásico 15.x, `[XE]` IOS XE, `[HW]` requiere equipo real, `[PT?]` soporte en PT no confirmado (verificar en tu versión). Inter-VLAN routing (router-on-a-stick, SVI): ver `references/switching.md`.

---

## 1. Cómo decide un router

Orden de decisión para **instalar** y **usar** rutas:

1. **Longest prefix match** (al reenviar): gana la ruta con la máscara más larga que contenga el destino. Siempre se evalúa primero.
2. **Administrative distance (AD)** (al instalar en la RIB): si dos protocolos aprenden el **mismo prefijo con la misma longitud**, se instala el de menor AD.
3. **Métrica**: dentro del mismo protocolo, menor métrica gana. Empate → ECMP (balanceo; por defecto hasta 4 rutas en IOS, `maximum-paths` lo cambia).

### Ejemplo resuelto: longest prefix match

Tabla del router:

| Ruta | Next-hop |
|---|---|
| 10.1.0.0/16 | 10.0.0.1 |
| 10.1.1.0/24 | 10.0.0.2 |
| 10.1.1.128/25 | 10.0.0.3 |
| 0.0.0.0/0 | 203.0.113.1 |

| Destino | Rutas que coinciden | Elegida | Por qué |
|---|---|---|---|
| 10.1.1.130 | /16, /24, /25, /0 | 10.1.1.128/25 → 10.0.0.3 | .130 está en .128–.255; /25 es la más específica |
| 10.1.1.20 | /16, /24, /0 | 10.1.1.0/24 → 10.0.0.2 | .20 no cae en el /25 |
| 10.1.5.5 | /16, /0 | 10.1.0.0/16 → 10.0.0.1 | 10.1.5.x no está en 10.1.1.0/24 |
| 10.2.0.1 | /0 | default → 203.0.113.1 | sin default, el paquete se descarta (ICMP unreachable) |

> Una ruta /25 con AD 120 (RIP) **gana** sobre una /24 con AD 1 (estática) para 10.1.1.130: la AD solo compara prefijos idénticos.

### Administrative distance (valores por defecto Cisco)

| Origen | AD |
|---|---|
| Connected | 0 |
| Static | 1 |
| EIGRP summary | 5 |
| eBGP | 20 |
| EIGRP (interno) | 90 |
| OSPF | 110 |
| IS-IS | 115 |
| RIP | 120 |
| EIGRP externo (D EX) | 170 |
| iBGP | 200 |
| Desconocido / no confiable | 255 (nunca se instala) |

### Métrica por protocolo

| Protocolo | Métrica | Notas |
|---|---|---|
| RIP | Saltos (hop count) | 16 = inalcanzable; máx. 15 |
| OSPF | Costo = reference-bandwidth / bandwidth de interfaz | Ref. por defecto 100 Mbps; suma de costos de salida |
| EIGRP | Compuesta (bandwidth mínimo + delay acumulado con K por defecto) | Ver sección 6 |
| BGP | No es métrica: proceso de selección de atributos (weight, local-pref, AS-path, origin, MED…) | |
| Static | 0 | |

---

## 2. Leer `show ip route`

```
R1# show ip route
Codes: L - local, C - connected, S - static, R - RIP, O - OSPF, D - EIGRP, B - BGP,
       IA - OSPF inter area, E1/E2 - OSPF external type 1/2, EX - EIGRP external, * - candidate default
Gateway of last resort is 203.0.113.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 203.0.113.1
      10.0.0.0/8 is variably subnetted, 7 subnets, 3 masks
C        10.0.12.0/30 is directly connected, GigabitEthernet0/1
L        10.0.12.1/32 is directly connected, GigabitEthernet0/1
C        10.0.13.0/30 is directly connected, Serial0/0/0
L        10.0.13.1/32 is directly connected, Serial0/0/0
O        10.2.2.0/24 [110/2] via 10.0.12.2, 00:05:12, GigabitEthernet0/1
O IA     10.3.0.0/24 [110/3] via 10.0.12.2, 00:04:50, GigabitEthernet0/1
O E2     10.9.0.0/24 [110/20] via 10.0.12.2, 00:04:50, GigabitEthernet0/1
D EX     172.16.5.0/24 [170/2681856] via 10.0.13.2, 00:01:10, Serial0/0/0
```

| Código | Significado |
|---|---|
| `C` | Red directamente conectada (interfaz up/up con IP) |
| `L` | Dirección /32 de la propia interfaz (IOS 15+) |
| `S` | Ruta estática; `S*` = estática candidata a default |
| `O` | OSPF intra-área (LSA 1/2) |
| `O IA` | OSPF inter-área (LSA 3, vía ABR) |
| `O E2` | OSPF externa tipo 2 (por defecto en redistribución; costo fijo, no suma el interno). `O E1` sí suma |
| `O*E2` | Default externa inyectada con `default-information originate` |
| `D` | EIGRP interna; `D EX` = externa (redistribuida, AD 170) |
| `R` | RIP |
| `B` | BGP |

- `[110/2]` = `[AD/métrica]`. `via` = next-hop; `00:05:12` = antigüedad de la ruta.
- **Gateway of last resort**: la default activa. Si dice `not set`, no hay default → todo lo no coincidente se descarta.
- Filtrar: `show ip route ospf`, `show ip route static`, `show ip route 10.2.2.0` (detalle de un prefijo), `show ip route | include via` `[PT?]` para pipes.

---

## 3. Rutas estáticas

```
! Next-hop (requiere recursive lookup para hallar la interfaz)
R1(config)# ip route 192.168.20.0 255.255.255.0 10.0.12.2            [PT][IOS][XE]
! Interfaz de salida (solo recomendable en punto a punto/serial)
R1(config)# ip route 192.168.20.0 255.255.255.0 Serial0/0/0           [PT][IOS][XE]
! Fully specified (interfaz + next-hop): recomendada en Ethernet
R1(config)# ip route 192.168.20.0 255.255.255.0 g0/1 10.0.12.2        [PT][IOS][XE]
! Default
R1(config)# ip route 0.0.0.0 0.0.0.0 203.0.113.1                      [PT][IOS][XE]
! Flotante (backup): AD mayor que la ruta principal
R1(config)# ip route 0.0.0.0 0.0.0.0 198.51.100.1 5                   [PT][IOS][XE]
```

- **Recursive lookup**: con solo next-hop, el router busca el next-hop en la tabla para descubrir la interfaz de salida (2 búsquedas). Si el next-hop no es alcanzable, la ruta no se instala.
- **Solo interfaz en Ethernet**: el router hace ARP por cada destino y depende de proxy ARP del vecino. Evitar; usar fully specified.
- **Flotante**: solo aparece en la RIB cuando cae la principal. Para respaldar una ruta OSPF (AD 110) la flotante debe tener AD > 110 (p. ej. 130). Para respaldar otra estática (AD 1), basta AD > 1.
- Una estática con next-hop permanece aunque el vecino caiga si la interfaz local sigue up (Ethernet a switch). Para detectar fallos reales: IP SLA + `track` `[IOS][XE]` `[PT?]`.
- No olvidar la **ruta de retorno**: cada router intermedio y el destino necesitan ruta hacia el origen.

---

## 4. RIPv2

```
R1(config)# router rip                                  [PT][IOS]
R1(config-router)# version 2
R1(config-router)# no auto-summary
R1(config-router)# network 10.0.0.0                     ! classful: anuncia todas las interfaces en 10.x.x.x
R1(config-router)# network 192.168.10.0
R1(config-router)# passive-interface g0/0               ! LAN de usuarios: no enviar updates
R1(config-router)# default-information originate        ! anuncia una default; en RIP no exige tenerla en la RIB (a diferencia de OSPF) [verificar]
```

- `network` es **classful**: `network 10.1.1.0` se convierte en `10.0.0.0`. No admite wildcard.
- Updates cada 30 s a 224.0.0.9 (v2). Métrica: saltos; **máximo 15**, 16 = inalcanzable.
- `no auto-summary` es clave con redes discontiguas (subredes de una misma red mayor separadas por otra red).
- Limitaciones: convergencia lenta, hop count ignora ancho de banda, no escala. Uso actual: laboratorio/legado.

---

## 5. OSPFv2

### Configuración single-area

```
R1(config)# router ospf 1                                   [PT][IOS][XE]
R1(config-router)# router-id 1.1.1.1
R1(config-router)# network 10.0.12.0 0.0.0.3 area 0
R1(config-router)# network 192.168.10.0 0.0.0.255 area 0
R1(config-router)# passive-interface g0/0
R1(config-router)# auto-cost reference-bandwidth 10000      ! en Mbps; igual en TODOS los routers
R1(config-router)# default-information originate            ! requiere default en la RIB (o añadir "always")

! Alternativa por interfaz
R1(config)# interface g0/1
R1(config-if)# ip ospf 1 area 0                             [IOS][XE][PT?]
```

- **Process ID** (`router ospf 1`) es local; no necesita coincidir entre vecinos.
- **Router-ID** (orden de elección): 1) `router-id` manual, 2) IP más alta de loopback activa, 3) IP más alta de interfaz física activa. Cambiarlo exige `clear ip ospf process` (interrumpe adyacencias).
- `network <red> <wildcard> area <n>`: activa OSPF en interfaces cuya IP coincida. `network 10.0.12.1 0.0.0.0 area 0` activa exactamente esa interfaz.
- `passive-interface default` + `no passive-interface <if>` `[IOS][XE][PT?]`.

### Costo

`costo = reference-bandwidth / bandwidth` (mínimo 1). Con ref 100 Mbps: FastEthernet = 1, GigabitEthernet = 1 (¡no diferencia!), 10 Mbps = 10, T1 1.544 Mbps = 64. Con `auto-cost reference-bandwidth 10000`: Gi = 10, Fa = 100. Forzar: `ip ospf cost 50` en la interfaz. El comando `bandwidth` cambia el cálculo, no la velocidad real.

### DR/BDR y tipos de red

| Tipo de red | Ejemplo | DR/BDR | Hello/Dead |
|---|---|---|---|
| Broadcast | Ethernet | Sí | 10/40 s |
| Point-to-point | Serial HDLC/PPP, `ip ospf network point-to-point` | No | 10/40 s |
| NBMA | Frame Relay | Sí | 30/120 s |
| Point-to-multipoint | Configurado manualmente | No | 30/120 s |

- Elección DR: mayor `ip ospf priority` (defecto 1; **0 = nunca DR**), empate → mayor router-id. **No preemptiva**: un router con más prioridad que arranca después no reemplaza al DR (reiniciar con `clear ip ospf process`).
- En un enlace Ethernet entre 2 routers, `ip ospf network point-to-point` evita la elección y acelera la adyacencia.

### Estados de vecino

`Down → Init → 2-Way → ExStart → Exchange → Loading → Full`

- Entre dos DROTHER, quedarse en **2WAY/DROTHER es normal**. Con DR/BDR debe ser FULL.
- Atascado en **ExStart/Exchange** → casi siempre **MTU distinto**.
- Atascado en **Init** → hello unidireccional (ACL, filtrado de multicast 224.0.0.5).

### Requisitos de adyacencia (deben coincidir)

| Parámetro | Debe |
|---|---|
| Área | coincidir en el enlace |
| Subred y máscara | coincidir (salvo point-to-point en algunos casos) |
| Hello/Dead | coincidir |
| Autenticación (tipo y clave) | coincidir |
| MTU | coincidir (o `ip ospf mtu-ignore`) |
| Stub flag del área | coincidir |
| Router-ID | ser **único** |
| Interfaces | no pasivas en ambos lados |

### Multi-área

```
! ABR R2: una interfaz en área 0 y otra en área 1
R2(config)# router ospf 1
R2(config-router)# router-id 2.2.2.2
R2(config-router)# network 10.0.12.0 0.0.0.3 area 0
R2(config-router)# network 10.0.23.0 0.0.0.3 area 1
R2(config-router)# area 1 range 10.1.0.0 255.255.0.0      ! sumarización en el ABR
```

- Toda área no backbone debe tocar el **área 0** (o usar virtual link). ABR = une áreas; ASBR = redistribuye rutas externas.
- LSAs: 1 router, 2 network (DR), 3 summary (ABR → `O IA`), 4 ASBR summary, 5 external (`O E1/E2`), 7 NSSA.

---

## 6. EIGRP

```
R1(config)# router eigrp 100                               [PT][IOS][XE]
R1(config-router)# eigrp router-id 1.1.1.1
R1(config-router)# network 10.0.12.0 0.0.0.3
R1(config-router)# network 192.168.10.0 0.0.0.255
R1(config-router)# no auto-summary
R1(config-router)# passive-interface g0/0
```

- El **AS (100) debe coincidir** entre vecinos (a diferencia del process ID de OSPF). También K-values y subred; la autenticación si se usa.
- `auto-summary`: deshabilitado por defecto desde IOS 15.0(1)M; en PT y versiones antiguas puede venir activo → configurar `no auto-summary` siempre explícitamente.
- Hello 5 s / hold 15 s en LAN. Multicast 224.0.0.10. AD 90 interno, 170 externo, 5 summary.
- **Métrica por defecto** (K1=1, K3=1, K2=K4=K5=0): `256 × (10^7 / BW_mín_kbps + suma_delay_µs / 10)`. Solo cuentan el ancho de banda mínimo del camino y el delay acumulado.
- **Successor**: mejor ruta (menor Feasible Distance, FD). **Feasible successor**: ruta de respaldo cuyo **Reported/Advertised Distance < FD del successor** (feasibility condition). Si existe FS, la conmutación es inmediata, sin consultas (queries).
- Named mode (`router eigrp NOMBRE`) `[IOS][XE]` `[PT?]`.

```
show ip eigrp neighbors          ! vecinos, hold time, uptime, SRTT
show ip eigrp topology           ! successors (P = passive) y FS con FD/RD
show ip eigrp interfaces
show ip route eigrp
```

---

## 7. BGP básico

- **eBGP**: entre AS distintos (AD 20), vecinos normalmente directamente conectados (TTL 1). **iBGP**: mismo AS (AD 200), requiere full-mesh o route reflectors; el next-hop no cambia (usar `next-hop-self` `[IOS][XE]`).
- Sesión sobre TCP 179. Estados: Idle → Connect → Active → OpenSent → OpenConfirm → **Established**.

```
R1(config)# router bgp 65001                                 [PT][IOS][XE]
R1(config-router)# bgp router-id 1.1.1.1                     [PT?]
R1(config-router)# neighbor 198.51.100.2 remote-as 65002     ! eBGP
R1(config-router)# network 203.0.113.0 mask 255.255.255.0
```

- `network x mask y` **solo anuncia si existe una ruta exacta** (mismo prefijo y máscara) en la RIB. Truco habitual: `ip route 203.0.113.0 255.255.255.0 Null0`.
- PT: soporte limitado (eBGP básico, `neighbor`, `network`). Route-maps, atributos avanzados, route reflectors → `[HW]` o verificar en tu versión de PT.
- Verificar: `show ip bgp summary` (estado/prefijos recibidos), `show ip bgp`, `show ip route bgp`.

---

## 8. Redistribución (breve)

```
! Estáticas/conectadas hacia OSPF (sin "subnets" en IOS clásico solo pasan redes classful)
R1(config-router)# redistribute static subnets               [PT][IOS]
! Hacia EIGRP: requiere métrica (bw delay reliability load mtu)
R1(config-router)# redistribute ospf 1 metric 10000 100 255 1 1500
! Hacia RIP: requiere métrica en saltos
R1(config-router)# redistribute ospf 1 metric 2
```

- En IOS XE recientes `subnets` puede añadirse automáticamente; verificar en la versión.
- Riesgos: bucles y rutas subóptimas con redistribución mutua en varios puntos → usar filtros/tags `[IOS][XE]`. En un lab con un solo punto de redistribución no suele hacer falta.

---

## 9. Verificación por protocolo

| Objetivo | Comando |
|---|---|
| Protocolos activos, redes anunciadas, pasivas, vecinos de origen, AD | `show ip protocols` |
| Vecinos OSPF y estado | `show ip ospf neighbor` |
| Interfaces OSPF, costo, estado DR/BDR | `show ip ospf interface brief` / `show ip ospf interface g0/0` |
| Router-ID, áreas, SPF | `show ip ospf` |
| LSDB | `show ip ospf database` |
| Rutas de un protocolo | `show ip route ospf` / `eigrp` / `rip` / `static` |
| RIP | `show ip rip database` `[PT?]` |
| EIGRP | `show ip eigrp neighbors` / `topology` |
| Camino real | `traceroute` (IOS) / `tracert` (PC PT) |

`debug ip ospf adj`, `debug ip rip`, `debug eigrp packets` `[PT][IOS]`: útiles en lab. **En producción, `debug` puede saturar la CPU**: usar solo con filtros, en ventana de mantenimiento, con `terminal monitor` y apagar con `undebug all`.

---

## 10. Síntoma → causa probable

| Síntoma | Causa probable | Comprobar / corregir |
|---|---|---|
| No hay vecinos OSPF | Área, hello/dead, máscara, auth o MTU distintos; interfaz pasiva; router-ID duplicado; ACL bloquea 224.0.0.5 | `show ip ospf interface`, `debug ip ospf adj` |
| Vecino OSPF atascado en ExStart/Exchange | MTU distinto | Igualar MTU o `ip ospf mtu-ignore` |
| Ping llega pero no vuelve | Falta **ruta de retorno** en el destino o en un salto intermedio | `show ip route <origen>` en cada salto |
| Default no aparece en los demás routers | Falta `default-information originate`, o el router origen no tiene default en su RIB | `show ip route 0.0.0.0`; usar `always` solo si se entiende el riesgo |
| Rutas a subredes 172.16.x.x llegan como 172.16.0.0/16 o alternan | `auto-summary` activo en RIP/EIGRP | `no auto-summary` |
| Subredes de la misma red mayor separadas por otra red no se alcanzan | **Discontiguous networks** + sumarización classful | `no auto-summary`, usar protocolo classless |
| No hay vecinos EIGRP | AS distinto, K-values distintos, subred distinta, interfaz pasiva | `show ip protocols`, `show ip eigrp interfaces` |
| Ruta esperada no se instala | Otra fuente con menor AD para el mismo prefijo, o next-hop inalcanzable | `show ip route <prefijo>` |
| Tráfico usa camino lento con OSPF | Ref-bandwidth 100 Mbps iguala Fa y Gi | `auto-cost reference-bandwidth` en todos |
| Flotante nunca entra | La interfaz principal sigue up aunque el camino falle | IP SLA + `track` `[IOS][XE]` |
| BGP `network` no anuncia | No hay ruta exacta en la RIB | Estática a Null0 o corregir máscara |

Para metodología general de diagnóstico ver `references/troubleshooting.md`.

## 11. Redundancia de gateway: HSRP

HSRP (Cisco) hace que dos o más routers/switches L3 compartan una **IP virtual** (VIP) que los hosts usan como gateway. Uno es **activo** (responde por la VIP), otro **standby**; el resto escucha.

| Concepto | Valor |
|---|---|
| Elección del activo | Mayor `priority` (por defecto 100); empate: mayor IP de la interfaz |
| `preempt` | Sin él, un router de mayor prioridad que vuelve **no** recupera el rol activo |
| MAC virtual | v1: `0000.0c07.acXX` (XX = grupo en hex); v2: `0000.0c9f.fXXX` |
| Grupos | v1: 0-255; v2: 0-4095 (v2 también para IPv6) |
| Hello / hold | 3 s / 10 s por defecto |

```
DS1(config)# interface vlan 10
DS1(config-if)# ip address 10.1.10.2 255.255.255.0
DS1(config-if)# standby version 2
DS1(config-if)# standby 10 ip 10.1.10.1
DS1(config-if)# standby 10 priority 110
DS1(config-if)# standby 10 preempt
```
`[PT]` en routers ISR y switches 3560/3650. Verificación: `show standby brief` (columna State: Active/Standby). GLBP y VRRP: `[PT?]`.

Diseño: haga que el **activo HSRP de cada VLAN sea también el root de STP** de esa VLAN (`spanning-tree vlan X root primary`); si no, el tráfico hacia el gateway cruza el enlace entre distribuciones. Para repartir carga, alterne el activo por VLAN (DS1 en las pares, DS2 en las impares). En el modelo: `interfaces[].hsrp` (ver `references/model.md`); el validador avisa `STP-HSRP-MISALIGNED`, `HSRP-VIP-MISMATCH`, `HSRP-NO-PREEMPT`.

## 12. Métricas en la simulación del toolkit

`netlab routes` y el diagrama calculan las tablas como IOS: **OSPF** con costo = 100 Mbps / BW (Serial 64, FastEthernet 1, Gigabit 1; `auto-cost reference-bandwidth` y `bandwidth` lo cambian), **EIGRP** con la métrica compuesta K1=K3=1 `256 × (10^7/BWmín + Σretardo/10)` (retardos: Serial 20000 µs, FastEthernet 100 µs, Gigabit/SVI 10 µs), **RIP** en saltos. No modela ECMP (muestra un solo camino), variance, filtros ni redistribución.
