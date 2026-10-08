# Network security

## Contents
- [1. Principles](#1-principles)
- [2. Device hardening](#2-device-hardening)
- [3. ACLs](#3-acls)
- [4. Worked ACL examples](#4-worked-acl-examples)
- [5. Layer 2 security](#5-layer-2-security)
- [6. Firewalls](#6-firewalls)
- [7. VPN](#7-vpn)
- [8. Lab vs production](#8-lab-vs-production)

Tags: `[PT]` Packet Tracer, `[IOS]` IOS 15.x, `[XE]` IOS XE, `[HW]` real hardware, `[PT?]` not confirmed in PT (verify version). `<SECRET>` values are placeholders: never reuse example passwords.

## 1. Principles

| Principle | What it means in the network |
|---|---|
| Defense in depth | Several layers: hardening + ACL + L2 security + firewall + monitoring. No single layer is enough on its own |
| Least privilege | Allow only the necessary traffic/access; users with just the level they need |
| Segmentation | VLANs/subnets per function (users, servers, management, guests) with control between them |
| Zero Trust | Do not trust for being "inside": always verify identity and posture; microsegmentation (policies per workload/application, not per subnet) |

**When to apply what**: in a CCNA lab, VLAN segmentation + ACLs + SSH is enough. Full Zero Trust (802.1X NAC, ISE, microsegmentation, MFA) is for production with real requirements; in a small lab it is usually over-engineering unless that is precisely the goal of the exercise.

## 2. Device hardening

```
R1(config)# enable secret <SECRET>                      [PT][IOS][XE]  ! hash (type 5 on classic IOS)
R1(config)# service password-encryption                 [PT][IOS][XE]  ! type 7: ONLY obfuscates, reversible
R1(config)# security passwords min-length 10            [PT][IOS][XE]
R1(config)# login block-for 120 attempts 3 within 60    [IOS][XE][PT?]
R1(config)# banner motd # Authorized personnel only #   [PT][IOS][XE]
R1(config)# username admin privilege 15 secret <SECRET>    [PT][IOS][XE]
R1(config)# no ip http server                           [IOS][XE]
R1(config)# line console 0
R1(config-line)# login local
R1(config-line)# exec-timeout 5 0                       ! minutes seconds; 0 0 = never (not in production)
R1(config-line)# logging synchronous
```

- `enable secret` vs `enable password`: `secret` is stored hashed; `password` in plain text (or type 7). If both exist, `secret` is used.
- Type 7 is trivially decrypted: it is not real protection. Always use `secret`.
- Stronger algorithms (type 8 PBKDF2 / type 9 scrypt): `enable algorithm-type scrypt secret <SECRET>` `[IOS 15.3+][XE][PT?]` — verify on your version.

### Full SSH

```
R1(config)# hostname R1                                             ! cannot be "Router"
R1(config)# ip domain-name example.local                            [PT][IOS][XE]
R1(config)# crypto key generate rsa general-keys modulus 2048       [PT][IOS][XE]
R1(config)# ip ssh version 2                                        [PT][IOS][XE]
R1(config)# ip ssh time-out 60  ! and: ip ssh authentication-retries 3
R1(config)# username admin privilege 15 secret <SECRET>
R1(config)# line vty 0 4                                            ! switches/routers with 16 lines: 0 15
R1(config-line)# transport input ssh
R1(config-line)# login local
R1(config-line)# exec-timeout 5 0
```

- RSA keys require `hostname` and `ip domain-name` first. SSHv2 requires a modulus ≥ 768 bits; in labs use at least 1024, in production 2048 or more.
- Configure **all** VTY lines (`0 15` if they exist); a line without `transport input ssh` leaves Telnet open.
- L2 switch: needs a management SVI with an IP and `ip default-gateway` (see `references/switching.md`).
- Test: PT PC *Command Prompt* → `ssh -l admin 192.168.99.1`. Verify: `show ip ssh`, `show ssh`.

**Services to disable (production)**: `no ip http server`, `no ip http secure-server` (if not used), `no service pad` `[IOS]`, `no ip source-route` `[IOS]`, `no cdp enable` on external interfaces, `no ip proxy-arp` on external interfaces, unused ports in `shutdown`. Review with `show control-plane host open-ports` `[IOS][XE][HW]`.

## 3. ACLs

### Types and numbering

| | Standard | Extended |
|---|---|---|
| Filters by | Source IP only | Protocol, source, destination, ports, flags |
| Numbered | 1–99, 1300–1999 | 100–199, 2000–2699 |
| Named | `ip access-list standard NAME` | `ip access-list extended NAME` |
| Placement | **Close to the destination** (it filters only by source; placed close to the source it blocks too much) | **Close to the source** (prevents the traffic from crossing the network) |

### Wildcard masks

`wildcard = 255.255.255.255 − mask`. Bit 0 = must match, bit 1 = don't care.

| Match | Wildcard | Shortcut |
|---|---|---|
| A host 192.168.1.10 | 0.0.0.0 | `host 192.168.1.10` |
| /24 192.168.1.0 | 0.0.0.255 | |
| /26 192.168.1.64 | 0.0.0.63 | |
| /30 10.0.12.0 | 0.0.0.3 | |
| Everything | 255.255.255.255 | `any` |

### Operating rules

- Evaluated **top to bottom**; the first match decides. Put the most specific entries first.
- **Implicit deny** at the end (`deny any` / `deny ip any any`). An ACL with only `deny` entries blocks everything.
- **One ACL per interface, per direction (in/out), per protocol (IPv4/IPv6)**.
- Traffic generated by the router itself is not filtered by an `out` ACL.
- Apply: `ip access-group <ACL> in|out` on an interface; `access-class <ACL> in` on `line vty`.

### Named ACLs and sequence numbers

```
R1(config)# ip access-list extended WEB-ONLY                       [PT][IOS][XE]
R1(config-ext-nacl)# 10 permit tcp any host 192.168.99.20 eq 80
R1(config-ext-nacl)# 20 permit tcp any host 192.168.99.20 eq 443
R1(config-ext-nacl)# 15 permit tcp 192.168.99.0 0.0.0.255 host 192.168.99.20 eq 22   ! inserts between 10 and 20
R1(config-ext-nacl)# no 20                                          ! deletes only that line
R1(config)# ip access-list resequence WEB-ONLY 10 10                [IOS][XE][PT?]
```

In numbered ACLs, `no access-list 101` deletes the **whole** ACL. Edit numbered ACLs as named ones: `ip access-list extended 101` `[IOS][XE][PT?]`.

### `established`

`permit tcp any 192.168.10.0 0.0.0.255 established` matches TCP segments with ACK or RST set: it lets through replies to sessions initiated from inside. It is not stateful (does not apply to UDP/ICMP); for that, use a firewall (section 6).

### Verification

`show access-lists` (counters "(n matches)"), `show ip access-lists WEB-ONLY`, `show ip interface g0/0` (ACL applied in/out), `clear access-list counters`.

## 4. Worked ACL examples

### 4.1 Block VLAN 20 from reaching a server (everything else allowed)

VLAN 20 = 192.168.20.0/24, gateway subinterface g0/0.20; server 192.168.99.10. Extended, close to the source:

```
R1(config)# ip access-list extended V20-NO-SRV
R1(config-ext-nacl)# deny ip 192.168.20.0 0.0.0.255 host 192.168.99.10
R1(config-ext-nacl)# permit ip any any
R1(config)# interface g0/0.20
R1(config-subif)# ip access-group V20-NO-SRV in
```

### 4.2 Allow only HTTP/HTTPS to a published server

DMZ server with static NAT 192.168.99.20 ↔ 203.0.113.10. Inbound ACL on the outside interface of the IOS router:

```
R1(config)# ip access-list extended OUTSIDE-IN
R1(config-ext-nacl)# permit tcp any host 203.0.113.10 eq 80
R1(config-ext-nacl)# permit tcp any host 203.0.113.10 eq 443
R1(config-ext-nacl)# permit tcp any any established        ! replies to internal sessions
R1(config-ext-nacl)# deny ip any any log                   [IOS][XE]  ! explicit to see counters
R1(config)# interface g0/0/1
R1(config-if)# ip access-group OUTSIDE-IN in
```

On IOS, the `in` ACL on the outside interface is evaluated **before** NAT translation → use the global IP (203.0.113.10). (On ASA 8.3+ it is the other way round: the real IP is used; see 6.2.) Caution: this ACL blocks return DNS/ICMP (UDP/ICMP do not match `established`).

### 4.3 Restrict VTY to the management VLAN

```
R1(config)# access-list 10 permit 192.168.99.0 0.0.0.255
R1(config)# line vty 0 15
R1(config-line)# access-class 10 in
```

Test SSH from a PC outside 192.168.99.0/24 → it must be rejected; `show access-lists 10` shows the matches.

### 4.4 Basic anti-spoofing on the WAN

```
R1(config)# ip access-list extended ANTI-SPOOF
R1(config-ext-nacl)# deny ip 10.0.0.0 0.255.255.255 any
R1(config-ext-nacl)# deny ip 172.16.0.0 0.15.255.255 any
R1(config-ext-nacl)# deny ip 192.168.0.0 0.0.255.255 any
R1(config-ext-nacl)# deny ip 127.0.0.0 0.255.255.255 any
R1(config-ext-nacl)# deny ip 0.0.0.0 0.255.255.255 any
R1(config-ext-nacl)# deny ip 224.0.0.0 31.255.255.255 any     ! multicast and class E as source
R1(config-ext-nacl)# deny ip 203.0.113.0 0.0.0.255 any        ! our own public block
R1(config-ext-nacl)# permit ip any any
R1(config)# interface g0/0/1
R1(config-if)# ip access-group ANTI-SPOOF in
```

If the lab WAN link uses RFC1918 addresses, adjust the lines so as not to cut the link itself. Alternative: `ip verify unicast source reachable-via rx` (uRPF) `[IOS][XE][HW]`.

## 5. Layer 2 security

Switch configuration details in `references/switching.md`.

| Control | Key commands | Support |
|---|---|---|
| Port security | `switchport mode access`, `switchport port-security`, `switchport port-security maximum 2`, `switchport port-security mac-address sticky`, `switchport port-security violation shutdown\|restrict\|protect` | `[PT][IOS]` |
| Recover err-disabled | `shutdown` / `no shutdown`, or `errdisable recovery cause psecure-violation` | `[IOS][PT?]` |
| DHCP snooping | `ip dhcp snooping`, `ip dhcp snooping vlan 10,20`, on the uplink to the server: `ip dhcp snooping trust`; on access ports (untrusted): `ip dhcp snooping limit rate 10` | `[IOS][XE][PT?]` |
| Dynamic ARP Inspection | `ip arp inspection vlan 10`, `ip arp inspection trust` on uplinks (depends on the DHCP snooping table) | `[IOS][XE][HW][PT?]` |
| BPDU guard | `spanning-tree bpduguard enable` on access ports, or `spanning-tree portfast bpduguard default` globally | `[PT][IOS][XE]` |
| Unused native VLAN | `switchport trunk native vlan 999` (same on both ends) | `[PT][IOS][XE]` |
| Disable DTP | `switchport mode trunk` + `switchport nonegotiate`; access ports: `switchport mode access` | `[PT][IOS][XE]` |
| Unused ports | `switchport access vlan 666` (blackhole, different from the native VLAN) + `shutdown` | `[PT][IOS][XE]` |

- `show port-security interface f0/1`, `show port-security address`, `show ip dhcp snooping binding`, `show interfaces status err-disabled` `[IOS][PT?]`.
- With DHCP snooping, if the server is not a relay, `no ip dhcp snooping information option` (option 82) may be needed — verify on the platform.

## 6. Firewalls

> The toolkit generates the ASA configuration from the model (`netlab config`): interfaces with nameif/security-level, routes, object NAT, ACLs with masks, `access-group`, DHCP, SSH and `inspect icmp`. The simulation (`trace`) applies security levels, inbound ACLs and connection state. See `references/model.md` § Redundancy, IPv6, firewall and VPN and `examples/asa-dmz.net.json`.

### 6.1 Concepts

| | Stateless (ACL) | Stateful (firewall) |
|---|---|---|
| Decides by | Each packet in isolation | Connection table; allows return traffic automatically |
| Example | IOS extended ACL | ASA, ZBF, NGFW firewalls |

- **Zones**: inside (trusted), outside (Internet), DMZ (published servers). Typical policy: inside→outside allowed; outside→DMZ only published services; outside→inside blocked; DMZ→inside blocked or heavily restricted.
- **3-interface DMZ** (one firewall, 3 zones): simple and cheap. **Two firewalls** (external DMZ, internal LAN; ideally from different vendors): more defense in depth, more cost and management.

### 6.2 ASA in Packet Tracer `[PT]`

- **ASA 5506-X**: routed interfaces; `nameif`/`security-level`/IP directly on the physical interface.
- **ASA 5505**: ports e0/0–e0/7 are switch ports; the L3 configuration goes on `interface vlan N` and ports are assigned with `switchport access vlan N`. By default VLAN 1 = inside, VLAN 2 = outside; the base license restricts the third VLAN (`no forward interface vlan X`).
- By default: traffic from a higher to a lower `security-level` is allowed (with stateful return); from lower to higher, denied unless an ACL permits it. Return ICMP is not inspected by default.

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
! LAN PAT (object NAT, ASA 8.3+)
object network LAN-INSIDE
 subnet 192.168.1.0 255.255.255.0
 nat (inside,outside) dynamic interface
! Published DMZ server
object network SRV-WEB
 host 192.168.2.10
 nat (dmz,outside) static 203.0.113.3
! ACL: on ASA 8.3+ the REAL IP is used (not the translated one)
access-list OUTSIDE-IN extended permit tcp any host 192.168.2.10 eq www
access-group OUTSIDE-IN in interface outside
```

Ping return: `policy-map global_policy` → `class inspection_default` → `inspect icmp`.

Verify: `show nameif`, `show xlate`, `show nat`, `show access-list`, `show conn`. On ASA 5505 replace `interface g1/x` with `interface vlan N` + port assignment.

### 6.3 Zone-Based Firewall on IOS `[IOS][XE][PT?]`

Requires the `securityk9` license on ISR G2 (see 7.1).

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

- Between zones without a zone-pair: **everything denied**. Interface in a zone ↔ interface without a zone: denied. Traffic to/from the router = `self` zone (allowed by default).
- Verify: `show zone security`, `show zone-pair security`, `show policy-map type inspect zone-pair sessions`.

## 7. VPN

> The toolkit generates the full IOS crypto map (ISAKMP policy, key, transform-set, interesting-traffic ACL, applied crypto map) and the **NAT exemption** when the router also does PAT; it validates that both ends mirror each other (networks, PSK, IKE, transform) and the trace shows the encrypted traffic between peers. See `examples/vpn-ipsec-ospfv3.net.json`.

### 7.1 Site-to-site IPsec (classic crypto map)

- **IKE phase 1** (ISAKMP SA): authenticates the peers and builds a secure management channel (encryption, hash, authentication, DH group, lifetime). **Phase 2** (IPsec SAs): protects the data traffic (transform-set) defined by the "interesting traffic" ACL.
- **[PT] on ISR 2911** the license must be activated first:

`license boot module c2900 technology-package securityk9` `[PT][IOS]` → accept the EULA → `copy running-config startup-config` → `reload` → check in `show version`.

Configuration on R1 (LAN 192.168.1.0/24, peer R2 203.0.113.6, remote LAN 192.168.2.0/24); R2 mirrored:

```
R1(config)# crypto isakmp policy 10
R1(config-isakmp)# encryption aes 256
R1(config-isakmp)# hash sha
R1(config-isakmp)# authentication pre-share
R1(config-isakmp)# group 5                       ! lab; production: group 14+ / IKEv2
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

- The interesting-traffic ACL must be a **mirror** on both peers. Phase 1 parameters and the transform-set must match.
- The tunnel comes up with interesting traffic: ping **from LAN to LAN** (not from the router).
- With PAT on the same router: exclude VPN traffic from the NAT ACL (`deny ip 192.168.1.0 0.0.0.255 192.168.2.0 0.0.0.255` before the `permit`).

Verification: `show crypto isakmp sa` (QM_IDLE = phase 1 OK), `show crypto ipsec sa` (#pkts encaps/decaps must increase on both sides), `show crypto map`.

### 7.2 GRE `[PT][IOS][XE]`

```
R1(config)# interface tunnel 0
R1(config-if)# ip address 172.16.0.1 255.255.255.252
R1(config-if)# tunnel source g0/1
R1(config-if)# tunnel destination 203.0.113.6
! default mode: tunnel mode gre ip
R1(config)# ip route 192.168.2.0 255.255.255.0 172.16.0.2     ! or an IGP over the tunnel
```

GRE carries multicast (allows OSPF/EIGRP over the tunnel) but **does not encrypt**. Production: GRE over IPsec or VTI (`tunnel mode ipsec ipv4` `[IOS][XE][HW]`). Verify: `show interface tunnel 0`, `show ip interface brief`.

### 7.3 Remote access VPN `[HW]`

AnyConnect/Secure Client on ASA or FTD, or IKEv2/SSL on routers: requires licenses, certificates and AAA. Beyond the practical scope of PT.

## 8. Lab vs production

| In the lab | In production |
|---|---|
| Passwords `cisco` / `class` | Long, unique passwords, secrets manager; AAA with TACACS+/RADIUS |
| `enable password`, type 7 | `enable secret` (type 8/9 if the version supports it) |
| Telnet on VTY | `transport input ssh` + `access-class` to the management VLAN |
| RSA 1024 bits | RSA 2048+ (or ECDSA depending on platform) |
| SNMPv2c with community `public` | SNMPv3 authPriv + ACL |
| `exec-timeout 0 0` | `exec-timeout 5 0` or lower |
| `permit ip any any` in ACLs | Least privilege + logging of denies |
| Simple PSK, IKEv1 group 2/5, SHA-1 | IKEv2, certificates or strong PSK, DH 14+/19+, SHA-256+ |
| VLAN 1 for everything, default native VLAN | Dedicated management VLAN, unused native VLAN, DTP off |
| TFTP for backups | SCP/SFTP, versioned and encrypted backups |
| No NTP or syslog | Authenticated NTP, centralized syslog, alerting |
| Unrestricted `debug` | `debug` only with filters and in a maintenance window |
