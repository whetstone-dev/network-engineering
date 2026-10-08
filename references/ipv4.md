# IPv4: direccionamiento, subnetting y VLSM

## Contenido
- [Clases históricas (y cuándo todavía importan)](#clases-históricas-y-cuándo-todavía-importan)
- [CIDR, máscara y wildcard](#cidr-máscara-y-wildcard)
- [Tabla de prefijos (/8 a /32)](#tabla-de-prefijos-8-a-32)
- [Red, broadcast y rango: método del número mágico](#red-broadcast-y-rango-método-del-número-mágico)
- [Subnetting por número de subredes](#subnetting-por-número-de-subredes)
- [Subnetting por número de hosts](#subnetting-por-número-de-hosts)
- [VLSM paso a paso](#vlsm-paso-a-paso)
- [Summarization / supernetting](#summarization--supernetting)
- [Enlaces punto a punto: /30 vs /31](#enlaces-punto-a-punto-30-vs-31)
- [Rangos especiales](#rangos-especiales)
- [Convención de gateway](#convención-de-gateway)
- [Tabla de direccionamiento recomendada](#tabla-de-direccionamiento-recomendada)
- [Errores típicos y cómo detectarlos](#errores-típicos-y-cómo-detectarlos)

## Clases históricas (y cuándo todavía importan)

| Clase | Primer octeto | Bits iniciales | Máscara por defecto | Uso |
|---|---|---|---|---|
| A | 1–126 | `0` | /8 (255.0.0.0) | Unicast (0 y 127 reservados) |
| B | 128–191 | `10` | /16 (255.255.0.0) | Unicast |
| C | 192–223 | `110` | /24 (255.255.255.0) | Unicast |
| D | 224–239 | `1110` | — | Multicast |
| E | 240–255 | `1111` | — | Experimental / reservado |

El direccionamiento con clases está obsoleto (CIDR, RFC 4632), pero **la frontera de clase sigue apareciendo** en:
- **RIPv1**: classful, no envía máscara en las actualizaciones → no soporta VLSM ni redes discontiguas.
- **`auto-summary`**: RIPv2 lo trae activo por defecto en IOS clásico → usar `no auto-summary`. En EIGRP viene desactivado por defecto desde IOS 15.0(1)M; en Packet Tracer el valor por defecto depende de la versión → verificar con `show ip protocols`.
- **Sentencias `network` classful**: en RIP, `network 10.1.1.0` se guarda como `network 10.0.0.0`. En EIGRP sin wildcard, `network 172.16.0.0` cubre todas las interfaces 172.16.x.x. Para precisión en EIGRP/OSPF usar wildcard.
- **Redes discontiguas** + auto-summary = rutas resumidas en la frontera de clase que apuntan al lugar equivocado (pérdida de conectividad intermitente).

```
router rip
 version 2
 no auto-summary          ! [PT] [IOS]
 network 10.0.0.0         ! RIP siempre es classful en "network"
router eigrp 100
 no auto-summary          ! [PT] [IOS]
 network 172.16.1.0 0.0.0.255   ! con wildcard = preciso
```

`ip subnet-zero` está habilitado por defecto desde IOS 12.0: la subred cero es utilizable. Solo en material muy antiguo se descarta.

## CIDR, máscara y wildcard

- **Prefijo /n** = n bits de red en 1. Hosts útiles = 2^(32−n) − 2 (excepto /31 y /32).
- **Wildcard** = 255.255.255.255 − máscara. Se usa en ACL, `network` de OSPF/EIGRP.
- **Tamaño de bloque (número mágico)** = 256 − valor de la máscara en el octeto "interesante" (el último que no es 255).

## Tabla de prefijos (/8 a /32)

| Prefijo | Máscara | Wildcard | Bloque (octeto) | Hosts útiles |
|---|---|---|---|---|
| /8 | 255.0.0.0 | 0.255.255.255 | 1 (1º) | 16 777 214 |
| /9 | 255.128.0.0 | 0.127.255.255 | 128 (2º) | 8 388 606 |
| /10 | 255.192.0.0 | 0.63.255.255 | 64 (2º) | 4 194 302 |
| /11 | 255.224.0.0 | 0.31.255.255 | 32 (2º) | 2 097 150 |
| /12 | 255.240.0.0 | 0.15.255.255 | 16 (2º) | 1 048 574 |
| /13 | 255.248.0.0 | 0.7.255.255 | 8 (2º) | 524 286 |
| /14 | 255.252.0.0 | 0.3.255.255 | 4 (2º) | 262 142 |
| /15 | 255.254.0.0 | 0.1.255.255 | 2 (2º) | 131 070 |
| /16 | 255.255.0.0 | 0.0.255.255 | 1 (2º) | 65 534 |
| /17 | 255.255.128.0 | 0.0.127.255 | 128 (3º) | 32 766 |
| /18 | 255.255.192.0 | 0.0.63.255 | 64 (3º) | 16 382 |
| /19 | 255.255.224.0 | 0.0.31.255 | 32 (3º) | 8 190 |
| /20 | 255.255.240.0 | 0.0.15.255 | 16 (3º) | 4 094 |
| /21 | 255.255.248.0 | 0.0.7.255 | 8 (3º) | 2 046 |
| /22 | 255.255.252.0 | 0.0.3.255 | 4 (3º) | 1 022 |
| /23 | 255.255.254.0 | 0.0.1.255 | 2 (3º) | 510 |
| /24 | 255.255.255.0 | 0.0.0.255 | 1 (3º) / 256 (4º) | 254 |
| /25 | 255.255.255.128 | 0.0.0.127 | 128 (4º) | 126 |
| /26 | 255.255.255.192 | 0.0.0.63 | 64 (4º) | 62 |
| /27 | 255.255.255.224 | 0.0.0.31 | 32 (4º) | 30 |
| /28 | 255.255.255.240 | 0.0.0.15 | 16 (4º) | 14 |
| /29 | 255.255.255.248 | 0.0.0.7 | 8 (4º) | 6 |
| /30 | 255.255.255.252 | 0.0.0.3 | 4 (4º) | 2 |
| /31 | 255.255.255.254 | 0.0.0.1 | 2 (4º) | 2 (solo P2P, RFC 3021) |
| /32 | 255.255.255.255 | 0.0.0.0 | 1 (4º) | 1 (ruta de host / loopback) |

## Red, broadcast y rango: método del número mágico

1. Identificar el octeto interesante (primer octeto de la máscara distinto de 255).
2. Bloque = 256 − máscara en ese octeto.
3. Red = mayor múltiplo del bloque ≤ valor del octeto en la IP; octetos siguientes a 0.
4. Broadcast = red + bloque − 1 en ese octeto; octetos siguientes a 255.
5. Rango útil = red + 1 … broadcast − 1.

**Ejemplo 1 — 192.168.10.77/27**
- Máscara 255.255.255.224 → octeto 4, bloque 256 − 224 = 32.
- Múltiplos: 0, 32, 64, 96 → 77 cae en 64–95.
- Red **192.168.10.64**, broadcast **192.168.10.95**, rango **.65 – .94**, 30 hosts.

**Ejemplo 2 — 10.20.77.15/20**
- Máscara 255.255.240.0 → octeto 3, bloque 16.
- Múltiplos: …, 48, 64, 80 → 77 cae en 64–79.
- Red **10.20.64.0**, broadcast **10.20.79.255**, rango **10.20.64.1 – 10.20.79.254**, 4 094 hosts.

## Subnetting por número de subredes

Bits prestados b tal que 2^b ≥ subredes requeridas. Nuevo prefijo = prefijo original + b.

**Ejemplo:** 192.168.1.0/24, se necesitan 6 subredes.
- 2^3 = 8 ≥ 6 → b = 3 → **/27** (bloque 32, 30 hosts c/u, 2 subredes de reserva).

| # | Red | Rango útil | Broadcast |
|---|---|---|---|
| 0 | 192.168.1.0/27 | .1 – .30 | .31 |
| 1 | 192.168.1.32/27 | .33 – .62 | .63 |
| 2 | 192.168.1.64/27 | .65 – .94 | .95 |
| 3 | 192.168.1.96/27 | .97 – .126 | .127 |
| 4 | 192.168.1.128/27 | .129 – .158 | .159 |
| 5 | 192.168.1.160/27 | .161 – .190 | .191 |
| 6–7 | .192/27, .224/27 | reserva | — |

## Subnetting por número de hosts

Bits de host h tal que 2^h − 2 ≥ hosts requeridos. Prefijo = 32 − h.

**Ejemplo:** 172.16.0.0/16, cada subred necesita 50 hosts.
- 2^6 − 2 = 62 ≥ 50 → h = 6 → **/26**.
- Subredes disponibles: 2^(26−16) = 1 024. Primeras: 172.16.0.0/26, 172.16.0.64/26, 172.16.0.128/26, 172.16.0.192/26, 172.16.1.0/26…

Regla de crecimiento (producción): dimensionar para el número actual **+ 20–30 %** como mínimo, o saltar al siguiente prefijo si el margen queda bajo. En laboratorio se usa el ajuste exacto que pida el enunciado.

## VLSM paso a paso

1. Listar requisitos de hosts por segmento (incluir gateway, impresoras, APs, crecimiento).
2. **Ordenar de mayor a menor.**
3. Para cada uno, elegir el prefijo más pequeño que cumpla 2^h − 2 ≥ hosts.
4. Asignar desde la primera dirección libre, **alineada al tamaño del bloque** (la red debe ser múltiplo de su bloque).
5. Dejar los enlaces P2P (/30 o /31) al final.
6. Registrar el espacio libre restante.

**Ejemplo:** 192.168.10.0/24 — VENTAS 100, ADMIN 50, TI 25, SERVIDORES 10, 3 enlaces WAN.

| Segmento | Hosts | Prefijo | Red | Rango útil | Broadcast |
|---|---|---|---|---|---|
| VENTAS | 100 | /25 (126) | 192.168.10.0 | .1 – .126 | .127 |
| ADMIN | 50 | /26 (62) | 192.168.10.128 | .129 – .190 | .191 |
| TI | 25 | /27 (30) | 192.168.10.192 | .193 – .222 | .223 |
| SERVIDORES | 10 | /28 (14) | 192.168.10.224 | .225 – .238 | .239 |
| WAN R1–R2 | 2 | /30 | 192.168.10.240 | .241 – .242 | .243 |
| WAN R1–R3 | 2 | /30 | 192.168.10.244 | .245 – .246 | .247 |
| WAN R2–R3 | 2 | /30 | 192.168.10.248 | .249 – .250 | .251 |
| Libre | — | /30 | 192.168.10.252 | — | — |

Por qué ordenar: si se asigna primero un /28 en .0, el /25 ya no puede empezar en .0 y queda desalineado o sin espacio.

## Summarization / supernetting

Procedimiento: escribir en binario el octeto que cambia, contar los bits comunes desde la izquierda; prefijo resumen = bits comunes totales.

**Ejemplo:** 172.16.0.0/24, 172.16.1.0/24, 172.16.2.0/24, 172.16.3.0/24.
- 3er octeto: 0 = `000000|00`, 1 = `000000|01`, 2 = `000000|10`, 3 = `000000|11`.
- 16 + 6 = 22 bits comunes → **172.16.0.0/22** (exacto, sin sobrantes).

Condiciones para un resumen limpio: cantidad de redes potencia de 2 **y** la primera alineada al bloque (p. ej. 10.1.4.0–10.1.7.0 → 10.1.4.0/22 sí; 10.1.3.0–10.1.6.0 no cabe en un /22 único: un 10.1.0.0/21 incluiría redes ajenas → sobre-resumen y posible blackhole).

```
interface g0/0
 ip summary-address eigrp 100 172.16.0.0 255.255.252.0   ! [PT] [IOS]
router ospf 1
 area 1 range 172.16.0.0 255.255.252.0                   ! en ABR [PT?] [IOS]
ip route 172.16.0.0 255.255.252.0 10.0.0.2               ! estática resumida [PT] [IOS]
```

Ver `references/routing.md` para detalles por protocolo.

## Enlaces punto a punto: /30 vs /31

| | /30 | /31 (RFC 3021) |
|---|---|---|
| Direcciones | 4 (red, 2 hosts, broadcast) | 2 (ambas utilizables) |
| Eficiencia | 50 % | 100 % |
| Soporte | Universal | IOS moderno [IOS] [XE]; en Ethernet IOS puede mostrar un aviso; PT [PT?] |
| Recomendación | Laboratorio / CCNA / Packet Tracer | Producción con muchos enlaces P2P |

```
interface g0/1
 ip address 10.255.0.0 255.255.255.254   ! /31: el otro extremo usa 10.255.0.1
```

## Rangos especiales

| Rango | Uso | Referencia |
|---|---|---|
| 10.0.0.0/8 | Privado | RFC 1918 |
| 172.16.0.0/12 (172.16.0.0 – 172.31.255.255) | Privado | RFC 1918 |
| 192.168.0.0/16 | Privado | RFC 1918 |
| 100.64.0.0/10 | Shared address space (CGNAT del ISP); no usar como LAN interna | RFC 6598 |
| 169.254.0.0/16 | Link-local / APIPA: el host no obtuvo DHCP | RFC 3927 |
| 127.0.0.0/8 | Loopback del host (127.0.0.1) | RFC 1122 |
| 0.0.0.0/8 | "Esta red"; 0.0.0.0/0 = ruta por defecto | RFC 1122 |
| 255.255.255.255/32 | Broadcast limitado | RFC 919 |
| 224.0.0.0/4 | Multicast (224.0.0.5/6 OSPF, 224.0.0.10 EIGRP, 224.0.0.9 RIPv2) | RFC 5771 |
| 240.0.0.0/4 | Reservado | RFC 1112 |
| 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 | Documentación | RFC 5737 |
| 198.18.0.0/15 | Pruebas de rendimiento (benchmarking) | RFC 2544 |

Diagnóstico rápido: un PC con 169.254.x.x → no llegó al servidor DHCP (revisar `ip helper-address`, VLAN, pool, cableado).

## Convención de gateway

- **Primera útil (.1)**: la más común en documentación y labs.
- **Última útil (.254 en un /24)**: alternativa frecuente en algunas organizaciones.
- **Regla**: elegir una y aplicarla en **todas** las subredes; documentarla.
- Con FHRP (HSRP/VRRP/GLBP): IP virtual = .1, routers físicos .2 y .3 (convención común, no norma).
- Reservar un bloque bajo para infraestructura (p. ej. .1–.10: gateway, switches, APs) y excluirlo del pool DHCP:

```
ip dhcp excluded-address 192.168.10.1 192.168.10.10   ! [PT] [IOS]
```

## Tabla de direccionamiento recomendada

Una fila por segmento; mismo formato en todos los entregables:

| VLAN | Nombre | Red | Máscara | Gateway | Rango útil | Broadcast | Hosts |
|---|---|---|---|---|---|---|---|
| 10 | VENTAS | 192.168.10.0/25 | 255.255.255.128 | 192.168.10.1 | .1 – .126 | 192.168.10.127 | 126 |
| 20 | ADMIN | 192.168.10.128/26 | 255.255.255.192 | 192.168.10.129 | .129 – .190 | 192.168.10.191 | 62 |
| 30 | TI | 192.168.10.192/27 | 255.255.255.224 | 192.168.10.193 | .193 – .222 | 192.168.10.223 | 30 |
| 99 | GESTION | 192.168.99.0/24 | 255.255.255.0 | 192.168.99.1 | .1 – .254 | 192.168.99.255 | 254 |

Complementar con una tabla por dispositivo: | Dispositivo | Interfaz | IP | Máscara | Gateway | Descripción |.

## Errores típicos y cómo detectarlos

| Error | Síntoma | Detección / corrección |
|---|---|---|
| Asignar la IP de red o broadcast a un host | IOS rechaza con un mensaje tipo `Bad mask`; en PCs, sin conectividad | Recalcular con el número mágico |
| Máscara inconsistente entre extremos o hosts del mismo segmento | Conectividad parcial, ARP fallido, adyacencias OSPF sin formar | `show ip interface brief`, `show running-config interface`, `ipconfig` en PC |
| Gateway fuera de la subred del host | El host no alcanza otras redes | Verificar que gateway ∈ rango útil |
| Solapamiento de subredes | IOS rechaza con mensaje `overlaps with` en el mismo router; entre routers, enrutamiento erróneo | Revisar plan VLSM; `show ip route` |
| Gateway del PC ≠ IP de la SVI/subinterfaz | Inter-VLAN no funciona | `show ip interface brief` en el L3 |
| VLSM sin alinear al bloque | Red "inválida" (p. ej. 192.168.1.16/27) | La red debe ser múltiplo del bloque |
| Usar 100.64/10 o rangos públicos ajenos en la LAN | Conflictos con ISP/Internet | Usar RFC 1918 |
| Auto-summary con redes discontiguas | Rutas hacia la red classful por dos caminos | `no auto-summary` (RIPv2/EIGRP) |
