# Network topologies: selection and modeling

## Contents
- [Basic physical/logical topologies](#basic-physicallogical-topologies)
- [Hierarchical campus architectures](#hierarchical-campus-architectures)
- [Data center: spine-leaf](#data-center-spine-leaf)
- [WAN topologies](#wan-topologies)
- [Network types by scope and context](#network-types-by-scope-and-context)
- [Recommendation matrix](#recommendation-matrix)
- [Decision procedure](#decision-procedure)
- [How it maps to the model](#how-it-maps-to-the-model)

Format of each card: **What it is · Pros · Cons · Scale · SPOF** (single point of failure) **· When · PT** (how to model it in Packet Tracer).

## Basic physical/logical topologies

### Bus
- **What it is:** all nodes on a shared medium (coax 10BASE2/10BASE5), one collision domain.
- **Pros:** little cable, simple. **Cons:** collisions, a single break takes down the segment, hard to diagnose, obsolete.
- **Scale:** very low. **SPOF:** the backbone cable and the terminators.
- **When:** only as a historical/academic concept.
- **PT:** cannot be modeled faithfully; approximate with a **hub** (physical star, logical bus) for teaching purposes only.

### Star
- **What it is:** all nodes connected to a central device (switch). The basis of every modern Ethernet LAN.
- **Pros:** a cable failure affects a single host; easy to diagnose and expand. **Cons:** depends on the central device.
- **Scale:** limited by switch ports; extends as an extended star/tree.
- **SPOF:** the central switch (and its power supply).
- **When:** any small LAN; access layer.
- **PT:** 1 switch 2960 + PCs with straight-through cable (copper straight-through).

### Ring
- **What it is:** each node connected to two neighbors forming a loop.
- **Pros:** an alternate path with few links; common in metro/industrial fiber. **Cons:** on Ethernet it requires a loop-prevention protocol; a second failure splits the ring; latency grows with hop count.
- **Scale:** medium (convergence and hops are the limit). **SPOF:** none for a single link failure; two failures isolate nodes.
- **When:** industrial, metro Ethernet, fiber links between buildings on linear campuses.
- **PT:** switches in a loop with STP/RSTP blocking one port, or routers in a ring with OSPF. Production: REP/ERPS (G.8032) [HW].

### Full mesh
- **What it is:** every node linked to every other. **Links = n(n−1)/2** (5 nodes → 10; 10 → 45; 20 → 190).
- **Pros:** maximum redundancy, direct path between any pair. **Cons:** cost and complexity grow quadratically; many routing adjacencies.
- **Scale:** low (practical up to ~5–8 nodes). **SPOF:** none.
- **When:** small critical core (2–4 core routers), WAN between a few critical sites.
- **PT:** routers with extra modules (HWIC/NIM) or L3 switches with routed ports; OSPF to see ECMP.

### Partial mesh
- **What it is:** only critical nodes have redundant links.
- **Pros:** good cost/redundancy balance. **Cons:** asymmetric design and traffic; requires failure analysis.
- **Scale:** medium-high. **SPOF:** nodes with a single link.
- **When:** enterprise WAN, regional cores, distribution interconnect.
- **PT:** same as full mesh, omitting non-critical links.

### Tree (extended star)
- **What it is:** stars connected hierarchically to a root node.
- **Pros:** orderly, expandable by branch. **Cons:** a branch failure isolates everything hanging from it; the root concentrates traffic.
- **Scale:** medium. **SPOF:** root and uplinks of each branch (if there is no redundancy).
- **When:** buildings with one switch per floor and no redundancy requirements.
- **PT:** root switch + per-floor switches with straight-through cable (or crossover if the version requires it; PT supports auto-MDIX on recent devices [PT?]).

### Hybrid
- **What it is:** a combination of the above (e.g. star at access + partial mesh at core).
- **Pros:** each layer uses the right topology. **Cons:** more documentation and design discipline.
- **Scale:** high. **SPOF:** depends on the design of each layer.
- **When:** virtually every real medium/large network.
- **PT:** combine blocks; use notes/labels to separate layers.

## Hierarchical campus architectures

### Three-tier (core / distribution / access)
- **What it is:**
  - **Access:** user ports, VLANs, PoE, port-security, edge QoS.
  - **Distribution:** L2/L3 boundary, inter-VLAN routing, FHRP, ACLs/policies, access aggregation.
  - **Core:** fast transport between distribution blocks; no heavy policies.
- **Pros:** modular, fault isolation per block, scales to large campuses. **Cons:** more devices, cost and hops.
- **Scale:** high. **SPOF:** none if every layer is dual (2 core, 2 distribution per block, access with dual uplinks).
- **When:** multi-building campus, or when each building's distribution must interconnect without a full mesh.
- **PT:** 2960 at access, 3560/3650 at distribution and core; EtherChannel between layers; HSRP at distribution. See `references/switching.md`.

### Collapsed core (two-tier)
- **What it is:** core and distribution merged into a pair of L3 switches; access connected to both.
- **Pros:** lower cost, fewer hops, simpler. **Cons:** the central pair concentrates everything; limited scale.
- **Scale:** medium (one building or small campus). **SPOF:** the core if there is only one; none if it is a pair with FHRP/EtherChannel.
- **When:** SMBs, single site, most lab projects.
- **PT:** 2× 3560/3650 with HSRP and EtherChannel between them + 2960 at access with dual uplinks (STP will block one unless multichassis EtherChannel is used, not available in PT).

### Campus
- **What it is:** an organization's network across one or more nearby buildings, interconnected by its own fiber. Usually three-tier or collapsed core + an edge module (Internet/WAN) and a server module.
- **Pros/Cons:** inherited from the chosen architecture.
- **Scale:** high. **SPOF:** typically the edge (single ISP/firewall) if not duplicated.
- **When:** universities, hospitals, corporate sites.
- **PT:** one "cluster" or area per building; inter-building links over fiber (fiber modules on switches/routers).

## Data center: spine-leaf

- **What it is:** each leaf connects to **all** spines; no leaf-leaf or spine-spine links (except MLAG/vPC peer links). Any pair of servers is leaf→spine→leaf apart.
- **Pros:** predictable latency, ECMP with all spines active, horizontal scale (add leaf = more ports; add spine = more bandwidth). **Cons:** a lot of cabling, requires L3 + overlay (VXLAN/EVPN) to extend L2.
- **Scale:** very high (limited by spine ports). **SPOF:** none if each leaf has ≥2 spines and servers are dual-homed.
- **When:** high **east-west** traffic (virtualization, microservices, storage). Adds nothing in an office.
- **PT:** multilayer switches (3650) with routed links (`no switchport`) and OSPF to see ECMP. VXLAN/EVPN, MLAG/vPC: [HW].
- **Contrast:** the traditional DC uses three-tier (access/aggregation/core) optimized for north-south traffic.

## WAN topologies

| WAN | What it is | Pros | Cons | SPOF | When |
|---|---|---|---|---|---|
| Point-to-point | Dedicated link between 2 sites | Simple, predictable | Does not scale; cost per link | The link (without backup) | 2 sites |
| Hub-and-spoke | Branches connect only to HQ | Cheap, centralized policies | Spoke-spoke traffic goes through the hub; latency | The hub | Many branches with traffic toward HQ |
| Full mesh | All sites with each other | Redundancy, direct routes | n(n−1)/2 circuits/tunnels | None | Few critical sites with traffic among them |
| Partial mesh / dual-hub | Two hubs or selective extra links | Hub redundancy | More complexity | None if there is a dual hub | Production with many sites |

- **PT:** routers with serial links (HWIC-2T / NIM-2T module depending on model; `clock rate` on the DCE side) or Ethernet; GRE tunnels [PT?]; ISP simulated with a router or Cloud-PT. DMVPN, SD-WAN: [HW].
- **Production:** provider MPLS L3VPN, Internet + IPsec/DMVPN or SD-WAN; always with a backup link for critical sites.

## Network types by scope and context

| Type | Description | Typical SPOF | Base topology | PT |
|---|---|---|---|---|
| **LAN** | Local network of a site | Central switch | Star / tree / hierarchical | 2960 switches + PCs |
| **WLAN** | 802.11 wireless access; autonomous or lightweight APs + WLC | Single WLC, PoE switch of the APs | Star (APs hanging off access) | AccessPoint-PT (autonomous, SSID via GUI); WLC + LAP in recent versions [PT?] |
| **Data center** | Servers, storage, virtualization | Aggregation pair if there is no ECMP | Spine-leaf (modern) / three-tier (legacy) | Multilayer + servers |
| **SOHO** | Home or small office (≤ ~20 users, heuristic) | All-in-one router, single ISP | Star with wireless router | Home Router / WRT300N + PCs/laptops [PT?] |
| **Enterprise** | Campus + WAN + DC + edge (firewall, DMZ, dual ISP) | Edge if simple | Hierarchical hybrid | Blocks separated by area; ISP as Cloud/router |

WLAN notes: production uses controller- or cloud-managed APs, SSIDs mapped to VLANs, WLC HA [HW]; in a lab, one autonomous AP per VLAN is enough to demonstrate the concept.

## Recommendation matrix

User thresholds are **heuristics** for guidance, not standards.

| Scenario | Users | Sites | Redundancy | Budget | East-west | Growth | Recommendation |
|---|---|---|---|---|---|---|---|
| Home / micro office | < 20 | 1 | No | Low | None | Low | **SOHO** (star with all-in-one router) |
| SMB, 1 building | 20–200 | 1 | Optional | Low-medium | Low | Moderate | **Star/tree** with 1 L3 switch or router-on-a-stick |
| SMB with availability | 50–500 | 1 | Yes | Medium | Low | Moderate | Dual **collapsed core** (2× L3, HSRP, EtherChannel) |
| Multi-building campus | 500+ | 1 campus | Yes | Medium-high | Low-medium | High | **Three-tier** (dedicated core) |
| HQ + branches | Any | 3+ | Depends on criticality | Variable | Low | High | **WAN hub-and-spoke** (dual-hub in production) |
| Few critical sites | Any | 2–5 | High | High | High inter-site | Low | **WAN full mesh** or partial mesh |
| Two sites | Any | 2 | Depends on criticality | Low | — | Low | **Point-to-point** (+ VPN backup) |
| Data center / virtualization | — (servers) | 1 | High | High | **High** | High | **Spine-leaf** |
| Industrial / linear fiber | Variable | 1 | Yes, with few links | Medium | Low | Low | **Ring** (REP/ERPS in production; STP in lab) |
| Small critical core | — | — | Maximum | High | — | Low | **Full mesh** among 2–4 cores |

## Decision procedure

1. **Start simple:** SOHO → collapsed core → three-tier. Move up a level only when a requirement demands it.
2. More than one site? Add a WAN: 2 sites = P2P; 3+ = hub-and-spoke; mesh only if there is critical traffic between branches.
3. Is high availability required? Duplicate each layer (2 core/distribution, dual uplink, FHRP) before adding layers.
4. Are there several buildings whose distribution layers must interconnect? → three-tier with a dedicated core.
5. **Spine-leaf only for data center east-west traffic**; never for an office LAN.
6. Distinguish deliverables:
   - **Lab:** prioritize demonstrating concepts (VLANs, STP, FHRP, routing); minimum devices that PT supports.
   - **Production:** prioritize availability, operations and budget; validate [HW] features on real hardware.
7. Document the choice: requirements → topology → accepted residual SPOFs.

## How it maps to the model

The skill stores the topology in a JSON model (full specification in `references/model.md`). Relevant fields:

- `devices[].role` ∈ `{internet, edge, core, distribution, access, server, endpoint, wireless}`
- `layout.algorithm` ∈ `{"hierarchical", "circular", "manual"}`

| Topology | Roles used | `layout.algorithm` |
|---|---|---|
| SOHO | internet, edge, endpoint, wireless | hierarchical |
| Star / tree | edge, access, endpoint | hierarchical |
| Collapsed core | internet, edge, core, access, server, endpoint, wireless | hierarchical |
| Three-tier / campus | internet, edge, core, distribution, access, server, endpoint, wireless | hierarchical |
| Spine-leaf | core (spines), access (leafs), server | hierarchical (spines on top, leafs below) |
| Ring | core or distribution (ring nodes) + endpoint | circular |
| Full / partial mesh | core or edge | circular |
| WAN hub-and-spoke | edge (hub and spokes), internet | hierarchical (hub on top) or manual |
| WAN full mesh | edge, internet | circular |
| Bus | access (hub), endpoint | manual |
| Hybrid / enterprise | all that are needed | hierarchical; `manual` if positions must be fixed |

Rules:
- Assign the `role` by **function**, not by device model (a 3650 can be `core` or `distribution`).
- Spine-leaf has no roles of its own: map spine → `core` and leaf → `access` (or `distribution` if the leafs do L3 for access switches).
- Use `circular` when there is no hierarchy (ring, mesh); `hierarchical` orders by layers internet → edge → core → distribution → access → endpoint.
