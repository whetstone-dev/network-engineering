# IPv6: addressing, autoconfiguration and basic routing

## Contents
- [Format and compression (RFC 5952)](#format-and-compression-rfc-5952)
- [Address types](#address-types)
- [Multicast and solicited-node](#multicast-and-solicited-node)
- [Prefix sizes](#prefix-sizes)
- [Nibble-boundary subnetting](#nibble-boundary-subnetting)
- [EUI-64 step by step](#eui-64-step-by-step)
- [SLAAC, stateless and stateful DHCPv6](#slaac-stateless-and-stateful-dhcpv6)
- [Base configuration in IOS](#base-configuration-in-ios)
- [DHCPv6 in IOS](#dhcpv6-in-ios)
- [IPv6 static routes](#ipv6-static-routes)
- [Basic OSPFv3](#basic-ospfv3)
- [Verification](#verification)
- [Packet Tracer notes](#packet-tracer-notes)
- [Common mistakes](#common-mistakes)

## Format and compression (RFC 5952)

128 bits = 8 groups (hextets) of 16 bits in hexadecimal, separated by `:`.

Canonical representation rules:
1. Lowercase (`2001:db8::a`, not `2001:DB8::A`).
2. Drop leading zeros in each hextet (`0db8` → `db8`, `0000` → `0`).
3. `::` replaces **the longest run** of zero hextets (2 or more); only **once** per address.
4. Tie in length → compress the **first** run.
5. Do not use `::` for a single zero hextet.

| Full | Canonical |
|---|---|
| 2001:0db8:0000:0000:0000:ff00:0042:8329 | 2001:db8::ff00:42:8329 |
| 2001:0db8:0000:0000:0001:0000:0000:0001 | 2001:db8::1:0:0:1 |
| 2001:0db8:0000:0001:0001:0001:0001:0001 | 2001:db8:0:1:1:1:1:1 |
| fe80:0000:0000:0000:0000:0000:0000:0001 | fe80::1 |
| 0000:…:0000 (all zeros) | :: |

Expansion: count the hextets present and fill `::` with the missing ones up to 8.

## Address types

| Type | Prefix | Notes |
|---|---|---|
| Global unicast (GUA) | 2000::/3 | Routable on the Internet. Typical structure: /48 global prefix + 16-bit subnet ID + 64-bit interface ID |
| Link-local | fe80::/10 (in practice fe80::/64) | Mandatory on every IPv6 interface; not routed; next hop for routing protocols |
| ULA | fc00::/7 | Equivalent to private addresses; fd00::/8 is used with a random 40-bit Global ID (RFC 4193) |
| Multicast | ff00::/8 | IPv6 **has no broadcast** |
| Loopback | ::1/128 | Equivalent to 127.0.0.1 |
| Unspecified | ::/128 | Source before having an address (e.g. DAD) |
| Default route | ::/0 | |
| Documentation | 2001:db8::/32 | RFC 3849; use in examples |
| IPv4-mapped | ::ffff:0:0/96 | Internal representation of IPv4 in sockets |

Anycast: taken from the unicast space; it has no prefix of its own.

## Multicast and solicited-node

| Group | Members |
|---|---|
| ff02::1 | All nodes on the link |
| ff02::2 | All routers on the link (routers with `ipv6 unicast-routing`) |
| ff02::5 | All OSPFv3 routers |
| ff02::6 | OSPFv3 DR/BDR |
| ff02::9 | RIPng routers |
| ff02::a | EIGRP for IPv6 routers |
| ff02::1:2 | All DHCPv6 agents (servers and relays) on the link |
| ff05::1:3 | All DHCPv6 servers (site scope) |
| ff02::1:ffXX:XXXX | Solicited-node (replaces ARP in NDP) |

Scope by the 4th digit: `ff01` interface, `ff02` link, `ff05` site, `ff0e` global.

**Solicited-node** = `ff02::1:ff` + **last 24 bits** of the unicast:
- 2001:db8:acad:1::10 → last 24 bits `00:0010` → **ff02::1:ff00:10**
- fe80::21a:2bff:fe3c:4d5e → `3c:4d5e` → **ff02::1:ff3c:4d5e**

## Prefix sizes

| Prefix | Typical use |
|---|---|
| /32 | Allocation to an ISP/LIR |
| /48 | Site/organization (65,536 /64 subnets) |
| /56 | Small or residential site (256 /64 subnets) |
| /64 | **Every LAN/VLAN**. Required for SLAAC |
| /127 | Router-to-router links (RFC 6164) |
| /128 | Loopback, host route |

Production: /64 on every LAN; /127 on P2P (often reserving a /64 per link for documentation). Lab: /64 on P2P as well is acceptable for simplicity.

## Nibble-boundary subnetting

A nibble = 1 hex digit = 4 bits. Splitting on nibble boundaries (/48, /52, /56, /60, /64) keeps addresses readable.

**Example: 2001:db8:acad::/48 → /64**
- Subnet bits = 64 − 48 = 16 → 65,536 subnets: `2001:db8:acad:0000::/64` … `2001:db8:acad:ffff::/64`.
- Only the 4th hextet changes.

Hierarchical plan (site → VLAN), first a /52 per site (16 sites, 4,096 /64s each):

| Use | Prefix |
|---|---|
| HQ | 2001:db8:acad:1000::/52 |
| Branch 1 | 2001:db8:acad:2000::/52 |
| HQ VLAN 10 | 2001:db8:acad:1010::/64 |
| HQ VLAN 20 | 2001:db8:acad:1020::/64 |
| Branch 1 VLAN 10 | 2001:db8:acad:2010::/64 |
| Infrastructure (P2P + loopbacks) | 2001:db8:acad:f000::/52 |
| P2P link block | 2001:db8:acad:ff00::/60 |
| R1–R2 link | 2001:db8:acad:ff01::2/127 (R1 ::2, R2 ::3) |
| Loopbacks | 2001:db8:acad:fffe::/64 → R1 ::1/128, R2 ::2/128 |

Common lab convention: write the VLAN number in "decimal" inside the hextet (VLAN 10 → `…:10::/64`). It is purely visual: `0x10` = 16.

## EUI-64 step by step

Example MAC: `00:1A:2B:3C:4D:5E`
1. Split into two halves: `001A2B` | `3C4D5E`.
2. Insert `FFFE` in the middle: `001A2BFFFE3C4D5E`.
3. Flip the **7th bit** (U/L) of the first byte: `00` = `0000 0000` → `0000 0010` = `02`.
4. Result: `021A:2BFF:FE3C:4D5E` → IID `21a:2bff:fe3c:4d5e`.
5. With prefix `2001:db8:acad:1::/64` → **2001:db8:acad:1:21a:2bff:fe3c:4d5e**; IOS link-local: **fe80::21a:2bff:fe3c:4d5e**.

Notes:
- If the first byte is `02` → it becomes `00`; `0C` → `0E`.
- Modern operating systems (Windows, macOS, many Linux distros) use a random/stable IID by default (RFC 4941 / RFC 7217), not EUI-64. IOS does use EUI-64 for the automatic link-local.

## SLAAC, stateless and stateful DHCPv6

Flags in the Router Advertisement (RA):
- **M** (Managed): obtain the address via stateful DHCPv6.
- **O** (Other): obtain other parameters (DNS, domain) via DHCPv6.
- **A** (Autonomous, in the Prefix Information Option): the host may autoconfigure an address with that prefix (SLAAC).

| Method | A | O | M | Address | DNS | Gateway |
|---|---|---|---|---|---|---|
| SLAAC (IOS default) | 1 | 0 | 0 | SLAAC | RDNSS in RA (variable support) or manual | RA (router link-local) |
| SLAAC + stateless DHCPv6 | 1 | 1 | 0 | SLAAC | DHCPv6 | RA |
| Stateful DHCPv6 | 0 (recommended) | — | 1 | DHCPv6 | DHCPv6 | RA |

**The gateway always comes from the RA**: DHCPv6 does not deliver a default gateway. Without RAs (no `ipv6 unicast-routing`) hosts have no default route.

## Base configuration in IOS

```
ipv6 unicast-routing                              ! [PT] [IOS] [XE] — without this the router does not forward IPv6 or send RAs
interface g0/0
 ipv6 address 2001:db8:acad:10::1/64              ! [PT] [IOS] [XE] static
 ipv6 address fe80::1 link-local                  ! [PT] [IOS] [XE] readable link-local (recommended)
 no shutdown
interface g0/1
 ipv6 address 2001:db8:acad:20::/64 eui-64        ! [PT] [IOS] [XE] IID via EUI-64
interface g0/2
 ipv6 enable                                      ! [PT] [IOS] automatic link-local only
```

Router as a client (e.g. toward an ISP): `ipv6 address autoconfig` (SLAAC) [PT?] [IOS], `ipv6 address dhcp` [PT?] [IOS].

Link-local convention: `fe80::1` on all of R1's interfaces, `fe80::2` on R2… (the link-local only needs to be unique **per link**).

## DHCPv6 in IOS

**Stateless (SLAAC + O=1):**
```
ipv6 dhcp pool STATELESS-V10                      ! [PT] [IOS]
 dns-server 2001:db8:acad:1050::53
 domain-name example.local
interface g0/0
 ipv6 nd other-config-flag                        ! O=1 [PT] [IOS]
 ipv6 dhcp server STATELESS-V10                   ! [PT] [IOS]
```

**Stateful (M=1):**
```
ipv6 dhcp pool STATEFUL-V20                       ! [PT] [IOS]
 address prefix 2001:db8:acad:20::/64             ! [PT] [IOS]
 dns-server 2001:db8:acad:1050::53
 domain-name example.local
interface g0/1
 ipv6 nd managed-config-flag                      ! M=1 [PT] [IOS]
 ipv6 nd prefix 2001:db8:acad:20::/64 no-autoconfig   ! A=0 [PT?] [IOS]
 ipv6 dhcp server STATEFUL-V20                    ! [PT] [IOS]
```

Relay (server on another network): `ipv6 dhcp relay destination 2001:db8:acad:1050::10` on the client-facing interface [PT?] [IOS]. Relay syntax and `lifetime` options vary by version → verify.

## IPv6 static routes

```
ipv6 route 2001:db8:acad:30::/64 2001:db8:acad:ff01::3          ! recursive (GUA next hop) [PT] [IOS]
ipv6 route 2001:db8:acad:30::/64 g0/1                            ! directly connected: P2P only [PT] [IOS]
ipv6 route 2001:db8:acad:30::/64 g0/1 fe80::2                    ! fully specified [PT] [IOS]
ipv6 route ::/0 g0/1 fe80::2                                     ! default
ipv6 route ::/0 2001:db8:acad:ff02::3 200                        ! floating (AD 200)
```

- **Link-local next hop ⇒ exit interface required**: the same fe80:: can exist on several links.
- On multi-access Ethernet avoid routes with only an exit interface (they depend on ND for each destination).
- See `references/routing.md` for AD and floating routes.

## Basic OSPFv3

```
ipv6 unicast-routing
ipv6 router ospf 1                    ! [PT] [IOS]
 router-id 1.1.1.1                    ! required if the router has no active IPv4 address
 passive-interface g0/0               ! LAN with no OSPF neighbors
 default-information originate        ! if it has a ::/0 route to propagate
interface g0/0
 ipv6 ospf 1 area 0                   ! [PT] [IOS] enabled per interface, not with "network"
interface g0/1
 ipv6 ospf 1 area 0
```

- With no router-id and no IPv4 the process does not start (IOS shows a warning that it cannot assign a router ID).
- Neighbors form over link-local; the next hop in `show ipv6 route` appears as `fe80::…`.
- Uses ff02::5 / ff02::6.
- Address-family syntax (`router ospfv3 1` + `address-family ipv6 unicast`) [IOS 15.x] [XE] [PT?].

## Verification

| Command | What to look at |
|---|---|
| `show ipv6 interface brief` [PT] | Status and addresses (GUA + link-local) per interface |
| `show ipv6 interface g0/0` [PT] | Joined multicast groups (ff02::2 indicates a router), ND/RA flags |
| `show ipv6 route` [PT] | Codes C, L, S, O; link-local next hops |
| `show ipv6 neighbors` [PT] | ND table (ARP equivalent) |
| `show ipv6 protocols` [PT] | IPv6 routing processes |
| `show ipv6 ospf neighbor` [PT] | OSPFv3 adjacencies in FULL |
| `show ipv6 dhcp pool` [PT] / `show ipv6 dhcp binding` [PT?] | Pool and stateful bindings |
| `ping 2001:db8:acad:30::10` / `ping ipv6 …` [PT] | Connectivity |
| `ping fe80::2` | IOS asks for the **exit interface** |
| `traceroute 2001:db8:acad:30::10` [PT] | Path |

On a PT PC: `ipconfig` (shows IPv6) and `ipv6config` [PT?]; on real Windows: `ipconfig`, `netsh interface ipv6 show neighbors`.

## Packet Tracer notes

- PC/Laptop/Server: **Desktop > IP Configuration**, IPv6 section: **Automatic** (SLAAC/DHCPv6 depending on RA flags) or **Static** (address + prefix + gateway). Exact labels vary by PT version (older versions show "DHCP / Auto Config / Static").
- Static gateway on a PC: use the router's link-local (`fe80::1`) or its GUA; with a fixed link-local on the router it is more stable.
- PT routers do not have IPv6 enabled by default: missing `ipv6 unicast-routing` = PCs in "Automatic" with no address and no gateway.
- 2960 switch with an IPv6 SVI: may require `sdm prefer dual-ipv4-and-ipv6 default` + `reload` [PT?] [IOS].
- After changing the M/O flags, toggle Static → Automatic on the PC to force a new request.
- More tool details in `references/packet-tracer.md`; general commands in `references/cisco-ios.md`.

## Common mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Missing `ipv6 unicast-routing` | Hosts with no GUA or gateway; no forwarding | Enable it globally |
| Prefix other than /64 on a LAN with SLAAC | Hosts do not autoconfigure | Use /64 |
| Link-local next hop without an interface | IOS rejects the command or the route is not installed | Specify the exit interface |
| OSPFv3 without router-id on an IPv6-only router | Process does not start, no neighbors | `router-id x.x.x.x` |
| `::` used twice | Invalid address | Only one `::` compression |
| Stateful without `no-autoconfig` | Hosts with two GUAs (SLAAC + DHCPv6) | Set A=0 on the prefix |
| Expecting the gateway from DHCPv6 | Hosts with no default route | The gateway arrives via RA |
| Duplicate link-local on the same link | DAD fails, interface in DUPLICATE state | Unique link-local per link |
