# Análisis de capturas, diagramas y configuraciones existentes

## Contenido
- [Regla de oro: CONFIRMADO / INFERIDO / DESCONOCIDO](#regla-de-oro-confirmado--inferido--desconocido)
- [Capturas de Packet Tracer o diagramas](#capturas-de-packet-tracer-o-diagramas)
- [Configuraciones y salidas show pegadas](#configuraciones-y-salidas-show-pegadas)
- [Del análisis al modelo](#del-análisis-al-modelo)
- [Importar configuraciones existentes](#importar-configuraciones-existentes)
- [Formato de respuesta](#formato-de-respuesta)

## Regla de oro: CONFIRMADO / INFERIDO / DESCONOCIDO

| Categoría | Criterio | Ejemplo |
|---|---|---|
| **CONFIRMADO** | Visible/legible sin interpretación | Etiqueta "Gig0/0" junto al router; texto "192.168.1.1/24" |
| **INFERIDO** | Deducido con razonamiento explícito; puede ser incorrecto | "Enlace punteado entre switches en PT → probablemente cable cruzado" |
| **DESCONOCIDO** | No visible ni deducible con confianza | Allowed VLAN del trunk, contraseñas, rutas, configuración interna |

Nunca rellene huecos con valores "típicos" presentados como hechos. Si para producir algo útil necesita suponer, suponga **explícitamente** y márquelo como INFERIDO.

## Capturas de Packet Tracer o diagramas

Identifique, en este orden:
1. **Dispositivos**: tipo por ícono (router redondo, switch rectangular con flechas, PC, servidor, nube, AP) y etiqueta/hostname. El modelo exacto (2911, 2960) solo es CONFIRMADO si se lee.
2. **Conexiones**: entre qué equipos; tipo de línea en PT (sólida negra = straight-through, punteada negra = cross-over, roja con rayo = serial, naranja = fibra, celeste = consola) — el tipo de cable es INFERIDO salvo leyenda.
3. **Interfaces**: etiquetas en los extremos (si PT muestra "Port Labels").
4. **Estado de enlaces**: triángulos/puntos verdes = up; rojos = down; naranja = STP bloqueando/convergiendo (en PT). El color es CONFIRMADO; su causa es INFERIDA.
5. **Direccionamiento y VLAN**: solo si hay texto/notas visibles.
6. **Errores visibles**: luces rojas, interfaz roja, PDU fallida (sobre con X), mensajes en pantalla.

Limitaciones: la resolución puede impedir leer etiquetas → márquelas DESCONOCIDO y pida una captura más grande o la salida de `show ip interface brief` / `show cdp neighbors`.

## Configuraciones y salidas show pegadas

| Fuente | Qué se puede confirmar |
|---|---|
| `show running-config` | Hostname, interfaces, IP, VLAN de puertos, trunks, routing, ACL, NAT, DHCP, líneas |
| `show ip interface brief` | Interfaces, IP, estado (status/protocol) |
| `show vlan brief` | VLAN existentes y puertos access |
| `show interfaces trunk` | Trunks, nativa, permitidas, activas, en forwarding |
| `show cdp neighbors [detail]` | Cableado real (equipo e interfaz remota), plataforma, IP del vecino |
| `show ip route` | Rutas efectivas (comparar con la simulación del modelo) |

Lea la configuración literal; no asuma valores por defecto sin decirlo (p. ej. "sin `switchport mode`, el 2960 negocia con DTP dynamic auto").

## Del análisis al modelo

1. Cree el modelo con lo CONFIRMADO; agregue lo INFERIDO con `"confidence": "inferred"` (equipos, interfaces o enlaces) y lo DESCONOCIDO con `"confidence": "unknown"` o simplemente omítalo y menciónelo.
2. `status` solo con evidencia (luces, `show`).
3. `validate` sobre ese modelo produce hipótesis de fallas; preséntelas como hipótesis cuando dependan de datos inferidos.
4. `render` muestra lo inferido con borde discontinuo y lo desconocido punteado con `?`.

## Importar configuraciones existentes

Cuando el usuario tenga acceso a los equipos (o a sus respaldos), es más fiable importar que transcribir:

1. Pedir por equipo: `show running-config` y `show cdp neighbors detail` (con el prompt visible, p. ej. `R1#show cdp neighbors detail`). Pueden ir en un mismo archivo `.txt` por equipo.
2. `node scripts/netlab.ts import <carpeta> -o red.net.json --name "Red X"`.
3. Revisar el reporte: equipos creados solo desde CDP (inferidos), enlaces inferidos por /30, secretos reemplazados por `<SECRETO>`, líneas en `extraConfig`.
4. Completar a mano lo que no está en una running-config: modelo de hardware (`model`), hosts y servidores, `tests`.
5. `validate` → hallazgos reales de la red existente; `render` → diagrama; a partir de aquí, el modelo es la documentación viva.

Qué reconoce: interfaces (IP, VLAN, trunk, subinterfaces, port-security, EtherChannel, HSRP, IPv6, OSPF/OSPFv3 por interfaz, NAT, ACL aplicadas, helper), VLAN, rutas estáticas, OSPF, OSPFv3, EIGRP, RIP, BGP, DHCP, NAT/PAT, ACL numeradas y nombradas, STP, SSH, NTP, syslog, SNMP, VPN crypto map; en ASA: interfaces con nameif, rutas y ACL. Lo demás se conserva en `extraConfig` (no verificado).

## Formato de respuesta

Use `templates/analysis-report.md`:

```
## Inventario detectado
| Elemento | Valor | Estado |
| R1 tipo | Router | CONFIRMADO (ícono + etiqueta) |
| R1 modelo | 2911 | INFERIDO (forma del ícono; no hay etiqueta de modelo) |
| Trunk SW1-SW2 VLAN permitidas | — | DESCONOCIDO |

## Problemas visibles
## Hipótesis (requieren verificación)
## Qué necesito para confirmar  (comandos o capturas concretas)
```
