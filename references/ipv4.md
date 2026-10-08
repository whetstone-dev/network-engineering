# IPv4: addressing, subnetting and VLSM

## Contents
- [Historical classes (and when they still matter)](#historical-classes-and-when-they-still-matter)
- [CIDR, mask and wildcard](#cidr-mask-and-wildcard)
- [Prefix table (/8 to /32)](#prefix-table-8-to-32)
- [Network, broadcast and range: magic number method](#network-broadcast-and-range-magic-number-method)
- [Subnetting by number of subnets](#subnetting-by-number-of-subnets)
- [Subnetting by number of hosts](#subnetting-by-number-of-hosts)
- [VLSM step by step](#vlsm-step-by-step)
- [Summarization / supernetting](#summarization--supernetting)
- [Point-to-point links: /30 vs /31](#point-to-point-links-30-vs-31)
- [Special ranges](#special-ranges)
- [Gateway convention](#gateway-convention)
- [Recommended addressing table](#recommended-addressing-table)
- [Common mistakes and how to detect them](#common-mistakes-and-how-to-detect-them)

## Historical classes (and when they still matter)

| Class | First octet | Leading bits | Default mask | Use |
|---|---|---|---|---|
| A | 1–126 | `0` | /8 (255.0.0.0) | Unicast (0 and 127 reserved) |
| B | 128–191 | `10` | /16 (255.255.0.0) | Unicast |
| C | 192–223 | `110` | /24 (255.255.255.0) | Unicast |
| D | 224–239 | `1110` | — | Multicast |
| E | 240–255 | `1111` | — | Experimental / reserved |

Classful addressing is obsolete (CIDR, RFC 4632), but **the class boundary still shows up** in:
- **RIPv1**: classful, does not send the mask in updates → no support for VLSM or discontiguous networks.
- **`auto-summary`**: RIPv2 has it enabled by default on classic IOS → use `no auto-summary`. In EIGRP it is disabled by default since IOS 15.0(1)M; in Packet Tracer the default depends on the version → verify with `show ip protocols`.
- **Classful `network` statements**: in RIP, `network 10.1.1.0` is stored as `network 10.0.0.0`. In EIGRP without a wildcard, `network 172.16.0.0` covers all 172.16.x.x interfaces. For precision in EIGRP/OSPF use a wildcard.
- **Discontiguous networks** + auto-summary = routes summarized at the class boundary pointing to the wrong place (intermittent loss of connectivity).

```
router rip
 version 2
 no auto-summary          ! [PT] [IOS]
 network 10.0.0.0         ! RIP is always classful in "network"
router eigrp 100
 no auto-summary          ! [PT] [IOS]
 network 172.16.1.0 0.0.0.255   ! with wildcard = precise
```

`ip subnet-zero` is enabled by default since IOS 12.0: subnet zero is usable. Only very old material discards it.

## CIDR, mask and wildcard

- **Prefix /n** = n network bits set to 1. Usable hosts = 2^(32−n) − 2 (except /31 and /32).
- **Wildcard** = 255.255.255.255 − mask. Used in ACLs and OSPF/EIGRP `network`.
- **Block size (magic number)** = 256 − mask value in the "interesting" octet (the last one that is not 255).

## Prefix table (/8 to /32)

| Prefix | Mask | Wildcard | Block (octet) | Usable hosts |
|---|---|---|---|---|
| /8 | 255.0.0.0 | 0.255.255.255 | 1 (1st) | 16,777,214 |
| /9 | 255.128.0.0 | 0.127.255.255 | 128 (2nd) | 8,388,606 |
| /10 | 255.192.0.0 | 0.63.255.255 | 64 (2nd) | 4,194,302 |
| /11 | 255.224.0.0 | 0.31.255.255 | 32 (2nd) | 2,097,150 |
| /12 | 255.240.0.0 | 0.15.255.255 | 16 (2nd) | 1,048,574 |
| /13 | 255.248.0.0 | 0.7.255.255 | 8 (2nd) | 524,286 |
| /14 | 255.252.0.0 | 0.3.255.255 | 4 (2nd) | 262,142 |
| /15 | 255.254.0.0 | 0.1.255.255 | 2 (2nd) | 131,070 |
| /16 | 255.255.0.0 | 0.0.255.255 | 1 (2nd) | 65,534 |
| /17 | 255.255.128.0 | 0.0.127.255 | 128 (3rd) | 32,766 |
| /18 | 255.255.192.0 | 0.0.63.255 | 64 (3rd) | 16,382 |
| /19 | 255.255.224.0 | 0.0.31.255 | 32 (3rd) | 8,190 |
| /20 | 255.255.240.0 | 0.0.15.255 | 16 (3rd) | 4,094 |
| /21 | 255.255.248.0 | 0.0.7.255 | 8 (3rd) | 2,046 |
| /22 | 255.255.252.0 | 0.0.3.255 | 4 (3rd) | 1,022 |
| /23 | 255.255.254.0 | 0.0.1.255 | 2 (3rd) | 510 |
| /24 | 255.255.255.0 | 0.0.0.255 | 1 (3rd) / 256 (4th) | 254 |
| /25 | 255.255.255.128 | 0.0.0.127 | 128 (4th) | 126 |
| /26 | 255.255.255.192 | 0.0.0.63 | 64 (4th) | 62 |
| /27 | 255.255.255.224 | 0.0.0.31 | 32 (4th) | 30 |
| /28 | 255.255.255.240 | 0.0.0.15 | 16 (4th) | 14 |
| /29 | 255.255.255.248 | 0.0.0.7 | 8 (4th) | 6 |
| /30 | 255.255.255.252 | 0.0.0.3 | 4 (4th) | 2 |
| /31 | 255.255.255.254 | 0.0.0.1 | 2 (4th) | 2 (P2P only, RFC 3021) |
| /32 | 255.255.255.255 | 0.0.0.0 | 1 (4th) | 1 (host route / loopback) |

## Network, broadcast and range: magic number method

1. Identify the interesting octet (first mask octet other than 255).
2. Block = 256 − mask in that octet.
3. Network = largest multiple of the block ≤ the octet value in the IP; following octets set to 0.
4. Broadcast = network + block − 1 in that octet; following octets set to 255.
5. Usable range = network + 1 … broadcast − 1.

**Example 1 — 192.168.10.77/27**
- Mask 255.255.255.224 → octet 4, block 256 − 224 = 32.
- Multiples: 0, 32, 64, 96 → 77 falls in 64–95.
- Network **192.168.10.64**, broadcast **192.168.10.95**, range **.65 – .94**, 30 hosts.

**Example 2 — 10.20.77.15/20**
- Mask 255.255.240.0 → octet 3, block 16.
- Multiples: …, 48, 64, 80 → 77 falls in 64–79.
- Network **10.20.64.0**, broadcast **10.20.79.255**, range **10.20.64.1 – 10.20.79.254**, 4,094 hosts.

## Subnetting by number of subnets

Borrowed bits b such that 2^b ≥ required subnets. New prefix = original prefix + b.

**Example:** 192.168.1.0/24, 6 subnets needed.
- 2^3 = 8 ≥ 6 → b = 3 → **/27** (block 32, 30 hosts each, 2 spare subnets).

| # | Network | Usable range | Broadcast |
|---|---|---|---|
| 0 | 192.168.1.0/27 | .1 – .30 | .31 |
| 1 | 192.168.1.32/27 | .33 – .62 | .63 |
| 2 | 192.168.1.64/27 | .65 – .94 | .95 |
| 3 | 192.168.1.96/27 | .97 – .126 | .127 |
| 4 | 192.168.1.128/27 | .129 – .158 | .159 |
| 5 | 192.168.1.160/27 | .161 – .190 | .191 |
| 6–7 | .192/27, .224/27 | spare | — |

## Subnetting by number of hosts

Host bits h such that 2^h − 2 ≥ required hosts. Prefix = 32 − h.

**Example:** 172.16.0.0/16, each subnet needs 50 hosts.
- 2^6 − 2 = 62 ≥ 50 → h = 6 → **/26**.
- Available subnets: 2^(26−16) = 1,024. First ones: 172.16.0.0/26, 172.16.0.64/26, 172.16.0.128/26, 172.16.0.192/26, 172.16.1.0/26…

Growth rule (production): size for the current count **+ 20–30 %** at minimum, or jump to the next prefix if the margin is low. In a lab, use the exact fit the assignment asks for.

## VLSM step by step

1. List host requirements per segment (include gateway, printers, APs, growth).
2. **Sort from largest to smallest.**
3. For each, choose the smallest prefix that satisfies 2^h − 2 ≥ hosts.
4. Assign from the first free address, **aligned to the block size** (the network must be a multiple of its block).
5. Leave P2P links (/30 or /31) for last.
6. Record the remaining free space.

**Example:** 192.168.10.0/24 — SALES 100, ADMIN 50, IT 25, SERVERS 10, 3 WAN links.

| Segment | Hosts | Prefix | Network | Usable range | Broadcast |
|---|---|---|---|---|---|
| SALES | 100 | /25 (126) | 192.168.10.0 | .1 – .126 | .127 |
| ADMIN | 50 | /26 (62) | 192.168.10.128 | .129 – .190 | .191 |
| IT | 25 | /27 (30) | 192.168.10.192 | .193 – .222 | .223 |
| SERVERS | 10 | /28 (14) | 192.168.10.224 | .225 – .238 | .239 |
| WAN R1–R2 | 2 | /30 | 192.168.10.240 | .241 – .242 | .243 |
| WAN R1–R3 | 2 | /30 | 192.168.10.244 | .245 – .246 | .247 |
| WAN R2–R3 | 2 | /30 | 192.168.10.248 | .249 – .250 | .251 |
| Free | — | /30 | 192.168.10.252 | — | — |

Why sort: if a /28 is assigned first at .0, the /25 can no longer start at .0 and ends up misaligned or out of space.

## Summarization / supernetting

Procedure: write the changing octet in binary, count the common bits from the left; summary prefix = total common bits.

**Example:** 172.16.0.0/24, 172.16.1.0/24, 172.16.2.0/24, 172.16.3.0/24.
- 3rd octet: 0 = `000000|00`, 1 = `000000|01`, 2 = `000000|10`, 3 = `000000|11`.
- 16 + 6 = 22 common bits → **172.16.0.0/22** (exact, no leftovers).

Conditions for a clean summary: the number of networks is a power of 2 **and** the first one is aligned to the block (e.g. 10.1.4.0–10.1.7.0 → 10.1.4.0/22 yes; 10.1.3.0–10.1.6.0 does not fit in a single /22: a 10.1.0.0/21 would include foreign networks → over-summarization and a possible blackhole).

```
interface g0/0
 ip summary-address eigrp 100 172.16.0.0 255.255.252.0   ! [PT] [IOS]
router ospf 1
 area 1 range 172.16.0.0 255.255.252.0                   ! on ABR [PT?] [IOS]
ip route 172.16.0.0 255.255.252.0 10.0.0.2               ! summarized static [PT] [IOS]
```

See `references/routing.md` for per-protocol details.

## Point-to-point links: /30 vs /31

| | /30 | /31 (RFC 3021) |
|---|---|---|
| Addresses | 4 (network, 2 hosts, broadcast) | 2 (both usable) |
| Efficiency | 50 % | 100 % |
| Support | Universal | Modern IOS [IOS] [XE]; on Ethernet IOS may show a warning; PT [PT?] |
| Recommendation | Lab / CCNA / Packet Tracer | Production with many P2P links |

```
interface g0/1
 ip address 10.255.0.0 255.255.255.254   ! /31: the other end uses 10.255.0.1
```

## Special ranges

| Range | Use | Reference |
|---|---|---|
| 10.0.0.0/8 | Private | RFC 1918 |
| 172.16.0.0/12 (172.16.0.0 – 172.31.255.255) | Private | RFC 1918 |
| 192.168.0.0/16 | Private | RFC 1918 |
| 100.64.0.0/10 | Shared address space (ISP CGNAT); do not use as internal LAN | RFC 6598 |
| 169.254.0.0/16 | Link-local / APIPA: the host did not get DHCP | RFC 3927 |
| 127.0.0.0/8 | Host loopback (127.0.0.1) | RFC 1122 |
| 0.0.0.0/8 | "This network"; 0.0.0.0/0 = default route | RFC 1122 |
| 255.255.255.255/32 | Limited broadcast | RFC 919 |
| 224.0.0.0/4 | Multicast (224.0.0.5/6 OSPF, 224.0.0.10 EIGRP, 224.0.0.9 RIPv2) | RFC 5771 |
| 240.0.0.0/4 | Reserved | RFC 1112 |
| 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 | Documentation | RFC 5737 |
| 198.18.0.0/15 | Performance testing (benchmarking) | RFC 2544 |

Quick diagnosis: a PC with 169.254.x.x → did not reach the DHCP server (check `ip helper-address`, VLAN, pool, cabling).

## Gateway convention

- **First usable (.1)**: the most common in documentation and labs.
- **Last usable (.254 in a /24)**: a frequent alternative in some organizations.
- **Rule**: pick one and apply it to **all** subnets; document it.
- With FHRP (HSRP/VRRP/GLBP): virtual IP = .1, physical routers .2 and .3 (common convention, not a standard).
- Reserve a low block for infrastructure (e.g. .1–.10: gateway, switches, APs) and exclude it from the DHCP pool:

```
ip dhcp excluded-address 192.168.10.1 192.168.10.10   ! [PT] [IOS]
```

## Recommended addressing table

One row per segment; same format in every deliverable:

| VLAN | Name | Network | Mask | Gateway | Usable range | Broadcast | Hosts |
|---|---|---|---|---|---|---|---|
| 10 | SALES | 192.168.10.0/25 | 255.255.255.128 | 192.168.10.1 | .1 – .126 | 192.168.10.127 | 126 |
| 20 | ADMIN | 192.168.10.128/26 | 255.255.255.192 | 192.168.10.129 | .129 – .190 | 192.168.10.191 | 62 |
| 30 | IT | 192.168.10.192/27 | 255.255.255.224 | 192.168.10.193 | .193 – .222 | 192.168.10.223 | 30 |
| 99 | MGMT | 192.168.99.0/24 | 255.255.255.0 | 192.168.99.1 | .1 – .254 | 192.168.99.255 | 254 |

Complement with a per-device table: | Device | Interface | IP | Mask | Gateway | Description |.

## Common mistakes and how to detect them

| Mistake | Symptom | Detection / fix |
|---|---|---|
| Assigning the network or broadcast IP to a host | IOS rejects it with a `Bad mask`-type message; on PCs, no connectivity | Recalculate with the magic number |
| Inconsistent mask between ends or hosts on the same segment | Partial connectivity, failed ARP, OSPF adjacencies not forming | `show ip interface brief`, `show running-config interface`, `ipconfig` on the PC |
| Gateway outside the host's subnet | The host cannot reach other networks | Check that gateway ∈ usable range |
| Overlapping subnets | IOS rejects with an `overlaps with` message on the same router; across routers, incorrect routing | Review the VLSM plan; `show ip route` |
| PC gateway ≠ SVI/subinterface IP | Inter-VLAN does not work | `show ip interface brief` on the L3 device |
| VLSM not aligned to the block | "Invalid" network (e.g. 192.168.1.16/27) | The network must be a multiple of the block |
| Using 100.64/10 or someone else's public ranges on the LAN | Conflicts with ISP/Internet | Use RFC 1918 |
| Auto-summary with discontiguous networks | Routes to the classful network via two paths | `no auto-summary` (RIPv2/EIGRP) |
