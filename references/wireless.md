# Redes inalámbricas (WLAN)

## Contenido
- [Estándares 802.11](#estándares-80211)
- [Bandas y canales](#bandas-y-canales)
- [Conceptos: SSID, BSS, ESS](#conceptos-ssid-bss-ess)
- [Arquitecturas: autonomous vs lightweight + WLC](#arquitecturas-autonomous-vs-lightweight--wlc)
- [Seguridad inalámbrica](#seguridad-inalámbrica)
- [Mejores prácticas](#mejores-prácticas)
- [Planificación](#planificación)
- [Integración con la red cableada](#integración-con-la-red-cableada)
- [Packet Tracer: inalámbrico](#packet-tracer-inalámbrico)
- [Troubleshooting inalámbrico](#troubleshooting-inalámbrico)

Etiquetas: `[PT]` Packet Tracer, `[PT?]` no confirmado / depende de la versión de PT, `[HW]` solo hardware real.

## Estándares 802.11

| Estándar | Nombre Wi-Fi | Año aprox. | Banda(s) | Velocidad teórica máx. |
|---|---|---|---|---|
| 802.11 | — | 1997 | 2.4 GHz | 2 Mbps |
| 802.11b | — | 1999 | 2.4 GHz | 11 Mbps |
| 802.11a | — | 1999 | 5 GHz | 54 Mbps |
| 802.11g | — | 2003 | 2.4 GHz | 54 Mbps |
| 802.11n | Wi-Fi 4 | 2009 | 2.4 y 5 GHz | 600 Mbps (4 streams, 40 MHz) |
| 802.11ac | Wi-Fi 5 | 2013 | 5 GHz | ~6.9 Gbps (máx. del estándar: 8 streams, 160 MHz; equipos wave 2 reales ~3.5 Gbps con 4 streams) |
| 802.11ax | Wi-Fi 6 / 6E | 2019 / 2021 | 2.4, 5 (+6 GHz en 6E) | ~9.6 Gbps |
| 802.11be | Wi-Fi 7 | 2024 | 2.4, 5, 6 GHz | ~46 Gbps (teórico) |

- Las velocidades son máximas teóricas de PHY; el throughput real suele ser menos de la mitad (medio compartido, half-duplex, CSMA/CA, overhead).
- Tecnologías clave: MIMO (11n), MU-MIMO downlink (11ac wave 2), OFDMA + BSS coloring + TWT (11ax).

## Bandas y canales

| Banda | Alcance | Interferencia | Canales sin solapamiento (20 MHz) | Notas |
|---|---|---|---|---|
| 2.4 GHz | Mayor, atraviesa mejor paredes | Alta (Bluetooth, microondas, vecinos) | 1, 6, 11 (América). Algunas regiones permiten 1/5/9/13: verificar normativa local | Solo 3 canales útiles; evitar 40 MHz |
| 5 GHz | Menor | Baja | ~20–25 según país (UNII-1/2/2e/3) | Canales DFS pueden cambiar si detectan radar |
| 6 GHz | Menor aún | Muy baja | Hasta 59 canales de 20 MHz (según regulación) | Solo Wi-Fi 6E/7; WPA3 u OWE obligatorios |

- Ancho de canal: 20/40/80/160 (y 320 MHz en Wi-Fi 7). Más ancho = más velocidad pero menos canales independientes.
- Producción: 2.4 GHz en 20 MHz; 5 GHz en 20 o 40 MHz en alta densidad, 80 MHz en baja densidad.

## Conceptos: SSID, BSS, ESS

| Término | Significado |
|---|---|
| SSID | Nombre lógico de la red (hasta 32 caracteres). Ocultarlo NO es seguridad |
| BSS | Un AP + sus clientes asociados |
| BSSID | MAC de la radio/SSID del AP que identifica el BSS |
| ESS | Varios BSS con el mismo SSID unidos por un sistema de distribución (LAN cableada); permite roaming |
| IBSS | Ad hoc, sin AP |
| Mapeo SSID↔VLAN | Cada SSID se asocia a una VLAN en el lado cableado (AP en trunk o WLC con interfaces dinámicas) |

## Arquitecturas: autonomous vs lightweight + WLC

| Aspecto | Autonomous AP | Lightweight AP (LAP) + WLC |
|---|---|---|
| Configuración | Individual en cada AP | Centralizada en el WLC |
| Protocolo | — | CAPWAP (UDP 5246 control cifrado con DTLS, UDP 5247 datos) |
| Funciones | Todo en el AP | Split-MAC: tiempo real en el AP; autenticación, roaming, RRM, políticas en el WLC |
| Escala | Pocos APs | Decenas a miles |
| Puerto del switch | Trunk si sirve varias VLANs | Access (modo local: datos tunelizados al WLC) |
| Variantes | — | FlexConnect (conmutación local en sucursal), cloud-managed (p.ej. Meraki) |

- Descubrimiento del WLC por el LAP: broadcast L2 en la misma subred, DHCP option 43, DNS (`CISCO-CAPWAP-CONTROLLER.<dominio>`), o configuración previa.
- El puerto del WLC hacia el switch normalmente es trunk (interfaces dinámicas = una VLAN por WLAN).

## Seguridad inalámbrica

| Método | Cifrado | Autenticación | Estado |
|---|---|---|---|
| Open | Ninguno | Ninguna | Solo con portal cautivo/aislamiento (invitados) |
| OWE (Enhanced Open) | AES | Ninguna (cifrado oportunista) | Alternativa moderna a Open |
| WEP | RC4 | Clave compartida | **Obsoleto, roto en minutos. No usar** |
| WPA | TKIP (RC4) | PSK o 802.1X | Obsoleto |
| WPA2-Personal (PSK) | AES-CCMP | Passphrase compartida | Aceptable en hogar/pyme con clave fuerte |
| WPA2-Enterprise | AES-CCMP | 802.1X/EAP con servidor RADIUS (p.ej. Cisco ISE) | Estándar corporativo |
| WPA3-Personal | AES (CCMP/GCMP) | SAE (resistente a diccionario offline) | Recomendado |
| WPA3-Enterprise | AES (modo 192-bit opcional) | 802.1X/EAP + RADIUS | Recomendado en corporativo |

- 802.1X: suplicante (cliente) ↔ autenticador (AP/WLC) ↔ servidor de autenticación (RADIUS, UDP 1812/1813).
- Modo transición WPA2/WPA3 para compatibilidad con clientes antiguos.

## Mejores prácticas

- No usar WEP ni TKIP; AES (CCMP) como mínimo, WPA3 cuando todos los clientes lo soporten.
- SSID de invitados en VLAN separada, con ACL/firewall que solo permita Internet; aislamiento de clientes (client/peer-to-peer isolation).
- Corporativo: WPA2/WPA3-Enterprise con RADIUS, no PSK compartida entre empleados.
- Pocos SSIDs (cada SSID genera beacons y consume airtime; regla práctica ≤ 3–4 por radio).
- Gestión del AP/WLC en VLAN de gestión, no en la VLAN de usuarios.
- Cambiar credenciales por defecto de APs/routers domésticos y deshabilitar WPS.
- **Académico/laboratorio**: WPA2-PSK con AES es suficiente; documentar SSID, clave y VLAN. **Producción**: Enterprise + segmentación + monitoreo de rogue APs.

## Planificación

- **Site survey**: predictivo (software sobre planos) y/o pasivo/activo en sitio; medir RSSI (objetivo típico ≥ -67 dBm para voz/datos), SNR (≥ 25 dB) y solapamiento entre celdas (~15–20 % para roaming).
- **Co-channel interference (CCI)**: APs cercanos en el mismo canal comparten airtime. Alternar 1/6/11 en 2.4 GHz y no reutilizar canales en celdas adyacentes.
- **Adjacent channel interference**: usar canales no solapados (no 1/3/6).
- **Potencia**: más potencia no es mejor; celdas grandes generan clientes "pegajosos" y asimetría (el cliente transmite con menos potencia que el AP). En alta densidad: más APs, menos potencia.
- Considerar materiales (concreto, vidrio, metal), densidad de usuarios, aplicaciones (voz requiere más cobertura) y PoE disponible en el switch.
- Con WLC: RRM (Radio Resource Management) ajusta canal y potencia automáticamente.

## Integración con la red cableada

Ejemplo: WLAN corporativa en VLAN 10 (192.0.2.0/24), invitados en VLAN 30 (198.51.100.0/24), gestión de APs/WLC en VLAN 99 (203.0.113.0/24).

```
! Puerto hacia un LAP en modo local: access en la VLAN de gestión de APs (+ PoE si aplica)
SW1(config)# interface gi1/0/10
SW1(config-if)# switchport mode access
SW1(config-if)# switchport access vlan 99
SW1(config-if)# spanning-tree portfast
! Puerto hacia el WLC (o AP autónomo con varios SSID): trunk con las VLANs de las WLANs
SW1(config)# interface gi1/0/24
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk allowed vlan 10,30,99
! Pool DHCP para los LAP con option 43 apuntando al WLC 203.0.113.10 [IOS][PT?]
R1(config)# ip dhcp pool APS
R1(dhcp-config)# network 203.0.113.0 255.255.255.0
R1(dhcp-config)# default-router 203.0.113.1
R1(dhcp-config)# option 43 hex f104cb00710a
```
- Option 43 (formato Cisco, TLV): `f1` + longitud (`04` × número de WLCs) + IP de cada WLC en hex. 203.0.113.10 → cb.00.71.0a → `f104cb00710a`. Verificar soporte de option 43 en la versión de PT.
- Si el DHCP está en otra VLAN: `ip helper-address` en la SVI/subinterfaz (ver `references/routing.md`).
- La VLAN de invitados no debe tener ruta hacia redes internas: ACL en la SVI o firewall.

## Packet Tracer: inalámbrico

| Dispositivo PT | Configuración | Notas |
|---|---|---|
| AccessPoint-PT (también -A, -N, -AC según versión) | Pestaña Config > **Port 1** (radio): SSID, canal, autenticación (Disabled/WEP/WPA-PSK/WPA2-PSK...), cifrado (AES/TKIP), passphrase | Se configura por GUI, no CLI. Port 0 = Ethernet hacia el switch. Actúa como bridge (no da DHCP) [PT] |
| WRT300N / HomeRouter-PT (-AC) | Pestaña **GUI**: Setup > Internet Setup (DHCP / Static IP / PPPoE en el puerto Internet), Network Setup (IP LAN, servidor DHCP: IP inicial, número de usuarios), Wireless > Basic Wireless Settings (modo, SSID, canal), Wireless Security (WPA2 Personal, AES, passphrase) | Router doméstico con NAT y DHCP. IP LAN por defecto típica 192.168.0.1: verificar en la versión de PT. Guardar con "Save Settings" en cada pantalla [PT] |
| Laptop-PT | Pestaña Physical: **apagar el equipo**, quitar el módulo Ethernet (PT-LAPTOP-NM-1CFE), arrastrar módulo inalámbrico (p.ej. **WPC300N**), encender | Sin apagar no deja cambiar el módulo [PT] |
| PC-PT | Igual: apagar, quitar NIC, instalar módulo inalámbrico (p.ej. WMP300N) | [PT] |
| Conexión del cliente | **Desktop > PC Wireless** (con módulos Linksys): Connect, elegir SSID, ingresar clave. Alternativa: Config > Wireless0 (SSID, autenticación, clave, IP DHCP/estática) | Luego verificar IP en Desktop > IP Configuration o `ipconfig` [PT] |
| WLC-2504 (también WLC-PT/3504 según versión) | GUI web desde un PC en la red de gestión; configurar interfaces, WLANs (SSID, seguridad, interfaz/VLAN) | `[PT?]` disponibilidad y opciones varían por versión de PT (≥ 7.x) |
| LAP (p.ej. LAP-PT, 3702i) | Requiere energía (PoE o adaptador en Physical), IP por DHCP y alcanzar al WLC (misma subred o DHCP option 43) | `[PT?]` verificar según versión; la asociación al WLC puede tardar |

Flujo típico de lab con AccessPoint-PT:
1. Switch con VLAN de usuarios + router/servidor DHCP para esa VLAN.
2. AccessPoint-PT Port 0 → puerto access del switch en la VLAN de usuarios.
3. Port 1: SSID `LAB-WIFI`, canal 1/6/11, WPA2-PSK + AES, passphrase ≥ 8 caracteres.
4. Laptop con WPC300N → PC Wireless → conectar → verificar IP por DHCP y `ping` al gateway.

## Troubleshooting inalámbrico

| Síntoma | Revisar |
|---|---|
| Cliente no ve el SSID | Banda compatible (módulo 2.4 GHz vs AP solo 5 GHz, p.ej. AccessPoint-PT-A), SSID broadcast habilitado, radio encendida, distancia/alcance (en PT el rango se ve como círculo; acercar el equipo) |
| Ve el SSID pero no asocia | Tipo de autenticación y cifrado iguales en AP y cliente (WPA2-PSK/AES vs TKIP), passphrase exacta (sensible a mayúsculas) |
| Asocia pero IP 169.254.x.x | DHCP: servidor/pool existe, `ip helper-address` si el DHCP está en otra VLAN, VLAN del puerto del AP correcta (ver `references/routing.md` / `references/troubleshooting.md`) |
| IP correcta pero sin acceso a otras redes | Gateway del pool DHCP, inter-VLAN routing, ACLs, NAT en el router |
| SSID en VLAN equivocada | Puerto del AP autónomo (access vs trunk) o mapeo WLAN→interfaz en el WLC |
| Lentitud / desconexiones | Canal congestionado o solapado (usar 1/6/11), co-channel interference, potencia, cliente lejano usando tasas bajas |
| LAP no se une al WLC | Energía/PoE, IP del LAP, alcance L3 al WLC, option 43, versión/compatibilidad [PT?] |

Orden práctico: capa física/radio (alcance, banda, canal) → asociación (SSID, seguridad) → IP (DHCP, VLAN) → conectividad L3 (gateway, ruteo). Para metodología general ver `references/troubleshooting.md`; detalles de PT en `references/packet-tracer.md`.
