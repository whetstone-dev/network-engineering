# Seguridad de red

## Contenido
- [1. Principios](#1-principios)
- [2. Hardening de dispositivo](#2-hardening-de-dispositivo)
- [3. ACLs](#3-acls)
- [4. Ejemplos resueltos de ACL](#4-ejemplos-resueltos-de-acl)
- [5. Seguridad de capa 2](#5-seguridad-de-capa-2)
- [6. Firewalls](#6-firewalls)
- [7. VPN](#7-vpn)
- [8. Académico vs producción](#8-académico-vs-producción)

Etiquetas: `[PT]` Packet Tracer, `[IOS]` IOS 15.x, `[XE]` IOS XE, `[HW]` equipo real, `[PT?]` no confirmado en PT (verificar versión). Los valores `<SECRETO>` son marcadores: nunca reutilizar contraseñas de ejemplo.

## 1. Principios

| Principio | Qué significa en la red |
|---|---|
| Defensa en profundidad | Varias capas: hardening + ACL + L2 security + firewall + monitoreo. Ninguna capa es suficiente sola |
| Mínimo privilegio | Permitir solo el tráfico/acceso necesario; usuarios con el nivel justo |
| Segmentación | VLANs/subredes por función (usuarios, servidores, gestión, invitados) con control entre ellas |
| Zero Trust | No confiar por estar "dentro": verificar identidad y postura siempre; microsegmentación (políticas por workload/aplicación, no por subred) |

**Cuándo aplicar qué**: en un lab CCNA, segmentación por VLAN + ACLs + SSH es suficiente. Zero Trust completo (NAC 802.1X, ISE, microsegmentación, MFA) es para producción con requisitos reales; en un lab pequeño suele ser sobreingeniería salvo que el objetivo del ejercicio sea precisamente ese.

## 2. Hardening de dispositivo

```
R1(config)# enable secret <SECRETO>                     [PT][IOS][XE]  ! hash (tipo 5 en IOS clásico)
R1(config)# service password-encryption                 [PT][IOS][XE]  ! tipo 7: SOLO ofusca, reversible
R1(config)# security passwords min-length 10            [PT][IOS][XE]
R1(config)# login block-for 120 attempts 3 within 60    [IOS][XE][PT?]
R1(config)# banner motd # Acceso solo para personal autorizado #   [PT][IOS][XE]
R1(config)# username admin privilege 15 secret <SECRETO>   [PT][IOS][XE]
R1(config)# no ip http server                           [IOS][XE]
R1(config)# line console 0
R1(config-line)# login local
R1(config-line)# exec-timeout 5 0                       ! minutos segundos; 0 0 = nunca (no en producción)
R1(config-line)# logging synchronous
```

- `enable secret` vs `enable password`: `secret` se almacena con hash; `password` en texto plano (o tipo 7). Si existen ambos, se usa `secret`.
- Tipo 7 se descifra trivialmente: no es protección real. Usar siempre `secret`.
- Algoritmos más fuertes (tipo 8 PBKDF2 / tipo 9 scrypt): `enable algorithm-type scrypt secret <SECRETO>` `[IOS 15.3+][XE][PT?]` — verificar en la versión.

### SSH completo

```
R1(config)# hostname R1                                             ! no puede ser "Router"
R1(config)# ip domain-name ejemplo.local                            [PT][IOS][XE]
R1(config)# crypto key generate rsa general-keys modulus 2048       [PT][IOS][XE]
R1(config)# ip ssh version 2                                        [PT][IOS][XE]
R1(config)# ip ssh time-out 60  ! y: ip ssh authentication-retries 3
R1(config)# username admin privilege 15 secret <SECRETO>
R1(config)# line vty 0 4                                            ! switches/routers con 16 líneas: 0 15
R1(config-line)# transport input ssh
R1(config-line)# login local
R1(config-line)# exec-timeout 5 0
```

- Las claves RSA requieren `hostname` y `ip domain-name` previos. SSHv2 exige módulo ≥ 768 bits; en labs usar mínimo 1024, en producción 2048 o más.
- Configurar **todas** las VTY (`0 15` si existen); una línea sin `transport input ssh` deja Telnet abierto.
- Switch L2: necesita SVI de gestión con IP y `ip default-gateway` (ver `references/switching.md`).
- Probar: PC PT *Command Prompt* → `ssh -l admin 192.168.99.1`. Verificar: `show ip ssh`, `show ssh`.

**Servicios a deshabilitar (producción)**: `no ip http server`, `no ip http secure-server` (si no se usa), `no service pad` `[IOS]`, `no ip source-route` `[IOS]`, `no cdp enable` en interfaces externas, `no ip proxy-arp` en interfaces externas, puertos sin uso en `shutdown`. Revisar con `show control-plane host open-ports` `[IOS][XE][HW]`.

## 3. ACLs

### Tipos y numeración

| | Estándar | Extendida |
|---|---|---|
| Filtra por | Solo IP origen | Protocolo, origen, destino, puertos, flags |
| Numeradas | 1–99, 1300–1999 | 100–199, 2000–2699 |
| Nombradas | `ip access-list standard NOMBRE` | `ip access-list extended NOMBRE` |
| Ubicación | **Cerca del destino** (filtra solo por origen, si se pone cerca del origen bloquea de más) | **Cerca del origen** (evita que el tráfico cruce la red) |

### Wildcard masks

`wildcard = 255.255.255.255 − máscara`. Bit 0 = debe coincidir, bit 1 = no importa.

| Coincidir | Wildcard | Atajo |
|---|---|---|
| Un host 192.168.1.10 | 0.0.0.0 | `host 192.168.1.10` |
| /24 192.168.1.0 | 0.0.0.255 | |
| /26 192.168.1.64 | 0.0.0.63 | |
| /30 10.0.12.0 | 0.0.0.3 | |
| Todo | 255.255.255.255 | `any` |

### Reglas de funcionamiento

- Se evalúan **de arriba abajo**; la primera coincidencia decide. Poner lo más específico primero.
- **Deny implícito** al final (`deny any` / `deny ip any any`). Una ACL solo con `deny` bloquea todo.
- **Una ACL por interfaz, por dirección (in/out), por protocolo (IPv4/IPv6)**.
- El tráfico generado por el propio router no se filtra con ACL `out`.
- Aplicar: `ip access-group <ACL> in|out` en interfaz; `access-class <ACL> in` en `line vty`.

### ACL nombradas y números de secuencia

```
R1(config)# ip access-list extended WEB-SOLO                       [PT][IOS][XE]
R1(config-ext-nacl)# 10 permit tcp any host 192.168.99.20 eq 80
R1(config-ext-nacl)# 20 permit tcp any host 192.168.99.20 eq 443
R1(config-ext-nacl)# 15 permit tcp 192.168.99.0 0.0.0.255 host 192.168.99.20 eq 22   ! inserta entre 10 y 20
R1(config-ext-nacl)# no 20                                          ! borra solo esa línea
R1(config)# ip access-list resequence WEB-SOLO 10 10                [IOS][XE][PT?]
```

En ACL numeradas, `no access-list 101` borra **toda** la ACL. Editar numeradas como nombradas: `ip access-list extended 101` `[IOS][XE][PT?]`.

### `established`

`permit tcp any 192.168.10.0 0.0.0.255 established` coincide con segmentos TCP con ACK o RST activos: deja pasar respuestas a sesiones iniciadas desde dentro. No es stateful (no aplica a UDP/ICMP); para eso, firewall (sección 6).

### Verificación

`show access-lists` (contadores "(n matches)"), `show ip access-lists WEB-SOLO`, `show ip interface g0/0` (ACL aplicada in/out), `clear access-list counters`.

## 4. Ejemplos resueltos de ACL

### 4.1 Bloquear la VLAN 20 hacia un servidor (resto permitido)

VLAN 20 = 192.168.20.0/24, gateway subinterfaz g0/0.20; servidor 192.168.99.10. Extendida, cerca del origen:

```
R1(config)# ip access-list extended V20-NO-SRV
R1(config-ext-nacl)# deny ip 192.168.20.0 0.0.0.255 host 192.168.99.10
R1(config-ext-nacl)# permit ip any any
R1(config)# interface g0/0.20
R1(config-subif)# ip access-group V20-NO-SRV in
```

### 4.2 Permitir solo HTTP/HTTPS hacia un servidor publicado

Servidor DMZ con NAT estática 192.168.99.20 ↔ 203.0.113.10. ACL de entrada en la interfaz outside del router IOS:

```
R1(config)# ip access-list extended OUTSIDE-IN
R1(config-ext-nacl)# permit tcp any host 203.0.113.10 eq 80
R1(config-ext-nacl)# permit tcp any host 203.0.113.10 eq 443
R1(config-ext-nacl)# permit tcp any any established        ! respuestas a sesiones internas
R1(config-ext-nacl)# deny ip any any log                   [IOS][XE]  ! explícito para ver contadores
R1(config)# interface g0/0/1
R1(config-if)# ip access-group OUTSIDE-IN in
```

En IOS, la ACL `in` de la interfaz outside se evalúa **antes** de la traducción NAT → usar la IP global (203.0.113.10). (En ASA 8.3+ es al revés: se usa la IP real; ver 6.2.) Ojo: esta ACL bloquea DNS/ICMP de retorno (UDP/ICMP no casan con `established`).

### 4.3 Restringir VTY a la VLAN de gestión

```
R1(config)# access-list 10 permit 192.168.99.0 0.0.0.255
R1(config)# line vty 0 15
R1(config-line)# access-class 10 in
```

Probar SSH desde una PC fuera de 192.168.99.0/24 → debe rechazarse; `show access-lists 10` muestra los matches.

### 4.4 Anti-spoofing básico en la WAN

```
R1(config)# ip access-list extended ANTI-SPOOF
R1(config-ext-nacl)# deny ip 10.0.0.0 0.255.255.255 any
R1(config-ext-nacl)# deny ip 172.16.0.0 0.15.255.255 any
R1(config-ext-nacl)# deny ip 192.168.0.0 0.0.255.255 any
R1(config-ext-nacl)# deny ip 127.0.0.0 0.255.255.255 any
R1(config-ext-nacl)# deny ip 0.0.0.0 0.255.255.255 any
R1(config-ext-nacl)# deny ip 224.0.0.0 31.255.255.255 any     ! multicast y clase E como origen
R1(config-ext-nacl)# deny ip 203.0.113.0 0.0.0.255 any        ! nuestro propio bloque público
R1(config-ext-nacl)# permit ip any any
R1(config)# interface g0/0/1
R1(config-if)# ip access-group ANTI-SPOOF in
```

Si el enlace WAN del lab usa direcciones RFC1918, ajustar las líneas para no cortar el propio enlace. Alternativa: `ip verify unicast source reachable-via rx` (uRPF) `[IOS][XE][HW]`.

## 5. Seguridad de capa 2

Detalle de configuración de switches en `references/switching.md`.

| Control | Comandos clave | Soporte |
|---|---|---|
| Port security | `switchport mode access`, `switchport port-security`, `switchport port-security maximum 2`, `switchport port-security mac-address sticky`, `switchport port-security violation shutdown\|restrict\|protect` | `[PT][IOS]` |
| Recuperar err-disabled | `shutdown` / `no shutdown`, o `errdisable recovery cause psecure-violation` | `[IOS][PT?]` |
| DHCP snooping | `ip dhcp snooping`, `ip dhcp snooping vlan 10,20`, en uplink al servidor: `ip dhcp snooping trust`; en puertos de acceso (untrusted): `ip dhcp snooping limit rate 10` | `[IOS][XE][PT?]` |
| Dynamic ARP Inspection | `ip arp inspection vlan 10`, `ip arp inspection trust` en uplinks (depende de la tabla de DHCP snooping) | `[IOS][XE][HW][PT?]` |
| BPDU guard | `spanning-tree bpduguard enable` en puertos de acceso, o `spanning-tree portfast bpduguard default` global | `[PT][IOS][XE]` |
| VLAN nativa no usada | `switchport trunk native vlan 999` (igual en ambos extremos) | `[PT][IOS][XE]` |
| Deshabilitar DTP | `switchport mode trunk` + `switchport nonegotiate`; accesos: `switchport mode access` | `[PT][IOS][XE]` |
| Puertos no usados | `switchport access vlan 666` (blackhole, distinta de la nativa) + `shutdown` | `[PT][IOS][XE]` |

- `show port-security interface f0/1`, `show port-security address`, `show ip dhcp snooping binding`, `show interfaces status err-disabled` `[IOS][PT?]`.
- Con DHCP snooping, si el servidor no es relay puede ser necesario `no ip dhcp snooping information option` (opción 82) — verificar en la plataforma.

## 6. Firewalls

> El toolkit genera la configuración ASA desde el modelo (`netlab config`): interfaces con nameif/security-level, rutas, NAT por objetos, ACL con máscaras, `access-group`, DHCP, SSH e `inspect icmp`. La simulación (`trace`) aplica niveles de seguridad, ACL de entrada y estado de conexión. Ver `references/model.md` § Redundancia, IPv6, firewall y VPN y `examples/asa-dmz.net.json`.

### 6.1 Conceptos

| | Stateless (ACL) | Stateful (firewall) |
|---|---|---|
| Decide por | Cada paquete aislado | Tabla de conexiones; permite el retorno automáticamente |
| Ejemplo | ACL extendida IOS | ASA, ZBF, firewalls NGFW |

- **Zonas**: inside (confiable), outside (Internet), DMZ (servidores publicados). Política típica: inside→outside permitido; outside→DMZ solo servicios publicados; outside→inside bloqueado; DMZ→inside bloqueado o muy restringido.
- **DMZ con 3 interfaces** (un firewall, 3 zonas): simple y barato. **Dos firewalls** (externo DMZ, interno LAN; idealmente de distinto fabricante): más defensa en profundidad, más coste y gestión.

### 6.2 ASA en Packet Tracer `[PT]`

- **ASA 5506-X**: interfaces enrutadas; `nameif`/`security-level`/IP directamente en la interfaz física.
- **ASA 5505**: los puertos e0/0–e0/7 son de switch; la configuración L3 va en `interface vlan N` y los puertos se asignan con `switchport access vlan N`. Por defecto VLAN 1 = inside, VLAN 2 = outside; la licencia base limita la tercera VLAN (`no forward interface vlan X`).
- Por defecto: tráfico de mayor a menor `security-level` permitido (con retorno stateful); de menor a mayor, denegado salvo ACL. ICMP de retorno no se inspecciona por defecto.

```
! ASA 5506-X
interface g1/1
 nameif outside
 security-level 0
 ip address 203.0.113.2 255.255.255.248
interface g1/2
 nameif inside
 security-level 100
 ip address 192.168.1.1 255.255.255.0
interface g1/3
 nameif dmz
 security-level 50
 ip address 192.168.2.1 255.255.255.0
route outside 0.0.0.0 0.0.0.0 203.0.113.1
! PAT de la LAN (object NAT, ASA 8.3+)
object network LAN-INSIDE
 subnet 192.168.1.0 255.255.255.0
 nat (inside,outside) dynamic interface
! Servidor DMZ publicado
object network SRV-WEB
 host 192.168.2.10
 nat (dmz,outside) static 203.0.113.3
! ACL: en ASA 8.3+ se usa la IP REAL (no la traducida)
access-list OUTSIDE-IN extended permit tcp any host 192.168.2.10 eq www
access-group OUTSIDE-IN in interface outside
```

Retorno de ping: `policy-map global_policy` → `class inspection_default` → `inspect icmp`.

Verificar: `show nameif`, `show xlate`, `show nat`, `show access-list`, `show conn`. En ASA 5505 cambiar `interface g1/x` por `interface vlan N` + asignación de puertos.

### 6.3 Zone-Based Firewall en IOS `[IOS][XE][PT?]`

Requiere licencia `securityk9` en ISR G2 (ver 7.1).

```
zone security INSIDE
zone security OUTSIDE
class-map type inspect match-any CM-IN-OUT
 match protocol tcp
 match protocol udp
 match protocol icmp
policy-map type inspect PM-IN-OUT
 class type inspect CM-IN-OUT
  inspect
 class class-default
  drop
zone-pair security ZP-IN-OUT source INSIDE destination OUTSIDE
 service-policy type inspect PM-IN-OUT
interface g0/0
 zone-member security INSIDE
interface g0/1
 zone-member security OUTSIDE
```

- Entre zonas sin zone-pair: **todo denegado**. Interfaz en zona ↔ interfaz sin zona: denegado. Tráfico hacia/desde el router = zona `self` (permitido por defecto).
- Verificar: `show zone security`, `show zone-pair security`, `show policy-map type inspect zone-pair sessions`.

## 7. VPN

> El toolkit genera el crypto map IOS completo (política ISAKMP, clave, transform-set, ACL de tráfico interesante, crypto map aplicado) y la **exención de NAT** cuando el router también hace PAT; valida que ambos extremos sean espejo (redes, PSK, IKE, transform) y la traza muestra el tráfico cifrado entre peers. Ver `examples/vpn-ipsec-ospfv3.net.json`.

### 7.1 Site-to-site IPsec (crypto map clásico)

- **IKE fase 1** (ISAKMP SA): autentica peers y crea canal seguro de gestión (cifrado, hash, autenticación, grupo DH, lifetime). **Fase 2** (IPsec SAs): protege el tráfico de datos (transform-set) definido por la ACL de "tráfico interesante".
- **[PT] en ISR 2911** hay que activar la licencia primero:

`license boot module c2900 technology-package securityk9` `[PT][IOS]` → aceptar EULA → `copy running-config startup-config` → `reload` → comprobar en `show version`.

Configuración en R1 (LAN 192.168.1.0/24, peer R2 203.0.113.6, LAN remota 192.168.2.0/24); R2 en espejo:

```
R1(config)# crypto isakmp policy 10
R1(config-isakmp)# encryption aes 256
R1(config-isakmp)# hash sha
R1(config-isakmp)# authentication pre-share
R1(config-isakmp)# group 5                       ! lab; producción: grupo 14+ / IKEv2
R1(config-isakmp)# lifetime 86400
R1(config)# crypto isakmp key <PSK> address 203.0.113.6
R1(config)# crypto ipsec transform-set TS-VPN esp-aes 256 esp-sha-hmac
R1(config)# access-list 110 permit ip 192.168.1.0 0.0.0.255 192.168.2.0 0.0.0.255
R1(config)# crypto map CMAP-VPN 10 ipsec-isakmp
R1(config-crypto-map)# set peer 203.0.113.6
R1(config-crypto-map)# set transform-set TS-VPN
R1(config-crypto-map)# match address 110
R1(config)# interface g0/1
R1(config-if)# crypto map CMAP-VPN
```

- La ACL de tráfico interesante debe ser **espejo** en ambos peers. Los parámetros de fase 1 y el transform-set deben coincidir.
- El túnel se levanta con tráfico interesante: hacer ping **de LAN a LAN** (no desde el router).
- Con PAT en el mismo router: excluir el tráfico VPN de la ACL de NAT (`deny ip 192.168.1.0 0.0.0.255 192.168.2.0 0.0.0.255` antes del `permit`).

Verificación: `show crypto isakmp sa` (QM_IDLE = fase 1 OK), `show crypto ipsec sa` (#pkts encaps/decaps deben subir en ambos lados), `show crypto map`.

### 7.2 GRE `[PT][IOS][XE]`

```
R1(config)# interface tunnel 0
R1(config-if)# ip address 172.16.0.1 255.255.255.252
R1(config-if)# tunnel source g0/1
R1(config-if)# tunnel destination 203.0.113.6
! modo por defecto: tunnel mode gre ip
R1(config)# ip route 192.168.2.0 255.255.255.0 172.16.0.2     ! o un IGP sobre el túnel
```

GRE transporta multicast (permite OSPF/EIGRP sobre el túnel) pero **no cifra**. Producción: GRE sobre IPsec o VTI (`tunnel mode ipsec ipv4` `[IOS][XE][HW]`). Verificar: `show interface tunnel 0`, `show ip interface brief`.

### 7.3 Remote access VPN `[HW]`

AnyConnect/Secure Client en ASA o FTD, o IKEv2/SSL en routers: requiere licencias, certificados y AAA. Fuera del alcance práctico de PT.

## 8. Académico vs producción

| En el lab (académico) | En producción |
|---|---|
| Contraseñas `cisco` / `class` | Contraseñas largas y únicas, gestor de secretos; AAA con TACACS+/RADIUS |
| `enable password`, tipo 7 | `enable secret` (tipo 8/9 si la versión lo soporta) |
| Telnet en VTY | `transport input ssh` + `access-class` a la VLAN de gestión |
| RSA 1024 bits | RSA 2048+ (o ECDSA según plataforma) |
| SNMPv2c con comunidad `public` | SNMPv3 authPriv + ACL |
| `exec-timeout 0 0` | `exec-timeout 5 0` o menor |
| `permit ip any any` en ACL | Mínimo privilegio + log de denegaciones |
| PSK simple, IKEv1 grupo 2/5, SHA-1 | IKEv2, certificados o PSK fuerte, DH 14+/19+, SHA-256+ |
| VLAN 1 para todo, nativa por defecto | VLAN de gestión dedicada, nativa sin uso, DTP off |
| TFTP para backups | SCP/SFTP, backups versionados y cifrados |
| Sin NTP ni syslog | NTP autenticado, syslog centralizado, alertas |
| `debug` libre | `debug` solo con filtros y en ventana de mantenimiento |
