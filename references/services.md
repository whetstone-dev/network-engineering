# Servicios de red (DHCP, DNS, NAT, gestión)

## Contenido
- [1. DHCP](#1-dhcp)
- [2. DNS](#2-dns)
- [3. NAT / PAT](#3-nat--pat)
- [4. NTP](#4-ntp)
- [5. Syslog](#5-syslog)
- [6. SNMP](#6-snmp)
- [7. SSH, HTTP/HTTPS](#7-ssh-httphttps)
- [8. FTP / TFTP (backups)](#8-ftp--tftp-backups)
- [9. CDP / LLDP](#9-cdp--lldp)

Etiquetas: `[PT]` Packet Tracer, `[IOS]` IOS 15.x, `[XE]` IOS XE, `[HW]` equipo real, `[PT?]` no confirmado en PT (verificar versión).

---

## 1. DHCP

### Proceso DORA (UDP 67 servidor / 68 cliente)

| Paso | Mensaje | Origen → Destino | Tipo |
|---|---|---|---|
| D | Discover | 0.0.0.0 → 255.255.255.255 | Broadcast |
| O | Offer | Servidor → cliente | Unicast o broadcast (según flag del cliente) |
| R | Request | 0.0.0.0 → 255.255.255.255 | Broadcast (informa a todos los servidores cuál oferta acepta) |
| A | Ack | Servidor → cliente | Unicast o broadcast |

Renovación: el cliente intenta renovar al 50 % del lease (T1) con unicast, y al 87,5 % (T2) con broadcast.

### Servidor DHCP en router IOS

```
R1(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.10    [PT][IOS][XE]
R1(config)# ip dhcp pool LAN10                                     [PT][IOS][XE]
R1(dhcp-config)# network 192.168.10.0 255.255.255.0
R1(dhcp-config)# default-router 192.168.10.1
R1(dhcp-config)# dns-server 192.168.10.5
R1(dhcp-config)# domain-name ejemplo.local                         [PT?]
R1(dhcp-config)# lease 7                                           [IOS][XE][PT?]  ! días [horas] [minutos]
```

- Excluir **antes** de que los clientes pidan: gateway, servidores, impresoras, IP de gestión.
- Un pool por subred. Si el router tiene varias subredes, el pool se asigna según la interfaz por donde llega el Discover (o el `giaddr` del relay).
- `lease` y `domain-name`: en varias versiones de PT no están disponibles; si el comando falla, omitirlo (el lab funciona igual).

### Relay: `ip helper-address`

Se configura en la **interfaz que es el gateway de los clientes** (la que recibe el broadcast), apuntando a la IP del servidor:

```
R1(config)# interface g0/0.20                  ! gateway de la VLAN 20
R1(config-subif)# ip helper-address 192.168.99.10                 [PT][IOS][XE]
```

- Convierte el broadcast en unicast y rellena `giaddr` con la IP de esa interfaz → el servidor elige el pool de esa subred.
- Reenvía también por defecto otros UDP: 37 (Time), 49 (TACACS), 53 (DNS), 67/68 (BOOTP/DHCP), 69 (TFTP), 137/138 (NetBIOS). Ajustable con `no ip forward-protocol udp <puerto>` `[IOS][XE]`.
- El servidor necesita **ruta de vuelta** hacia la subred del `giaddr`.

### DHCP en Server-PT `[PT]`

1. Dar al servidor IP estática, máscara y gateway.
2. *Services > DHCP* → Service **On**.
3. Por cada subred: Pool Name, Default Gateway, DNS Server, Start IP Address, Subnet Mask, Maximum Number of Users → **Add**. (El `serverPool` existente se edita con **Save**.)
4. Si los clientes están en **otra subred**, configurar `ip helper-address <IP-servidor>` en el gateway de esa subred.

### Router como cliente DHCP

```
R1(config)# interface g0/1
R1(config-if)# ip address dhcp                                     [PT][IOS][XE]
R1(config-if)# no shutdown
```

Típico en el enlace WAN hacia el ISP. Verificar con `show ip interface brief` y `show dhcp lease` `[IOS][PT?]`.

### Verificación DHCP

| Comando | Muestra |
|---|---|
| `show ip dhcp binding` | IP asignadas ↔ MAC/client-id, expiración |
| `show ip dhcp pool` | Rango, direcciones usadas/libres por pool |
| `show ip dhcp conflict` | IP detectadas en uso (ping/gratuitous ARP); `clear ip dhcp conflict *` |
| `show ip dhcp server statistics` `[PT?]` | Contadores DORA |
| PC PT: *Desktop > Command Prompt* | `ipconfig /all`, `ipconfig /release`, `ipconfig /renew` |
| PC PT: *Desktop > IP Configuration* | Seleccionar **DHCP** |

Fallos típicos: falta helper-address, pool sin `default-router`, todas las IP excluidas, puerto del switch en VLAN equivocada, PC con 169.254.x.x (APIPA = no hubo respuesta).

---

## 2. DNS

**Server-PT** `[PT]`: *Services > DNS* → **On** → Name + Type + Address → **Add**.

| Registro | Uso | Ejemplo |
|---|---|---|
| A | Nombre → IPv4 | `www.ejemplo.local` → 192.168.99.20 |
| CNAME | Alias → otro nombre | `intranet.ejemplo.local` → `www.ejemplo.local` |

(PT también ofrece NS/SOA según versión.) Los PCs deben recibir la IP del DNS (estática o vía DHCP `dns-server`).

**Router IOS:**

```
R1(config)# ip domain-lookup            [PT][IOS]   ! activo por defecto; en XE: ip domain lookup
R1(config)# ip name-server 192.168.99.5 [PT][IOS][XE]
R1(config)# no ip domain-lookup         [PT][IOS]   ! en labs: evita esperas al teclear mal un comando
R1(config)# ip host SRV1 192.168.99.10  [PT][IOS][XE]  ! tabla de hosts local
```

---

## 3. NAT / PAT

### Terminología

| Término | Qué es | Ejemplo |
|---|---|---|
| Inside local | IP real del host interno (privada) | 192.168.10.25 |
| Inside global | IP pública que representa al host interno | 203.0.113.10 |
| Outside local | IP del host externo vista desde dentro (normalmente = outside global) | 198.51.100.80 |
| Outside global | IP real del host externo | 198.51.100.80 |

Regla mnemotécnica: *inside/outside* = dónde está el host; *local/global* = desde qué lado se mira la dirección.

### Marcar interfaces (obligatorio en todos los tipos)

```
R1(config)# interface g0/0/0
R1(config-if)# ip nat inside                                   [PT][IOS][XE]
R1(config)# interface g0/0/1
R1(config-if)# ip nat outside
```

### Estática (servidor publicado)

```
R1(config)# ip nat inside source static 192.168.99.20 203.0.113.10                   [PT][IOS][XE]
R1(config)# ip nat inside source static tcp 192.168.99.20 80 203.0.113.10 80         [PT][IOS][XE]
```

### Dinámica con pool

```
R1(config)# access-list 1 permit 192.168.10.0 0.0.0.255
R1(config)# ip nat pool PUB 203.0.113.10 203.0.113.14 netmask 255.255.255.248        [PT][IOS][XE]
R1(config)# ip nat inside source list 1 pool PUB              ! 1:1 mientras haya IP libres
R1(config)# ip nat inside source list 1 pool PUB overload     ! PAT sobre el pool
```

### PAT con la IP de la interfaz (lo más común)

```
R1(config)# access-list 1 permit 192.168.0.0 0.0.255.255
R1(config)# ip nat inside source list 1 interface g0/0/1 overload                     [PT][IOS][XE]
R1(config)# ip route 0.0.0.0 0.0.0.0 203.0.113.1
```

- La ACL (estándar normalmente) **selecciona** qué tráfico se traduce; no filtra tráfico.
- Producción: no usar `permit any` en la ACL de NAT.

### Verificación

```
show ip nat translations          ! Pro, Inside global, Inside local, Outside local, Outside global
show ip nat statistics            ! hits/misses, interfaces inside/outside, pool
clear ip nat translation *        ! borra traducciones dinámicas (no las estáticas)
debug ip nat                      ! solo en lab
```

Las traducciones dinámicas aparecen **solo cuando hay tráfico**: generar un ping desde un host interno antes de verificar.

### Errores típicos

| Síntoma | Causa |
|---|---|
| `show ip nat translations` vacío | ACL no coincide con la subred real (wildcard mal), o no se ha generado tráfico |
| Misses en `statistics`, sin traducción | `ip nat inside` / `ip nat outside` invertidos o falta uno |
| Traduce pero no hay respuesta | Falta ruta default hacia el ISP, o el ISP no tiene ruta a la IP global |
| Pool agotado | NAT dinámica sin `overload` con más hosts que IP |
| VPN deja de funcionar al activar PAT | Tráfico VPN traducido: excluirlo de la ACL de NAT (ver `references/security.md`) |

---

## 4. NTP

```
R1(config)# ntp server 192.168.99.5          [PT][IOS][XE]
R1(config)# ntp master 3                     [IOS][PT?]   ! el router actúa como fuente (stratum 3)
R1(config)# clock timezone COT -5            [PT?][IOS]
R1# show ntp status                          ! "Clock is synchronized", stratum
R1# show ntp associations                    ! * = peer sincronizado
```

- Server-PT tiene servicio NTP en *Services > NTP* `[PT]`.
- La sincronización puede tardar minutos. Sin hora correcta, los logs y certificados no sirven.
- Producción: autenticación NTP (`ntp authenticate`, `ntp authentication-key`, `ntp trusted-key`) y varias fuentes.

---

## 5. Syslog

```
R1(config)# service timestamps log datetime msec       [PT][IOS][XE]
R1(config)# logging host 192.168.99.5                  [PT][IOS][XE]  ! sintaxis antigua: logging 192.168.99.5
R1(config)# logging trap warnings                      [PT][IOS][XE]  ! envía nivel 4 y más graves (0–4)
R1# show logging
```

| Nivel | Nombre | Nivel | Nombre |
|---|---|---|---|
| 0 | emergencies | 4 | warnings |
| 1 | alerts | 5 | notifications |
| 2 | critical | 6 | informational |
| 3 | errors | 7 | debugging |

Server-PT: *Services > SYSLOG* muestra los mensajes recibidos `[PT]`. Sin NTP, los timestamps serán incorrectos.

---

## 6. SNMP

```
! SNMPv2c — solo laboratorio (comunidad en texto plano)
R1(config)# snmp-server community <COMUNIDAD-RO> RO          [PT][IOS][XE]
! Evitar RW salvo necesidad real; restringir con ACL:
R1(config)# snmp-server community <COMUNIDAD-RO> RO 10

! SNMPv3 — producción (authPriv)
R1(config)# snmp-server group GRP-NMS v3 priv                                      [IOS][XE][PT?]
R1(config)# snmp-server user nms GRP-NMS v3 auth sha <SECRETO> priv aes 128 <SECRETO> [IOS][XE][PT?]
```

- PC-PT: *Desktop > MIB Browser* para probar SNMP en el lab `[PT]`.
- **Producción: usar SNMPv3 con auth+priv**; v1/v2c envían la comunidad sin cifrar.

---

## 7. SSH, HTTP/HTTPS

- **SSH**: configuración completa y hardening en `references/security.md`.
- **Server-PT**: *Services > HTTP* (HTTP y HTTPS on/off, editar `index.html`). Probar desde PC: *Desktop > Web Browser*.
- **IOS**:

```
R1(config)# ip http server            [IOS][PT?]   ! interfaz web/REST en algunos equipos
R1(config)# no ip http server         ! producción: deshabilitar si no se usa
R1(config)# ip http secure-server     [IOS][XE]    ! si se necesita, solo HTTPS + ACL
```

---

## 8. FTP / TFTP (backups)

```
R1# copy running-config tftp:          [PT][IOS][XE]
Address or name of remote host []? 192.168.99.5
Destination filename [R1-confg]?
R1# copy tftp: running-config          ! restaurar (hace merge, no reemplazo)
R1# copy startup-config tftp:

! FTP (requiere credenciales)
R1(config)# ip ftp username <USUARIO>  [IOS][PT?]
R1(config)# ip ftp password <SECRETO>  [IOS][PT?]
R1# copy running-config ftp:
```

- Server-PT ofrece *Services > TFTP* y *Services > FTP* (usuarios/permisos configurables en la pestaña FTP) `[PT]`.
- TFTP no tiene autenticación ni cifrado: solo en red de gestión. Producción: SCP/SFTP (`ip scp server enable` `[IOS][XE]`).
- `copy tftp: running-config` **fusiona** líneas; para reemplazo completo usar `configure replace` `[IOS][XE][HW]`.

---

## 9. CDP / LLDP

| | CDP | LLDP (IEEE 802.1AB) |
|---|---|---|
| Fabricante | Cisco propietario | Estándar, multivendor |
| Por defecto en IOS | Activo | Inactivo |
| Timers | 60 s / holdtime 180 s | 30 s / holdtime 120 s |
| Global | `cdp run` / `no cdp run` | `lldp run` / `no lldp run` |
| Por interfaz | `no cdp enable` | `no lldp transmit` / `no lldp receive` |
| Ver vecinos | `show cdp neighbors [detail]` | `show lldp neighbors [detail]` |
| Soporte | `[PT][IOS][XE]` | `[IOS][XE][PT?]` |

- `show cdp neighbors detail` revela IP de gestión, modelo e IOS del vecino: excelente para documentar topologías.
- Seguridad: deshabilitar CDP/LLDP en interfaces hacia ISP, Internet o usuarios no confiables (fuga de información).
