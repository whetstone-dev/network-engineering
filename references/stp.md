# Spanning Tree Protocol (STP, PVST+, RSTP, MST)

## Contents
- [STP variants](#stp-variants)
- [Bridge ID and root election](#bridge-id-and-root-election)
- [Port costs](#port-costs)
- [Port roles and states](#port-roles-and-states)
- [Timers and convergence](#timers-and-convergence)
- [Election process step by step](#election-process-step-by-step)
- [Worked example: 3 switches](#worked-example-3-switches)
- [Configuration commands](#configuration-commands)
- [Verification and reading the output](#verification-and-reading-the-output)
- [Common problems](#common-problems)
- [Recommended design](#recommended-design)
- [Simulation with the toolkit](#simulation-with-the-toolkit)

Tags: `[PT]` Packet Tracer, `[IOS]` IOS 15.x, `[XE]` IOS XE, `[HW]` real hardware only, `[PT?]` not confirmed in PT.

## STP variants

| Protocol | Standard | Instances | Convergence | Notes |
|---|---|---|---|---|
| STP | IEEE 802.1D | 1 for all VLANs (CST) | 30–50 s | Original |
| PVST+ | Cisco | 1 per VLAN | 30–50 s | Default on many Cisco switches (2960 in PT) |
| RSTP | IEEE 802.1w (now in 802.1D-2004) | 1 | ~seconds or less | Proposal/agreement, edge ports |
| Rapid PVST+ | Cisco | 1 per VLAN | Fast | Recommended in Cisco environments |
| MST | IEEE 802.1s (now in 802.1Q) | Instances that group VLANs | Fast (RSTP-based) | Scales better with many VLANs; requires the same region (name, revision, VLAN→instance mapping) |

- Per-VLAN PVST+/Rapid PVST+ allows load balancing: a different root per group of VLANs.
- MST: `spanning-tree mode mst` + `spanning-tree mst configuration` (`name`, `revision`, `instance 1 vlan 10,20`) [IOS][XE][PT?]. Beyond typical CCNA scope; verify support in your PT version.

## Bridge ID and root election

Bridge ID (8 bytes) = **priority (4 bits) + extended system ID (12 bits = VLAN ID) + MAC (6 bytes)**.

- Configurable priority 0–61440 in **multiples of 4096**. Default 32768.
- What IOS displays = priority + VLAN. E.g.: VLAN 1 → 32769; VLAN 10 with priority 24576 → 24586.
- Root bridge = **lowest BID** (priority first; on a tie, lowest MAC).
- With everything at defaults, the switch with the lowest MAC wins, which is usually the oldest: almost never the desired one.

## Port costs

| Speed | Short cost (802.1D-1998, default on classic IOS) | Long cost (802.1t / `pathcost method long`) |
|---|---|---|
| 10 Mbps | 100 | 2,000,000 |
| 100 Mbps | 19 | 200,000 |
| 1 Gbps | 4 | 20,000 |
| 10 Gbps | 2 | 2,000 |

- Change method: `spanning-tree pathcost method long` [IOS][XE][PT?]; must be the same on all switches.
- Some recent IOS XE platforms use the long method by default: check with `show spanning-tree summary` ("Pathcost method used").
- Manual cost per interface: `spanning-tree cost 10` or `spanning-tree vlan 10 cost 10`.
- Root path cost = sum of the costs of the INGRESS ports (towards the root) along the path.

## Port roles and states

| Role | Description |
|---|---|
| Root port (RP) | On each non-root switch, the port with the best path to the root. One per switch (per VLAN) |
| Designated port (DP) | On each segment, the port that forwards onto that segment. All ports on the root are DPs |
| Alternate (RSTP) | Alternate path to the root, blocked; quickly replaces the RP |
| Backup (RSTP) | Backup for a DP on the same shared segment (hub); rare today |
| Non-designated (802.1D) | Classic term for a blocked port |

| 802.1D | RSTP | Learns MACs | Forwards frames |
|---|---|---|---|
| Disabled | Discarding | No | No |
| Blocking | Discarding | No | No |
| Listening | Discarding | No | No |
| Learning | Learning | Yes | No |
| Forwarding | Forwarding | Yes | Yes |

- In `show spanning-tree` with Rapid PVST+, the discarding state appears as `BLK`.

## Timers and convergence

| Timer | Default | Use |
|---|---|---|
| Hello | 2 s | Interval at which the root sends BPDUs |
| Forward delay | 15 s | Time in listening and in learning (802.1D) |
| Max age | 20 s | How long a BPDU is kept before being discarded (802.1D) |

- 802.1D: new port → listening 15 s + learning 15 s = 30 s; indirect failure: max age 20 + 30 = 50 s.
- RSTP: neighbor lost after 3 missed hellos (6 s); full-duplex point-to-point links converge via proposal/agreement without waiting for timers; edge ports (PortFast) go straight to forwarding.
- Timers are taken from the root; changing them (`spanning-tree vlan 10 hello-time`, `forward-time`, `max-age`) is not recommended without a justified design.

## Election process step by step

1. **Root bridge**: lowest BID in the whole topology (per VLAN in PVST+).
2. **Root port** on each non-root switch, tie-breakers in order:
   1. Lowest root path cost.
   2. Lowest BID of the neighbor sending the BPDU.
   3. Lowest port ID of the neighbor (port priority, default 128, + port number).
   4. (If applicable) lowest local port ID.
3. **Designated port** on each segment: the port of the switch with the lowest root path cost; tie → lowest BID; tie → lowest port ID.
4. Remaining ports → **alternate/blocking**.

Port priority: `spanning-tree port-priority 64` (interface), values 0–240 in multiples of 16; it affects the NEIGHBOR's election.

## Worked example: 3 switches

Triangle topology, all links 1 Gbps (cost 4), default priorities (32769 in VLAN 1):

| Switch | MAC | BID |
|---|---|---|
| SW1 | 000A.0000.0001 | 32769.000A.0000.0001 |
| SW2 | 000A.0000.0002 | 32769.000A.0000.0002 |
| SW3 | 000A.0000.0003 | 32769.000A.0000.0003 |

Links: SW1 Gi0/1 – SW2 Gi0/1; SW1 Gi0/2 – SW3 Gi0/1; SW2 Gi0/2 – SW3 Gi0/2.

1. Root: priority tie → lowest MAC → **SW1**. SW1 Gi0/1 and Gi0/2 = DP.
2. SW2 root port: direct via Gi0/1 = 4; via SW3 = 8 → **Gi0/1 RP**. SW3: Gi0/1 = 4 → **Gi0/1 RP**.
3. SW2–SW3 segment: both with root path cost 4 → tie → lowest BID = SW2 → **SW2 Gi0/2 DP**.
4. **SW3 Gi0/2 = alternate (BLK)**. Loop eliminated.

To make SW2 the root: `SW2(config)# spanning-tree vlan 1 root primary` (or `priority 24576`).

## Configuration commands

| Command | Mode | Effect | Support |
|---|---|---|---|
| `spanning-tree mode rapid-pvst` | global | Enables Rapid PVST+ | [PT][IOS][XE] |
| `spanning-tree mode pvst` | global | PVST+ | [PT][IOS][XE] |
| `spanning-tree vlan 10 root primary` | global | Macro: priority 24576, or lower than the current root if it is already ≤ 24576 | [PT][IOS][XE] |
| `spanning-tree vlan 10 root secondary` | global | Macro: priority 28672 | [PT][IOS][XE] |
| `spanning-tree vlan 10 priority 4096` | global | Explicit priority (multiple of 4096) | [PT][IOS][XE] |
| `spanning-tree portfast` | interface | Access port goes straight to forwarding | [PT][IOS][XE] |
| `spanning-tree portfast default` | global | PortFast on all access ports | [IOS][PT?] |
| `spanning-tree bpduguard enable` | interface | err-disable if a BPDU arrives | [PT][IOS][XE] |
| `spanning-tree portfast bpduguard default` | global | BPDU guard on all PortFast ports | [IOS][PT?] |
| `spanning-tree guard root` | interface | Root guard: blocks (root-inconsistent) if a superior BPDU arrives | [IOS][XE][PT?] |
| `spanning-tree guard loop` | interface | Loop guard: prevents an alternate/root port from moving to forwarding if it stops receiving BPDUs | [IOS][XE][PT?] |
| `spanning-tree loopguard default` | global | Global loop guard | [IOS][XE][PT?] |
| `errdisable recovery cause bpduguard` | global | Automatic recovery | [IOS][XE][PT?] |

- On IOS 15.2+ and IOS XE the syntax may be `spanning-tree portfast edge`, `spanning-tree portfast edge default` and `spanning-tree portfast edge bpduguard default`; verify on your version.
- `root primary` is a one-time calculation: if a switch with a lower priority appears later, it is not readjusted. In production prefer an explicit `priority`.
- `spanning-tree portfast trunk` (or `portfast edge trunk`) only for trunks to servers/hypervisors, never to switches.

Access port template (lab and production):
```
SW1(config)# interface range fa0/1 - 24
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# spanning-tree portfast
SW1(config-if-range)# spanning-tree bpduguard enable
```

## Verification and reading the output

| Command | Use | Support |
|---|---|---|
| `show spanning-tree` | All VLANs | [PT][IOS][XE] |
| `show spanning-tree vlan 10` | One VLAN | [PT][IOS][XE] |
| `show spanning-tree summary` | Mode, PortFast/BPDU guard default, pathcost method, count per state | [PT][IOS][XE] |
| `show spanning-tree interface gi0/1 [detail]` | Port across all VLANs | [IOS][XE][PT?] |
| `show spanning-tree root` | Root of each VLAN | [IOS][XE][PT?] |

Example (approximate format; varies by version):
```
VLAN0010
  Spanning tree enabled protocol rstp
  Root ID    Priority    24586
             Address     000A.0000.0001
             Cost        4
             Port        25 (GigabitEthernet0/1)
  Bridge ID  Priority    32778  (priority 32768 sys-id-ext 10)
             Address     000A.0000.0003
Interface        Role Sts Cost      Prio.Nbr Type
---------------- ---- --- --------- -------- ------------------
Fa0/1            Desg FWD 19        128.1    P2p Edge
Gi0/1            Root FWD 4         128.25   P2p
Gi0/2            Altn BLK 4         128.26   P2p
```
How to read it:
- `protocol rstp` = Rapid PVST+; `ieee` = PVST+.
- "This bridge is the root" under Root ID → this switch is the root. Otherwise, `Cost` and `Port` show the root path cost and the root port.
- Root ID vs Bridge ID: if they are equal, it is the root.
- Role: `Root`, `Desg`, `Altn`, `Back`. Sts: `FWD`, `BLK`, `LRN`, `LIS`.
- Type: `P2p` (full duplex), `Shr` (half duplex/shared), `Edge` (PortFast active). `*ROOT_Inc`, `*BKN*` or `*TYPE_Inc` indicate inconsistencies (root guard, etc.).

## Common problems

| Problem | Symptom | Cause / fix |
|---|---|---|
| Unwanted root | Traffic takes suboptimal paths; `show spanning-tree` shows an access switch as root | Default priorities. Set `priority` on core/distribution; root guard on downlinks |
| L2 loop / broadcast storm | High CPU, MAC flapping (`%SW_MATM-4-MACFLAP_NOTIF`), saturated LEDs | STP disabled, misconfigured `channel-group mode on`, unidirectional link. Review, use loop guard/UDLD [HW] |
| PortFast on a switch-to-switch link | Transient loops on reconnect | Remove PortFast from uplinks; BPDU guard would detect it |
| Port err-disabled by BPDU guard | `%SPANTREE-2-BLOCK_BPDUGUARD`, port `err-disabled` | Someone connected a switch to an access port. Remove the device, `shutdown`/`no shutdown` |
| Different mode across switches | Slow convergence on some segments | Match `spanning-tree mode`; RSTP interoperates with 802.1D but falls back to classic timers on that link |
| VLAN without the expected root in PVST+ | One VLAN behaves differently from another | Root is configured per VLAN: check each `spanning-tree vlan X` |

## Recommended design

- **Production**: Rapid PVST+ (or MST with many VLANs). Primary root on core/distribution (`priority 4096` or `24576`), secondary on the redundant peer (`28672` or one step above).
- Align the STP root with the active gateway (HSRP/VRRP active) per VLAN to avoid traffic crossing the inter-distribution link. Load balancing: even VLANs root/HSRP active on DSW1, odd ones on DSW2.
- Access ports: PortFast + BPDU guard. Distribution downlinks to access: root guard.
- Do not disable STP even if the topology "has no loops".
- **Lab (PT)**: explicitly set root primary/secondary for predictable results; document which port ends up blocked and verify it with `show spanning-tree vlan X`.
- See general troubleshooting in `references/troubleshooting.md` and IOS syntax in `references/cisco-ios.md`.

## Simulation with the toolkit

`netlab validate` computes STP per VLAN and per connected L2 domain: root bridge (priority + extended system ID + MAC), cost to the root (short method: 10M=100, 100M=19, 1G=4, 10G=2; EtherChannel by aggregate bandwidth, e.g. 2×100M=12), root port and designated/alternate ports. Diagnostics: `STP-ROOT`, `STP-BLOCKED` (alternate ports), `STP-ROOT-UNDESIRED` (root on an access switch when core/distribution exists), `STP-TIE-MAC` (priority tie with loops: without `mac` in the model the tie is broken by id, with a warning), `STP-HSRP-MISALIGNED`.

Approximations: `root primary` is modeled as 24576 and `root secondary` as 28672 (IOS may go lower if another switch already has a lower priority); timers, BPDU guard/root guard and per-instance MST are not simulated. In the diagram, blocked ports are shown in amber (filter by VLAN to see those of a single VLAN).
