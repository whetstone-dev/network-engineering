# Network services (DHCP, DNS, NAT, management)

## Contents
- [1. DHCP](#1-dhcp)
- [2. DNS](#2-dns)
- [3. NAT / PAT](#3-nat--pat)
- [4. NTP](#4-ntp)
- [5. Syslog](#5-syslog)
- [6. SNMP](#6-snmp)
- [7. SSH, HTTP/HTTPS](#7-ssh-httphttps)
- [8. FTP / TFTP (backups)](#8-ftp--tftp-backups)
- [9. CDP / LLDP](#9-cdp--lldp)

Tags: `[PT]` Packet Tracer, `[IOS]` IOS 15.x, `[XE]` IOS XE, `[HW]` real hardware, `[PT?]` not confirmed in PT (verify version).

---

## 1. DHCP

### DORA process (UDP 67 server / 68 client)

| Step | Message | Source → Destination | Type |
|---|---|---|---|
| D | Discover | 0.0.0.0 → 255.255.255.255 | Broadcast |
| O | Offer | Server → client | Unicast or broadcast (depending on the client flag) |
| R | Request | 0.0.0.0 → 255.255.255.255 | Broadcast (tells all servers which offer it accepts) |
| A | Ack | Server → client | Unicast or broadcast |

Renewal: the client tries to renew at 50% of the lease (T1) via unicast, and at 87.5% (T2) via broadcast.

### DHCP server on an IOS router

```
R1(config)# ip dhcp excluded-address 192.168.10.1 192.168.10.10    [PT][IOS][XE]
R1(config)# ip dhcp pool LAN10                                     [PT][IOS][XE]
R1(dhcp-config)# network 192.168.10.0 255.255.255.0
R1(dhcp-config)# default-router 192.168.10.1
R1(dhcp-config)# dns-server 192.168.10.5
R1(dhcp-config)# domain-name example.local                         [PT?]
R1(dhcp-config)# lease 7                                           [IOS][XE][PT?]  ! days [hours] [minutes]
```

- Exclude **before** clients request addresses: gateway, servers, printers, management IPs.
- One pool per subnet. If the router has several subnets, the pool is chosen by the interface the Discover arrives on (or by the relay's `giaddr`).
- `lease` and `domain-name`: not available in several PT versions; if the command fails, omit it (the lab works the same).

### Relay: `ip helper-address`

Configured on the **interface that is the clients' gateway** (the one receiving the broadcast), pointing to the server's IP:

```
R1(config)# interface g0/0.20                  ! VLAN 20 gateway
R1(config-subif)# ip helper-address 192.168.99.10                 [PT][IOS][XE]
```

- Converts the broadcast into unicast and fills `giaddr` with that interface's IP → the server picks the pool for that subnet.
- By default it also forwards other UDP: 37 (Time), 49 (TACACS), 53 (DNS), 67/68 (BOOTP/DHCP), 69 (TFTP), 137/138 (NetBIOS). Adjustable with `no ip forward-protocol udp <port>` `[IOS][XE]`.
- The server needs a **return route** to the `giaddr` subnet.

### DHCP on Server-PT `[PT]`

1. Give the server a static IP, mask and gateway.
2. *Services > DHCP* → Service **On**.
3. For each subnet: Pool Name, Default Gateway, DNS Server, Start IP Address, Subnet Mask, Maximum Number of Users → **Add**. (The existing `serverPool` is edited with **Save**.)
4. If the clients are on **another subnet**, configure `ip helper-address <server-IP>` on that subnet's gateway.

### Router as DHCP client

```
R1(config)# interface g0/1
R1(config-if)# ip address dhcp                                     [PT][IOS][XE]
R1(config-if)# no shutdown
```

Typical on the WAN link to the ISP. Verify with `show ip interface brief` and `show dhcp lease` `[IOS][PT?]`.

### DHCP verification

| Command | Shows |
|---|---|
| `show ip dhcp binding` | Assigned IPs ↔ MAC/client-id, expiration |
| `show ip dhcp pool` | Range, used/free addresses per pool |
| `show ip dhcp conflict` | IPs detected in use (ping/gratuitous ARP); `clear ip dhcp conflict *` |
| `show ip dhcp server statistics` `[PT?]` | DORA counters |
| PT PC: *Desktop > Command Prompt* | `ipconfig /all`, `ipconfig /release`, `ipconfig /renew` |
| PT PC: *Desktop > IP Configuration* | Select **DHCP** |

Common failures: missing helper-address, pool without `default-router`, all IPs excluded, switch port in the wrong VLAN, PC with 169.254.x.x (APIPA = no response received).

---

## 2. DNS

**Server-PT** `[PT]`: *Services > DNS* → **On** → Name + Type + Address → **Add**.

| Record | Use | Example |
|---|---|---|
| A | Name → IPv4 | `www.example.local` → 192.168.99.20 |
| CNAME | Alias → another name | `intranet.example.local` → `www.example.local` |

(PT also offers NS/SOA depending on version.) PCs must receive the DNS server IP (static or via DHCP `dns-server`).

**IOS router:**

```
R1(config)# ip domain-lookup            [PT][IOS]   ! enabled by default; on XE: ip domain lookup
R1(config)# ip name-server 192.168.99.5 [PT][IOS][XE]
R1(config)# no ip domain-lookup         [PT][IOS]   ! in labs: avoids delays when a command is mistyped
R1(config)# ip host SRV1 192.168.99.10  [PT][IOS][XE]  ! local host table
```

---

## 3. NAT / PAT

### Terminology

| Term | What it is | Example |
|---|---|---|
| Inside local | Real IP of the internal host (private) | 192.168.10.25 |
| Inside global | Public IP representing the internal host | 203.0.113.10 |
| Outside local | IP of the external host as seen from inside (normally = outside global) | 198.51.100.80 |
| Outside global | Real IP of the external host | 198.51.100.80 |

Mnemonic: *inside/outside* = where the host is; *local/global* = which side the address is seen from.

### Marking interfaces (mandatory for all types)

```
R1(config)# interface g0/0/0
R1(config-if)# ip nat inside                                   [PT][IOS][XE]
R1(config)# interface g0/0/1
R1(config-if)# ip nat outside
```

### Static (published server)

```
R1(config)# ip nat inside source static 192.168.99.20 203.0.113.10                   [PT][IOS][XE]
R1(config)# ip nat inside source static tcp 192.168.99.20 80 203.0.113.10 80         [PT][IOS][XE]
```

### Dynamic with a pool

```
R1(config)# access-list 1 permit 192.168.10.0 0.0.0.255
R1(config)# ip nat pool PUB 203.0.113.10 203.0.113.14 netmask 255.255.255.248        [PT][IOS][XE]
R1(config)# ip nat inside source list 1 pool PUB              ! 1:1 while free IPs remain
R1(config)# ip nat inside source list 1 pool PUB overload     ! PAT over the pool
```

### PAT with the interface IP (most common)

```
R1(config)# access-list 1 permit 192.168.0.0 0.0.255.255
R1(config)# ip nat inside source list 1 interface g0/0/1 overload                     [PT][IOS][XE]
R1(config)# ip route 0.0.0.0 0.0.0.0 203.0.113.1
```

- The ACL (normally standard) **selects** which traffic is translated; it does not filter traffic.
- Production: do not use `permit any` in the NAT ACL.

### Verification

```
show ip nat translations          ! Pro, Inside global, Inside local, Outside local, Outside global
show ip nat statistics            ! hits/misses, inside/outside interfaces, pool
clear ip nat translation *        ! clears dynamic translations (not static ones)
debug ip nat                      ! lab only
```

Dynamic translations appear **only when there is traffic**: generate a ping from an internal host before verifying.

### Common mistakes

| Symptom | Cause |
|---|---|
| `show ip nat translations` empty | ACL does not match the real subnet (wrong wildcard), or no traffic has been generated |
| Misses in `statistics`, no translation | `ip nat inside` / `ip nat outside` swapped or one missing |
| Translates but no response | Missing default route to the ISP, or the ISP has no route to the global IP |
| Pool exhausted | Dynamic NAT without `overload` with more hosts than IPs |
| VPN stops working when PAT is enabled | VPN traffic gets translated: exclude it from the NAT ACL (see `references/security.md`) |

---

## 4. NTP

```
R1(config)# ntp server 192.168.99.5          [PT][IOS][XE]
R1(config)# ntp master 3                     [IOS][PT?]   ! the router acts as a source (stratum 3)
R1(config)# clock timezone COT -5            [PT?][IOS]
R1# show ntp status                          ! "Clock is synchronized", stratum
R1# show ntp associations                    ! * = synchronized peer
```

- Server-PT has an NTP service under *Services > NTP* `[PT]`.
- Synchronization can take minutes. Without correct time, logs and certificates are useless.
- Production: NTP authentication (`ntp authenticate`, `ntp authentication-key`, `ntp trusted-key`) and multiple sources.

---

## 5. Syslog

```
R1(config)# service timestamps log datetime msec       [PT][IOS][XE]
R1(config)# logging host 192.168.99.5                  [PT][IOS][XE]  ! old syntax: logging 192.168.99.5
R1(config)# logging trap warnings                      [PT][IOS][XE]  ! sends level 4 and more severe (0–4)
R1# show logging
```

| Level | Name | Level | Name |
|---|---|---|---|
| 0 | emergencies | 4 | warnings |
| 1 | alerts | 5 | notifications |
| 2 | critical | 6 | informational |
| 3 | errors | 7 | debugging |

Server-PT: *Services > SYSLOG* shows the received messages `[PT]`. Without NTP, timestamps will be wrong.

---

## 6. SNMP

```
! SNMPv2c — lab only (community in plain text)
R1(config)# snmp-server community <RO-COMMUNITY> RO          [PT][IOS][XE]
! Avoid RW unless truly needed; restrict with an ACL:
R1(config)# snmp-server community <RO-COMMUNITY> RO 10

! SNMPv3 — production (authPriv)
R1(config)# snmp-server group GRP-NMS v3 priv                                      [IOS][XE][PT?]
R1(config)# snmp-server user nms GRP-NMS v3 auth sha <SECRET> priv aes 128 <SECRET> [IOS][XE][PT?]
```

- PC-PT: *Desktop > MIB Browser* to test SNMP in the lab `[PT]`.
- **Production: use SNMPv3 with auth+priv**; v1/v2c send the community unencrypted.

---

## 7. SSH, HTTP/HTTPS

- **SSH**: full configuration and hardening in `references/security.md`.
- **Server-PT**: *Services > HTTP* (HTTP and HTTPS on/off, edit `index.html`). Test from a PC: *Desktop > Web Browser*.
- **IOS**:

```
R1(config)# ip http server            [IOS][PT?]   ! web/REST interface on some devices
R1(config)# no ip http server         ! production: disable if not used
R1(config)# ip http secure-server     [IOS][XE]    ! if needed, HTTPS only + ACL
```

---

## 8. FTP / TFTP (backups)

```
R1# copy running-config tftp:          [PT][IOS][XE]
Address or name of remote host []? 192.168.99.5
Destination filename [R1-confg]?
R1# copy tftp: running-config          ! restore (merges, does not replace)
R1# copy startup-config tftp:

! FTP (requires credentials)
R1(config)# ip ftp username <USERNAME>  [IOS][PT?]
R1(config)# ip ftp password <SECRET>    [IOS][PT?]
R1# copy running-config ftp:
```

- Server-PT offers *Services > TFTP* and *Services > FTP* (users/permissions configurable in the FTP tab) `[PT]`.
- TFTP has no authentication or encryption: management network only. Production: SCP/SFTP (`ip scp server enable` `[IOS][XE]`).
- `copy tftp: running-config` **merges** lines; for a full replace use `configure replace` `[IOS][XE][HW]`.

---

## 9. CDP / LLDP

| | CDP | LLDP (IEEE 802.1AB) |
|---|---|---|
| Vendor | Cisco proprietary | Standard, multivendor |
| Default on IOS | Enabled | Disabled |
| Timers | 60 s / holdtime 180 s | 30 s / holdtime 120 s |
| Global | `cdp run` / `no cdp run` | `lldp run` / `no lldp run` |
| Per interface | `no cdp enable` | `no lldp transmit` / `no lldp receive` |
| Show neighbors | `show cdp neighbors [detail]` | `show lldp neighbors [detail]` |
| Support | `[PT][IOS][XE]` | `[IOS][XE][PT?]` |

- `show cdp neighbors detail` reveals the neighbor's management IP, model and IOS: excellent for documenting topologies.
- Security: disable CDP/LLDP on interfaces facing the ISP, the Internet or untrusted users (information leakage).
