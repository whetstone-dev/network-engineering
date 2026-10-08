# Spanning Tree Protocol (STP, PVST+, RSTP, MST)

## Contenido
- [Variantes de STP](#variantes-de-stp)
- [Bridge ID y elección del root](#bridge-id-y-elección-del-root)
- [Costos de puerto](#costos-de-puerto)
- [Roles y estados de puerto](#roles-y-estados-de-puerto)
- [Temporizadores y convergencia](#temporizadores-y-convergencia)
- [Proceso de elección paso a paso](#proceso-de-elección-paso-a-paso)
- [Ejemplo resuelto: 3 switches](#ejemplo-resuelto-3-switches)
- [Comandos de configuración](#comandos-de-configuración)
- [Verificación y lectura de la salida](#verificación-y-lectura-de-la-salida)
- [Problemas típicos](#problemas-típicos)
- [Diseño recomendado](#diseño-recomendado)
- [Simulación con el toolkit](#simulación-con-el-toolkit)

Etiquetas: `[PT]` Packet Tracer, `[IOS]` IOS 15.x, `[XE]` IOS XE, `[HW]` solo hardware real, `[PT?]` no confirmado en PT.

## Variantes de STP

| Protocolo | Estándar | Instancias | Convergencia | Notas |
|---|---|---|---|---|
| STP | IEEE 802.1D | 1 para todas las VLANs (CST) | 30–50 s | Original |
| PVST+ | Cisco | 1 por VLAN | 30–50 s | Default en muchos switches Cisco (2960 en PT) |
| RSTP | IEEE 802.1w (hoy en 802.1D-2004) | 1 | ~segundos o menos | Proposal/agreement, edge ports |
| Rapid PVST+ | Cisco | 1 por VLAN | Rápida | Recomendado en entornos Cisco |
| MST | IEEE 802.1s (hoy en 802.1Q) | Instancias que agrupan VLANs | Rápida (basado en RSTP) | Escala mejor con muchas VLANs; requiere misma región (nombre, revisión, mapeo VLAN→instancia) |

- PVST+/Rapid PVST+ por VLAN permite balancear carga: root distinto por grupo de VLANs.
- MST: `spanning-tree mode mst` + `spanning-tree mst configuration` (`name`, `revision`, `instance 1 vlan 10,20`) [IOS][XE][PT?]. Fuera del alcance típico de CCNA; verificar soporte en la versión de PT.

## Bridge ID y elección del root

Bridge ID (8 bytes) = **prioridad (4 bits) + extended system ID (12 bits = VLAN ID) + MAC (6 bytes)**.

- Prioridad configurable 0–61440 en **múltiplos de 4096**. Default 32768.
- Lo que muestra IOS = prioridad + VLAN. Ej.: VLAN 1 → 32769; VLAN 10 con prioridad 24576 → 24586.
- Root bridge = **BID más bajo** (prioridad primero; si empatan, MAC más baja).
- Con todo por defecto gana el switch con MAC más baja, que suele ser el más antiguo: casi nunca es el deseado.

## Costos de puerto

| Velocidad | Costo corto (802.1D-1998, default en IOS clásico) | Costo largo (802.1t / `pathcost method long`) |
|---|---|---|
| 10 Mbps | 100 | 2,000,000 |
| 100 Mbps | 19 | 200,000 |
| 1 Gbps | 4 | 20,000 |
| 10 Gbps | 2 | 2,000 |

- Cambiar método: `spanning-tree pathcost method long` [IOS][XE][PT?]; debe ser igual en todos los switches.
- Algunas plataformas IOS XE recientes usan método largo por defecto: verificar con `show spanning-tree summary` ("Pathcost method used").
- Costo manual por interfaz: `spanning-tree cost 10` o `spanning-tree vlan 10 cost 10`.
- Root path cost = suma de costos de los puertos de ENTRADA (hacia el root) a lo largo del camino.

## Roles y estados de puerto

| Rol | Descripción |
|---|---|
| Root port (RP) | En cada switch no-root, el puerto con mejor camino al root. Uno por switch (por VLAN) |
| Designated port (DP) | En cada segmento, el puerto que reenvía hacia ese segmento. Todos los puertos del root son DP |
| Alternate (RSTP) | Camino alternativo al root, bloqueado; reemplaza rápido al RP |
| Backup (RSTP) | Respaldo de un DP en el mismo segmento compartido (hub); raro hoy |
| Non-designated (802.1D) | Término clásico para puerto bloqueado |

| 802.1D | RSTP | Aprende MAC | Reenvía tramas |
|---|---|---|---|
| Disabled | Discarding | No | No |
| Blocking | Discarding | No | No |
| Listening | Discarding | No | No |
| Learning | Learning | Sí | No |
| Forwarding | Forwarding | Sí | Sí |

- En `show spanning-tree` con Rapid PVST+, el estado discarding aparece como `BLK`.

## Temporizadores y convergencia

| Timer | Default | Uso |
|---|---|---|
| Hello | 2 s | Intervalo de envío de BPDUs por el root |
| Forward delay | 15 s | Tiempo en listening y en learning (802.1D) |
| Max age | 20 s | Tiempo que se guarda una BPDU antes de descartarla (802.1D) |

- 802.1D: puerto nuevo → listening 15 s + learning 15 s = 30 s; fallo indirecto: max age 20 + 30 = 50 s.
- RSTP: vecino perdido tras 3 hellos perdidos (6 s); enlaces point-to-point full-duplex convergen por proposal/agreement sin esperar timers; edge ports (PortFast) pasan directo a forwarding.
- Los timers se toman del root; no se recomienda modificarlos (`spanning-tree vlan 10 hello-time`, `forward-time`, `max-age`) salvo diseño justificado.

## Proceso de elección paso a paso

1. **Root bridge**: BID más bajo de toda la topología (por VLAN en PVST+).
2. **Root port** en cada switch no-root, por desempate en orden:
   1. Menor root path cost.
   2. Menor BID del vecino que envía la BPDU.
   3. Menor port ID del vecino (prioridad de puerto, default 128, + número de puerto).
   4. (Si aplica) menor port ID local.
3. **Designated port** en cada segmento: el puerto del switch con menor root path cost; empate → menor BID; empate → menor port ID.
4. Puertos restantes → **alternate/blocking**.

Prioridad de puerto: `spanning-tree port-priority 64` (interfaz), valores 0–240 en múltiplos de 16; afecta la elección del VECINO.

## Ejemplo resuelto: 3 switches

Topología en triángulo, todos los enlaces 1 Gbps (costo 4), prioridades por defecto (32769 en VLAN 1):

| Switch | MAC | BID |
|---|---|---|
| SW1 | 000A.0000.0001 | 32769.000A.0000.0001 |
| SW2 | 000A.0000.0002 | 32769.000A.0000.0002 |
| SW3 | 000A.0000.0003 | 32769.000A.0000.0003 |

Enlaces: SW1 Gi0/1 – SW2 Gi0/1; SW1 Gi0/2 – SW3 Gi0/1; SW2 Gi0/2 – SW3 Gi0/2.

1. Root: empate de prioridad → MAC más baja → **SW1**. Gi0/1 y Gi0/2 de SW1 = DP.
2. Root port SW2: directo vía Gi0/1 = 4; vía SW3 = 8 → **Gi0/1 RP**. SW3: Gi0/1 = 4 → **Gi0/1 RP**.
3. Segmento SW2–SW3: ambos con root path cost 4 → empate → menor BID = SW2 → **SW2 Gi0/2 DP**.
4. **SW3 Gi0/2 = alternate (BLK)**. Bucle eliminado.

Para que SW2 fuera root: `SW2(config)# spanning-tree vlan 1 root primary` (o `priority 24576`).

## Comandos de configuración

| Comando | Modo | Efecto | Soporte |
|---|---|---|---|
| `spanning-tree mode rapid-pvst` | global | Activa Rapid PVST+ | [PT][IOS][XE] |
| `spanning-tree mode pvst` | global | PVST+ | [PT][IOS][XE] |
| `spanning-tree vlan 10 root primary` | global | Macro: prioridad 24576, o menor que el root actual si este ya es ≤ 24576 | [PT][IOS][XE] |
| `spanning-tree vlan 10 root secondary` | global | Macro: prioridad 28672 | [PT][IOS][XE] |
| `spanning-tree vlan 10 priority 4096` | global | Prioridad explícita (múltiplo de 4096) | [PT][IOS][XE] |
| `spanning-tree portfast` | interfaz | Puerto access pasa directo a forwarding | [PT][IOS][XE] |
| `spanning-tree portfast default` | global | PortFast en todos los puertos access | [IOS][PT?] |
| `spanning-tree bpduguard enable` | interfaz | err-disable si llega BPDU | [PT][IOS][XE] |
| `spanning-tree portfast bpduguard default` | global | BPDU guard en todos los puertos PortFast | [IOS][PT?] |
| `spanning-tree guard root` | interfaz | Root guard: bloquea (root-inconsistent) si llega BPDU superior | [IOS][XE][PT?] |
| `spanning-tree guard loop` | interfaz | Loop guard: evita que un alternate/root pase a forwarding si deja de recibir BPDUs | [IOS][XE][PT?] |
| `spanning-tree loopguard default` | global | Loop guard global | [IOS][XE][PT?] |
| `errdisable recovery cause bpduguard` | global | Recuperación automática | [IOS][XE][PT?] |

- En IOS 15.2+ y IOS XE la sintaxis puede ser `spanning-tree portfast edge`, `spanning-tree portfast edge default` y `spanning-tree portfast edge bpduguard default`; verificar en la versión.
- `root primary` es un cálculo de un solo momento: si luego aparece un switch con prioridad menor, no se reajusta. En producción preferir `priority` explícita.
- `spanning-tree portfast trunk` (o `portfast edge trunk`) solo para trunks hacia servidores/hipervisores, nunca hacia switches.

Plantilla puerto de acceso (lab y producción):
```
SW1(config)# interface range fa0/1 - 24
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# spanning-tree portfast
SW1(config-if-range)# spanning-tree bpduguard enable
```

## Verificación y lectura de la salida

| Comando | Uso | Soporte |
|---|---|---|
| `show spanning-tree` | Todas las VLANs | [PT][IOS][XE] |
| `show spanning-tree vlan 10` | Una VLAN | [PT][IOS][XE] |
| `show spanning-tree summary` | Modo, PortFast/BPDU guard default, pathcost method, conteo por estado | [PT][IOS][XE] |
| `show spanning-tree interface gi0/1 [detail]` | Puerto en todas las VLANs | [IOS][XE][PT?] |
| `show spanning-tree root` | Root de cada VLAN | [IOS][XE][PT?] |

Ejemplo (formato aproximado; varía por versión):
```
VLAN0010
  Spanning tree enabled protocol rstp
  Root ID    Priority    24586
             Address     000A.0000.0001
             Cost        4
             Port        25 (GigabitEthernet0/1)
  Bridge ID  Priority    32778  (priority 32768 sys-id-ext 10)
             Address     000A.0000.0003
Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- ------------------
Fa0/1            Desg FWD 19        128.1    P2p Edge
Gi0/1            Root FWD 4         128.25   P2p
Gi0/2            Altn BLK 4         128.26   P2p
```
Cómo leerlo:
- `protocol rstp` = Rapid PVST+; `ieee` = PVST+.
- "This bridge is the root" en Root ID → este switch es root. Si no, `Cost` y `Port` indican el root path cost y el root port.
- Root ID vs Bridge ID: si son iguales, es root.
- Role: `Root`, `Desg`, `Altn`, `Back`. Sts: `FWD`, `BLK`, `LRN`, `LIS`.
- Type: `P2p` (full duplex), `Shr` (half duplex/compartido), `Edge` (PortFast activo). `*ROOT_Inc`, `*BKN*` o `*TYPE_Inc` indican inconsistencias (root guard, etc.).

## Problemas típicos

| Problema | Síntoma | Causa / solución |
|---|---|---|
| Root no deseado | Tráfico recorre caminos subóptimos; `show spanning-tree` muestra un switch de acceso como root | Prioridades por defecto. Fijar `priority` en core/distribución; root guard en downlinks |
| Bucle L2 / broadcast storm | CPU alta, MAC flapping (`%SW_MATM-4-MACFLAP_NOTIF`), LEDs saturados | STP deshabilitado, `channel-group mode on` mal hecho, enlace unidireccional. Revisar, usar loop guard/UDLD [HW] |
| PortFast en enlace entre switches | Bucles transitorios al reconectar | Quitar PortFast en uplinks; BPDU guard lo detectaría |
| Puerto err-disabled por BPDU guard | `%SPANTREE-2-BLOCK_BPDUGUARD`, puerto `err-disabled` | Alguien conectó un switch en puerto access. Retirar el equipo, `shutdown`/`no shutdown` |
| Modo distinto entre switches | Convergencia lenta en algunos segmentos | Igualar `spanning-tree mode`; RSTP interopera con 802.1D pero cae a timers clásicos en ese enlace |
| VLAN sin root esperado en PVST+ | Una VLAN funciona distinto que otra | Root se configura por VLAN: revisar cada `spanning-tree vlan X` |

## Diseño recomendado

- **Producción**: Rapid PVST+ (o MST con muchas VLANs). Root primario en core/distribución (`priority 4096` o `24576`), secundario en el par redundante (`28672` o un escalón por encima).
- Alinear root STP con el gateway activo (HSRP/VRRP active) por VLAN para evitar tráfico que cruce el enlace entre distribuciones. Balanceo: VLANs pares root/HSRP active en DSW1, impares en DSW2.
- Puertos de acceso: PortFast + BPDU guard. Downlinks hacia acceso desde distribución: root guard.
- No deshabilitar STP aunque la topología "no tenga bucles".
- **Académico/laboratorio (PT)**: fijar explícitamente root primary/secondary para resultados predecibles; documentar qué puerto queda bloqueado y verificarlo con `show spanning-tree vlan X`.
- Ver troubleshooting general en `references/troubleshooting.md` y sintaxis IOS en `references/cisco-ios.md`.

## Simulación con el toolkit

`netlab validate` calcula STP por VLAN y por dominio L2 conectado: root bridge (prioridad + extended system ID + MAC), costo al root (método corto: 10M=100, 100M=19, 1G=4, 10G=2; EtherChannel por ancho agregado, p. ej. 2×100M=12), puerto root y puertos designated/alternate. Diagnósticos: `STP-ROOT`, `STP-BLOCKED` (puertos alternate), `STP-ROOT-UNDESIRED` (root en un switch de acceso habiendo core/distribución), `STP-TIE-MAC` (empate de prioridad con bucles: sin `mac` en el modelo se desempata por id, avisándolo), `STP-HSRP-MISALIGNED`.

Aproximaciones: `root primary` se modela como 24576 y `root secondary` como 28672 (IOS puede bajar más si otro switch ya tiene menor prioridad); no simula temporizadores, BPDU guard/root guard ni MST por instancia. En el diagrama, los puertos bloqueados se ven en ámbar (filtrar por VLAN para ver los de una VLAN).
