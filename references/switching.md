# Switching: VLANs, trunks, inter-VLAN, port security, EtherChannel

## Contents
- [VLAN ranges](#vlan-ranges)
- [Creating VLANs and access ports](#creating-vlans-and-access-ports)
- [802.1Q trunks](#8021q-trunks)
- [DTP](#dtp)
- [Native VLAN](#native-vlan)
- [Management VLAN and SVI on an L2 switch](#management-vlan-and-svi-on-an-l2-switch)
- [Inter-VLAN routing](#inter-vlan-routing)
- [Port security](#port-security)
- [EtherChannel](#etherchannel)
- [CDP, LLDP and MAC table](#cdp-lldp-and-mac-table)
- [Unused ports](#unused-ports)
- [Verification commands](#verification-commands)
- [Inconsistencies to detect](#inconsistencies-to-detect)

Tag convention: `[PT]` Packet Tracer, `[IOS]` classic IOS 15.x, `[XE]` IOS XE, `[HW]` real hardware only, `[PT?]` PT support unconfirmed.
Example addressing: VLAN 10 = 192.0.2.0/24, VLAN 20 = 198.51.100.0/24, VLAN 99 (management) = 203.0.113.0/25, routed link = 203.0.113.252/30.

## VLAN ranges

| Range | Type | Notes |
|---|---|---|
| 0, 4095 | Reserved | Not usable |
| 1 | Default | Cannot be deleted or renamed; all ports start here |
| 2–1001 | Normal range | Stored in `vlan.dat` (flash), can be propagated by VTP v1/v2 |
| 1002–1005 | Reserved | Legacy FDDI/Token Ring; cannot be deleted |
| 1006–4094 | Extended range | With VTP v1/v2 they require `vtp mode transparent` (or `off`); stored in running-config. VTP v3 does propagate them |

- `vlan.dat` is NOT erased by `erase startup-config`; for a full lab reset: `delete flash:vlan.dat` + `erase startup-config` + `reload`.

## Creating VLANs and access ports

```
SW1(config)# vlan 10
SW1(config-vlan)# name SALES
SW1(config-vlan)# vlan 20
SW1(config-vlan)# name ACCOUNTING
SW1(config-vlan)# exit
SW1(config)# interface range FastEthernet0/1 - 10
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# switchport access vlan 10
```

- `interface range` [PT][IOS][XE]: takes a space on both sides of the hyphen; ranges can be combined with a comma: `interface range fa0/1 - 10 , gi0/1 - 2`.
- If `switchport access vlan 30` is assigned and VLAN 30 does not exist, IOS normally creates it automatically (message "% Access VLAN does not exist. Creating vlan 30"); do not rely on this: create and name it explicitly.
- `switchport mode access` fixes the mode and disables trunk negotiation (DTP still does not form a trunk).

### Voice VLAN
```
SW1(config-if)# switchport mode access
SW1(config-if)# switchport access vlan 10
SW1(config-if)# switchport voice vlan 150
SW1(config-if)# mls qos trust device cisco-phone   ! [IOS] [PT?] depends on the model
```
- The port is still an access port: PC data untagged (VLAN 10), voice tagged 802.1Q (VLAN 150). CDP/LLDP-MED tells the phone the voice VLAN.
- `show interfaces fa0/5 switchport` shows "Voice VLAN: 150".

## 802.1Q trunks

```
SW1(config)# interface GigabitEthernet0/1
SW1(config-if)# switchport trunk encapsulation dot1q   ! only where applicable (see table)
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk native vlan 999
SW1(config-if)# switchport trunk allowed vlan 10,20,99
SW1(config-if)# switchport nonegotiate
```

| Platform | `switchport trunk encapsulation dot1q` |
|---|---|
| 2960 / 2960-x | Does not exist (802.1Q only) |
| 3560 / 3750 (support ISL) | Required BEFORE `switchport mode trunk`; otherwise: error "trunk encapsulation is Auto" |
| 3650 / 3850 / Cat9k (IOS XE) | Usually does not exist (dot1q only); verify on the IOS XE/PT version |

### Allowed VLAN list (common pitfall)
| Command | Effect |
|---|---|
| `switchport trunk allowed vlan 10,20` | REPLACES the whole list with 10,20 |
| `switchport trunk allowed vlan add 30` | Adds 30 to the current list |
| `switchport trunk allowed vlan remove 20` | Removes 20 |
| `switchport trunk allowed vlan except 1` | All except 1 |
| `switchport trunk allowed vlan all` / `none` | All / none |

> In production, forgetting `add` on a trunk that is already up cuts off every VLAN not listed. Always check with `show interfaces trunk` before and after.

## DTP

Modes: `access`, `trunk`, `dynamic auto` (waits), `dynamic desirable` (initiates negotiation). Default on 2960: `dynamic auto` (verify per model/version; some older models used `desirable`).

| Side A \ Side B | dynamic auto | dynamic desirable | trunk | access |
|---|---|---|---|---|
| **dynamic auto** | access | trunk | trunk | access |
| **dynamic desirable** | trunk | trunk | trunk | access |
| **trunk** | trunk | trunk | trunk | limited connectivity (mismatch) |
| **access** | access | access | mismatch | access |

- Recommendation (lab and production): static mode on all ports (`access` or `trunk`) and `switchport nonegotiate` on trunks toward devices that do not speak DTP or to eliminate DTP. `nonegotiate` is not accepted in `dynamic` modes.
- Check the operational mode: `show interfaces gi0/1 switchport` (Administrative Mode vs Operational Mode, Negotiation of Trunking).

## Native VLAN

- Native VLAN traffic crosses the trunk UNTAGGED. Default: VLAN 1.
- Mismatch: CDP reports it with `%CDP-4-NATIVE_VLAN_MISMATCH` on both switches; untagged traffic lands in a different VLAN on each side (leak between VLANs, STP problems).
- Security risk: VLAN hopping via double-tagging when the native VLAN matches an attacker's VLAN on an access port.
- Best practices: dedicated native VLAN with NO ports or hosts (e.g. 999), the same on both ends; do not use VLAN 1 for users or management. Optional `[IOS][PT?]`: `vlan dot1q tag native` (global) to tag the native VLAN too.

## Management VLAN and SVI on an L2 switch

```
SW1(config)# vlan 99
SW1(config-vlan)# name MGMT
SW1(config)# interface vlan 99
SW1(config-if)# ip address 203.0.113.11 255.255.255.128
SW1(config-if)# no shutdown
SW1(config)# ip default-gateway 203.0.113.1
```
- On an L2 switch (no `ip routing`) use `ip default-gateway`, not static routes.
- An SVI goes up/up only if: the VLAN exists, the SVI is not shut down, and there is at least one active port in that VLAN (access, or a trunk carrying it in forwarding state).
- Remote access (SSH, VTY): see `references/cisco-ios.md`.

## Inter-VLAN routing

### 1. Legacy (one physical port per VLAN)
Each VLAN uses a switch access port connected to a different physical router interface, with the gateway IP. Does not scale; teaching only.

### 2. Router-on-a-stick [PT][IOS][XE]
```
R1(config)# interface GigabitEthernet0/0
R1(config-if)# no shutdown                       ! physical, no IP
R1(config)# interface GigabitEthernet0/0.10
R1(config-subif)# encapsulation dot1Q 10
R1(config-subif)# ip address 192.0.2.1 255.255.255.0
R1(config)# interface GigabitEthernet0/0.20
R1(config-subif)# encapsulation dot1Q 20
R1(config-subif)# ip address 198.51.100.1 255.255.255.0
R1(config)# interface GigabitEthernet0/0.99
R1(config-subif)# encapsulation dot1Q 99 native   ! only if 99 is the trunk's native VLAN
R1(config-subif)# ip address 203.0.113.1 255.255.255.128
```
- The switch port facing the router must be `switchport mode trunk` with the VLANs allowed.
- `encapsulation dot1Q` must come BEFORE `ip address` on the subinterface.
- If the switch's native VLAN is not the router's, use `native` on the corresponding subinterface or leave the native VLAN without a subinterface.

### 3. SVI on a multilayer switch [PT: 3560/3650][IOS][XE]
```
DSW1(config)# ip routing
DSW1(config)# interface vlan 10
DSW1(config-if)# ip address 192.0.2.1 255.255.255.0
DSW1(config-if)# no shutdown
DSW1(config)# interface vlan 20
DSW1(config-if)# ip address 198.51.100.1 255.255.255.0
DSW1(config-if)# no shutdown
DSW1(config)# interface GigabitEthernet0/1
DSW1(config-if)# no switchport                    ! routed port toward router/ISP
DSW1(config-if)# ip address 203.0.113.253 255.255.255.252
```
- Without `ip routing` the SVIs exist but the switch does NOT route between them.
- 2960 in PT: do not use it for routing. On real hardware, some 2960s with IOS 15 support static routing with `sdm prefer lanbase-routing` + reload [HW]; verify the model.
- The routed port uses its own segment (/30), separate from the user VLANs.

| Criterion | Legacy | Router-on-a-stick | SVI on multilayer |
|---|---|---|---|
| Ports | 1 per VLAN | 1 trunk | Internal (backplane) |
| Scalability | Very low | Medium (bottleneck on one link) | High |
| Performance | Good per VLAN | Limited by one link | Hardware (ASIC), the best |
| Cost | Many router ports | Low | Requires an L3 switch |
| Typical use | Teaching | Labs, small branches | Campus / production |

## Port security

Requirement: port in static mode (`switchport mode access`; in dynamic mode it returns "is a dynamic port"). Some platforms also allow trunks.

```
SW1(config-if)# switchport mode access
SW1(config-if)# switchport port-security
SW1(config-if)# switchport port-security maximum 2
SW1(config-if)# switchport port-security mac-address sticky
SW1(config-if)# switchport port-security violation restrict
```
- Defaults: maximum 1, violation shutdown, no sticky.
- `sticky` learns dynamic MACs and writes them to running-config; you must run `copy running-config startup-config` to keep them.

| Violation mode | Drops traffic | Syslog/SNMP | Increments counter | Port |
|---|---|---|---|---|
| `protect` | Yes | No | No | Stays up |
| `restrict` | Yes | Yes | Yes | Stays up |
| `shutdown` (default) | Yes | Yes | Yes | err-disabled |

Recovery from err-disabled:
```
SW1(config)# interface fa0/5
SW1(config-if)# shutdown
SW1(config-if)# no shutdown
! Automatic [IOS][XE][PT?]:
SW1(config)# errdisable recovery cause psecure-violation
SW1(config)# errdisable recovery interval 300
```
Verification: `show port-security`, `show port-security interface fa0/5` (Port Status: Secure-shutdown, Violation Count, Last Source Address), `show port-security address`, `show interfaces status err-disabled`.

## EtherChannel

| Side A \ Side B | on | active (LACP) | passive (LACP) | desirable (PAgP) | auto (PAgP) |
|---|---|---|---|---|---|
| **on** | Yes | No | No | No | No |
| **active** | No | Yes | Yes | No | No |
| **passive** | No | Yes | **No** | No | No |
| **desirable** | No | No | No | Yes | Yes |
| **auto** | No | No | No | Yes | **No** |

- LACP = IEEE 802.3ad/802.1AX (standard, multivendor); PAgP = Cisco proprietary; `on` = no protocol (loop risk if one side is not configured).
- Up to 8 active links per channel (LACP also allows up to 8 in standby; verify per platform).
- Consistency required across all members: speed, duplex, mode (access/trunk), access VLAN or native/allowed VLANs, L2/L3 type. If they differ, the ports are suspended (`s`).

```
SW1(config)# interface range GigabitEthernet0/1 - 2
SW1(config-if-range)# channel-group 1 mode active
SW1(config)# interface port-channel 1
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk allowed vlan 10,20,99
SW1(config)# port-channel load-balance src-dst-ip   ! global; options depend on platform
```
- Make subsequent L2 changes on `interface port-channel 1`: they are inherited by the members.
- Check load balancing: `show etherchannel load-balance`.

Reading `show etherchannel summary`:
```
Group  Port-channel  Protocol    Ports
------+-------------+-----------+----------------------------
1      Po1(SU)         LACP      Gi0/1(P)    Gi0/2(P)
```
| Flag | Meaning |
|---|---|
| `S` / `R` | Layer 2 / Layer 3 port-channel |
| `U` | Port-channel in use (OK). `SU` = L2 operational, `RU` = L3 operational |
| `D` | Down. `SD` = L2 channel down |
| `P` | Bundled member — correct |
| `I` | Stand-alone (not negotiating, e.g. other side has no channel) |
| `s` | Suspended (configuration inconsistency) |
| `H` | Hot-standby (LACP) |

## CDP, LLDP and MAC table

| Action | Command | Support |
|---|---|---|
| CDP global on/off | `cdp run` / `no cdp run` | [PT][IOS][XE] |
| CDP per interface | `no cdp enable` | [PT][IOS][XE] |
| CDP neighbors | `show cdp neighbors [detail]` | [PT][IOS][XE] |
| LLDP global | `lldp run` (disabled by default in IOS) | [IOS][XE][PT?] |
| LLDP per interface | `lldp transmit` / `lldp receive` | [IOS][XE][PT?] |
| LLDP neighbors | `show lldp neighbors [detail]` | [IOS][XE][PT?] |

- Production: disable CDP/LLDP on ports facing users/Internet (information leak); keep it on infrastructure links.

MAC table:
- `show mac address-table` [PT][IOS][XE] (very old IOS: `show mac-address-table`).
- Filters: `show mac address-table dynamic`, `... interface fa0/1`, `... vlan 10`, `... address 0011.2233.4455`.
- `clear mac address-table dynamic`; default aging 300 s.
- Several MACs on an access port = probably a hub/unmanaged switch or an IP phone + PC.

## Unused ports

```
SW1(config)# vlan 666
SW1(config-vlan)# name BLACKHOLE
SW1(config)# interface range fa0/11 - 24
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# switchport access vlan 666
SW1(config-if-range)# shutdown
```
- Blackhole VLAN: no SVI, no routing, and not allowed on any trunk.

## Verification commands

| Command | What to check |
|---|---|
| `show vlan brief` | Existing VLANs, names, assigned access ports (trunks do NOT appear) |
| `show interfaces trunk` | Trunk ports, mode, encapsulation, native VLAN, allowed, "active and not pruned" |
| `show interfaces fa0/1 switchport` | Administrative/operational mode, access VLAN, native, voice VLAN, negotiation |
| `show interfaces status` | Status (connected/notconnect/err-disabled), VLAN or "trunk", duplex, speed |
| `show etherchannel summary` | Channel flags and members |
| `show port-security interface fa0/1` | Status and violations |
| `show cdp neighbors` | Actual vs expected physical topology |

## Inconsistencies to detect

| Symptom / finding | Probable cause | How to confirm / fix |
|---|---|---|
| One end trunk and the other access | Different static mode or DTP | `show interfaces switchport` on both; set both to `trunk` |
| `%CDP-4-NATIVE_VLAN_MISMATCH` | Different native VLAN on each side | `show interfaces trunk`; match `native vlan` |
| Hosts in a VLAN cannot see each other across switches | VLAN not in allowed list, or list replaced without `add` | `show interfaces trunk` (allowed / active column) |
| Access port "inactive" or VLAN missing on another switch | VLAN not created on that switch | `show vlan brief`; create the VLAN |
| Host has no connectivity to its gateway | Port in the wrong VLAN | `show vlan brief` / `show mac address-table interface` |
| SVI down/down | VLAN with no active ports, or not created | `show ip interface brief`, `show vlan brief` |
| Port-channel `SD` or members `s`/`I` | Incompatible modes or inconsistent parameters | `show etherchannel summary`, compare member config |
| Port `err-disabled` | Port security (psecure-violation) or BPDU guard | `show interfaces status err-disabled`, `show port-security interface` |
| Inter-VLAN does not work on multilayer | Missing `ip routing` | `show running-config | include ip routing` |
| Router-on-a-stick not responding | Physical interface shut down, wrong VLAN ID in `encapsulation`, or switch port not a trunk | `show ip interface brief`, `show interfaces trunk` |

General layer-by-layer diagnosis: see `references/troubleshooting.md`.
