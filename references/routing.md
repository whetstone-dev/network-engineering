# Routing (IPv4)

## Contents
- [1. How a router decides](#1-how-a-router-decides)
- [2. Reading `show ip route`](#2-reading-show-ip-route)
- [3. Static routes](#3-static-routes)
- [4. RIPv2](#4-ripv2)
- [5. OSPFv2](#5-ospfv2)
- [6. EIGRP](#6-eigrp)
- [7. Basic BGP](#7-basic-bgp)
- [8. Redistribution (brief)](#8-redistribution-brief)
- [9. Verification by protocol](#9-verification-by-protocol)
- [10. Symptom → probable cause](#10-symptom--probable-cause)
- [11. Gateway redundancy: HSRP](#11-gateway-redundancy-hsrp)
- [12. Metrics in the toolkit simulation](#12-metrics-in-the-toolkit-simulation)

Tags: `[PT]` Packet Tracer, `[IOS]` classic IOS 15.x, `[XE]` IOS XE, `[HW]` requires real hardware, `[PT?]` PT support not confirmed (verify on your version). Inter-VLAN routing (router-on-a-stick, SVI): see `references/switching.md`.

---

## 1. How a router decides

Decision order for **installing** and **using** routes:

1. **Longest prefix match** (when forwarding): the route with the longest mask that contains the destination wins. Always evaluated first.
2. **Administrative distance (AD)** (when installing into the RIB): if two protocols learn the **same prefix with the same length**, the one with the lower AD is installed.
3. **Metric**: within the same protocol, the lower metric wins. Tie → ECMP (load balancing; up to 4 routes by default in IOS, `maximum-paths` changes it).

### Worked example: longest prefix match

Router table:

| Route | Next-hop |
|---|---|
| 10.1.0.0/16 | 10.0.0.1 |
| 10.1.1.0/24 | 10.0.0.2 |
| 10.1.1.128/25 | 10.0.0.3 |
| 0.0.0.0/0 | 203.0.113.1 |

| Destination | Matching routes | Chosen | Why |
|---|---|---|---|
| 10.1.1.130 | /16, /24, /25, /0 | 10.1.1.128/25 → 10.0.0.3 | .130 is in .128–.255; /25 is the most specific |
| 10.1.1.20 | /16, /24, /0 | 10.1.1.0/24 → 10.0.0.2 | .20 is not in the /25 |
| 10.1.5.5 | /16, /0 | 10.1.0.0/16 → 10.0.0.1 | 10.1.5.x is not in 10.1.1.0/24 |
| 10.2.0.1 | /0 | default → 203.0.113.1 | without a default, the packet is dropped (ICMP unreachable) |

> A /25 route with AD 120 (RIP) **wins** over a /24 with AD 1 (static) for 10.1.1.130: AD only compares identical prefixes.

### Administrative distance (Cisco default values)

| Source | AD |
|---|---|
| Connected | 0 |
| Static | 1 |
| EIGRP summary | 5 |
| eBGP | 20 |
| EIGRP (internal) | 90 |
| OSPF | 110 |
| IS-IS | 115 |
| RIP | 120 |
| External EIGRP (D EX) | 170 |
| iBGP | 200 |
| Unknown / untrusted | 255 (never installed) |

### Metric by protocol

| Protocol | Metric | Notes |
|---|---|---|
| RIP | Hop count | 16 = unreachable; max. 15 |
| OSPF | Cost = reference-bandwidth / interface bandwidth | Default ref. 100 Mbps; sum of outgoing costs |
| EIGRP | Composite (minimum bandwidth + cumulative delay with default K values) | See section 6 |
| BGP | Not a metric: attribute selection process (weight, local-pref, AS-path, origin, MED…) | |
| Static | 0 | |

---

## 2. Reading `show ip route`

```
R1# show ip route
Codes: L - local, C - connected, S - static, R - RIP, O - OSPF, D - EIGRP, B - BGP,
       IA - OSPF inter area, E1/E2 - OSPF external type 1/2, EX - EIGRP external, * - candidate default
Gateway of last resort is 203.0.113.1 to network 0.0.0.0

S*    0.0.0.0/0 [1/0] via 203.0.113.1
      10.0.0.0/8 is variably subnetted, 7 subnets, 3 masks
C        10.0.12.0/30 is directly connected, GigabitEthernet0/1
L        10.0.12.1/32 is directly connected, GigabitEthernet0/1
C        10.0.13.0/30 is directly connected, Serial0/0/0
L        10.0.13.1/32 is directly connected, Serial0/0/0
O        10.2.2.0/24 [110/2] via 10.0.12.2, 00:05:12, GigabitEthernet0/1
O IA     10.3.0.0/24 [110/3] via 10.0.12.2, 00:04:50, GigabitEthernet0/1
O E2     10.9.0.0/24 [110/20] via 10.0.12.2, 00:04:50, GigabitEthernet0/1
D EX     172.16.5.0/24 [170/2681856] via 10.0.13.2, 00:01:10, Serial0/0/0
```

| Code | Meaning |
|---|---|
| `C` | Directly connected network (interface up/up with an IP) |
| `L` | /32 address of the interface itself (IOS 15+) |
| `S` | Static route; `S*` = static candidate default |
| `O` | OSPF intra-area (LSA 1/2) |
| `O IA` | OSPF inter-area (LSA 3, via ABR) |
| `O E2` | OSPF external type 2 (default for redistribution; fixed cost, does not add the internal cost). `O E1` does add it |
| `O*E2` | External default injected with `default-information originate` |
| `D` | EIGRP internal; `D EX` = external (redistributed, AD 170) |
| `R` | RIP |
| `B` | BGP |

- `[110/2]` = `[AD/metric]`. `via` = next-hop; `00:05:12` = age of the route.
- **Gateway of last resort**: the active default. If it says `not set`, there is no default → everything unmatched is dropped.
- Filtering: `show ip route ospf`, `show ip route static`, `show ip route 10.2.2.0` (detail for one prefix), `show ip route | include via` `[PT?]` for pipes.

---

## 3. Static routes

```
! Next-hop (requires a recursive lookup to find the interface)
R1(config)# ip route 192.168.20.0 255.255.255.0 10.0.12.2            [PT][IOS][XE]
! Exit interface (only advisable on point-to-point/serial)
R1(config)# ip route 192.168.20.0 255.255.255.0 Serial0/0/0           [PT][IOS][XE]
! Fully specified (interface + next-hop): recommended on Ethernet
R1(config)# ip route 192.168.20.0 255.255.255.0 g0/1 10.0.12.2        [PT][IOS][XE]
! Default
R1(config)# ip route 0.0.0.0 0.0.0.0 203.0.113.1                      [PT][IOS][XE]
! Floating (backup): AD higher than the primary route
R1(config)# ip route 0.0.0.0 0.0.0.0 198.51.100.1 5                   [PT][IOS][XE]
```

- **Recursive lookup**: with only a next-hop, the router looks up the next-hop in the table to find the exit interface (2 lookups). If the next-hop is unreachable, the route is not installed.
- **Interface only on Ethernet**: the router ARPs for every destination and relies on the neighbor's proxy ARP. Avoid; use fully specified.
- **Floating**: only appears in the RIB when the primary goes down. To back up an OSPF route (AD 110) the floating route must have AD > 110 (e.g. 130). To back up another static (AD 1), AD > 1 is enough.
- A static route with a next-hop stays even if the neighbor goes down as long as the local interface stays up (Ethernet to a switch). To detect real failures: IP SLA + `track` `[IOS][XE]` `[PT?]`.
- Do not forget the **return route**: every intermediate router and the destination need a route back to the source.

---

## 4. RIPv2

```
R1(config)# router rip                                  [PT][IOS]
R1(config-router)# version 2
R1(config-router)# no auto-summary
R1(config-router)# network 10.0.0.0                     ! classful: advertises all interfaces in 10.x.x.x
R1(config-router)# network 192.168.10.0
R1(config-router)# passive-interface g0/0               ! user LAN: do not send updates
R1(config-router)# default-information originate        ! advertises a default; in RIP it does not require one in the RIB (unlike OSPF) [verify]
```

- `network` is **classful**: `network 10.1.1.0` becomes `10.0.0.0`. No wildcard support.
- Updates every 30 s to 224.0.0.9 (v2). Metric: hops; **maximum 15**, 16 = unreachable.
- `no auto-summary` is key with discontiguous networks (subnets of the same major network separated by another network).
- Limitations: slow convergence, hop count ignores bandwidth, does not scale. Current use: lab/legacy.

---

## 5. OSPFv2

### Single-area configuration

```
R1(config)# router ospf 1                                   [PT][IOS][XE]
R1(config-router)# router-id 1.1.1.1
R1(config-router)# network 10.0.12.0 0.0.0.3 area 0
R1(config-router)# network 192.168.10.0 0.0.0.255 area 0
R1(config-router)# passive-interface g0/0
R1(config-router)# auto-cost reference-bandwidth 10000      ! in Mbps; same on ALL routers
R1(config-router)# default-information originate            ! requires a default in the RIB (or add "always")

! Per-interface alternative
R1(config)# interface g0/1
R1(config-if)# ip ospf 1 area 0                             [IOS][XE][PT?]
```

- **Process ID** (`router ospf 1`) is local; it does not need to match between neighbors.
- **Router-ID** (selection order): 1) manual `router-id`, 2) highest active loopback IP, 3) highest active physical interface IP. Changing it requires `clear ip ospf process` (disrupts adjacencies).
- `network <network> <wildcard> area <n>`: enables OSPF on interfaces whose IP matches. `network 10.0.12.1 0.0.0.0 area 0` enables exactly that interface.
- `passive-interface default` + `no passive-interface <if>` `[IOS][XE][PT?]`.

### Cost

`cost = reference-bandwidth / bandwidth` (minimum 1). With ref 100 Mbps: FastEthernet = 1, GigabitEthernet = 1 (no difference!), 10 Mbps = 10, T1 1.544 Mbps = 64. With `auto-cost reference-bandwidth 10000`: Gi = 10, Fa = 100. Force it: `ip ospf cost 50` on the interface. The `bandwidth` command changes the calculation, not the actual speed.

### DR/BDR and network types

| Network type | Example | DR/BDR | Hello/Dead |
|---|---|---|---|
| Broadcast | Ethernet | Yes | 10/40 s |
| Point-to-point | Serial HDLC/PPP, `ip ospf network point-to-point` | No | 10/40 s |
| NBMA | Frame Relay | Yes | 30/120 s |
| Point-to-multipoint | Manually configured | No | 30/120 s |

- DR election: highest `ip ospf priority` (default 1; **0 = never DR**), tie → highest router-id. **Non-preemptive**: a router with higher priority that boots later does not replace the DR (restart with `clear ip ospf process`).
- On an Ethernet link between 2 routers, `ip ospf network point-to-point` avoids the election and speeds up the adjacency.

### Neighbor states

`Down → Init → 2-Way → ExStart → Exchange → Loading → Full`

- Between two DROTHERs, staying in **2WAY/DROTHER is normal**. With the DR/BDR it must be FULL.
- Stuck in **ExStart/Exchange** → almost always an **MTU mismatch**.
- Stuck in **Init** → one-way hello (ACL, filtering of multicast 224.0.0.5).

### Adjacency requirements (must match)

| Parameter | Must |
|---|---|
| Area | match on the link |
| Subnet and mask | match (except point-to-point in some cases) |
| Hello/Dead | match |
| Authentication (type and key) | match |
| MTU | match (or `ip ospf mtu-ignore`) |
| Area stub flag | match |
| Router-ID | be **unique** |
| Interfaces | not passive on both sides |

### Multi-area

```
! ABR R2: one interface in area 0 and another in area 1
R2(config)# router ospf 1
R2(config-router)# router-id 2.2.2.2
R2(config-router)# network 10.0.12.0 0.0.0.3 area 0
R2(config-router)# network 10.0.23.0 0.0.0.3 area 1
R2(config-router)# area 1 range 10.1.0.0 255.255.0.0      ! summarization on the ABR
```

- Every non-backbone area must touch **area 0** (or use a virtual link). ABR = joins areas; ASBR = redistributes external routes.
- LSAs: 1 router, 2 network (DR), 3 summary (ABR → `O IA`), 4 ASBR summary, 5 external (`O E1/E2`), 7 NSSA.

---

## 6. EIGRP

```
R1(config)# router eigrp 100                               [PT][IOS][XE]
R1(config-router)# eigrp router-id 1.1.1.1
R1(config-router)# network 10.0.12.0 0.0.0.3
R1(config-router)# network 192.168.10.0 0.0.0.255
R1(config-router)# no auto-summary
R1(config-router)# passive-interface g0/0
```

- The **AS (100) must match** between neighbors (unlike the OSPF process ID). So must the K-values and subnet, and authentication if used.
- `auto-summary`: disabled by default since IOS 15.0(1)M; in PT and older versions it may be enabled → always configure `no auto-summary` explicitly.
- Hello 5 s / hold 15 s on LAN. Multicast 224.0.0.10. AD 90 internal, 170 external, 5 summary.
- **Default metric** (K1=1, K3=1, K2=K4=K5=0): `256 × (10^7 / BW_min_kbps + sum_delay_µs / 10)`. Only the minimum bandwidth of the path and the cumulative delay count.
- **Successor**: best route (lowest Feasible Distance, FD). **Feasible successor**: backup route whose **Reported/Advertised Distance < the successor's FD** (feasibility condition). If an FS exists, failover is immediate, without queries.
- Named mode (`router eigrp NAME`) `[IOS][XE]` `[PT?]`.

```
show ip eigrp neighbors          ! neighbors, hold time, uptime, SRTT
show ip eigrp topology           ! successors (P = passive) and FS with FD/RD
show ip eigrp interfaces
show ip route eigrp
```

---

## 7. Basic BGP

- **eBGP**: between different ASes (AD 20), neighbors normally directly connected (TTL 1). **iBGP**: same AS (AD 200), requires full mesh or route reflectors; the next-hop is not changed (use `next-hop-self` `[IOS][XE]`).
- Session over TCP 179. States: Idle → Connect → Active → OpenSent → OpenConfirm → **Established**.

```
R1(config)# router bgp 65001                                 [PT][IOS][XE]
R1(config-router)# bgp router-id 1.1.1.1                     [PT?]
R1(config-router)# neighbor 198.51.100.2 remote-as 65002     ! eBGP
R1(config-router)# network 203.0.113.0 mask 255.255.255.0
```

- `network x mask y` **only advertises if an exact route exists** (same prefix and mask) in the RIB. Common trick: `ip route 203.0.113.0 255.255.255.0 Null0`.
- PT: limited support (basic eBGP, `neighbor`, `network`). Route-maps, advanced attributes, route reflectors → `[HW]` or verify on your PT version.
- Verify: `show ip bgp summary` (state/prefixes received), `show ip bgp`, `show ip route bgp`.

---

## 8. Redistribution (brief)

```
! Static/connected into OSPF (without "subnets", classic IOS only passes classful networks)
R1(config-router)# redistribute static subnets               [PT][IOS]
! Into EIGRP: requires a metric (bw delay reliability load mtu)
R1(config-router)# redistribute ospf 1 metric 10000 100 255 1 1500
! Into RIP: requires a metric in hops
R1(config-router)# redistribute ospf 1 metric 2
```

- On recent IOS XE `subnets` may be added automatically; verify on your version.
- Risks: loops and suboptimal routes with mutual redistribution at several points → use filters/tags `[IOS][XE]`. In a lab with a single redistribution point it is usually not needed.

---

## 9. Verification by protocol

| Goal | Command |
|---|---|
| Active protocols, advertised networks, passive interfaces, routing information sources, AD | `show ip protocols` |
| OSPF neighbors and state | `show ip ospf neighbor` |
| OSPF interfaces, cost, DR/BDR state | `show ip ospf interface brief` / `show ip ospf interface g0/0` |
| Router-ID, areas, SPF | `show ip ospf` |
| LSDB | `show ip ospf database` |
| Routes from one protocol | `show ip route ospf` / `eigrp` / `rip` / `static` |
| RIP | `show ip rip database` `[PT?]` |
| EIGRP | `show ip eigrp neighbors` / `topology` |
| Actual path | `traceroute` (IOS) / `tracert` (PT PC) |

`debug ip ospf adj`, `debug ip rip`, `debug eigrp packets` `[PT][IOS]`: useful in the lab. **In production, `debug` can saturate the CPU**: use only with filters, in a maintenance window, with `terminal monitor`, and turn off with `undebug all`.

---

## 10. Symptom → probable cause

| Symptom | Probable cause | Check / fix |
|---|---|---|
| No OSPF neighbors | Mismatched area, hello/dead, mask, auth or MTU; passive interface; duplicate router-ID; ACL blocks 224.0.0.5 | `show ip ospf interface`, `debug ip ospf adj` |
| OSPF neighbor stuck in ExStart/Exchange | MTU mismatch | Match MTU or `ip ospf mtu-ignore` |
| Ping goes out but does not come back | Missing **return route** on the destination or an intermediate hop | `show ip route <source>` on each hop |
| Default does not appear on the other routers | Missing `default-information originate`, or the originating router has no default in its RIB | `show ip route 0.0.0.0`; use `always` only if you understand the risk |
| Routes to 172.16.x.x subnets arrive as 172.16.0.0/16 or flap | `auto-summary` enabled in RIP/EIGRP | `no auto-summary` |
| Subnets of the same major network separated by another network are unreachable | **Discontiguous networks** + classful summarization | `no auto-summary`, use a classless protocol |
| No EIGRP neighbors | Different AS, different K-values, different subnet, passive interface | `show ip protocols`, `show ip eigrp interfaces` |
| Expected route is not installed | Another source with lower AD for the same prefix, or unreachable next-hop | `show ip route <prefix>` |
| Traffic uses a slow path with OSPF | Ref-bandwidth 100 Mbps equalizes Fa and Gi | `auto-cost reference-bandwidth` on all routers |
| Floating route never kicks in | The primary interface stays up even though the path fails | IP SLA + `track` `[IOS][XE]` |
| BGP `network` does not advertise | No exact route in the RIB | Static to Null0 or fix the mask |

For the general troubleshooting methodology see `references/troubleshooting.md`.

## 11. Gateway redundancy: HSRP

HSRP (Cisco) lets two or more routers/L3 switches share a **virtual IP** (VIP) that hosts use as their gateway. One is **active** (answers for the VIP), another is **standby**; the rest listen.

| Concept | Value |
|---|---|
| Active election | Highest `priority` (default 100); tie: highest interface IP |
| `preempt` | Without it, a higher-priority router that comes back does **not** regain the active role |
| Virtual MAC | v1: `0000.0c07.acXX` (XX = group in hex); v2: `0000.0c9f.fXXX` |
| Groups | v1: 0-255; v2: 0-4095 (v2 also for IPv6) |
| Hello / hold | 3 s / 10 s by default |

```
DS1(config)# interface vlan 10
DS1(config-if)# ip address 10.1.10.2 255.255.255.0
DS1(config-if)# standby version 2
DS1(config-if)# standby 10 ip 10.1.10.1
DS1(config-if)# standby 10 priority 110
DS1(config-if)# standby 10 preempt
```
`[PT]` on ISR routers and 3560/3650 switches. Verification: `show standby brief` (State column: Active/Standby). GLBP and VRRP: `[PT?]`.

Design: make the **HSRP active for each VLAN also the STP root** for that VLAN (`spanning-tree vlan X root primary`); otherwise, traffic to the gateway crosses the inter-distribution link. To share load, alternate the active per VLAN (DS1 for even VLANs, DS2 for odd ones). In the model: `interfaces[].hsrp` (see `references/model.md`); the validator warns `STP-HSRP-MISALIGNED`, `HSRP-VIP-MISMATCH`, `HSRP-NO-PREEMPT`.

## 12. Metrics in the toolkit simulation

`netlab routes` and the diagram compute the tables like IOS: **OSPF** with cost = 100 Mbps / BW (Serial 64, FastEthernet 1, Gigabit 1; `auto-cost reference-bandwidth` and `bandwidth` change it), **EIGRP** with the composite metric K1=K3=1 `256 × (10^7/BWmin + Σdelay/10)` (delays: Serial 20000 µs, FastEthernet 100 µs, Gigabit/SVI 10 µs), **RIP** in hops. ECMP (only one path is shown), variance, filters and redistribution are not modeled.
