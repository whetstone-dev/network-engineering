# Cisco Packet Tracer — specialized module

## Contents
- [Workflow to build a lab from scratch](#workflow-to-build-a-lab-from-scratch)
- [Recommended devices](#recommended-devices)
- [Cabling](#cabling)
- [Modules and hardware](#modules-and-hardware)
- [GUI configuration (end devices and servers)](#gui-configuration-end-devices-and-servers)
- [Pasting configurations into the CLI](#pasting-configurations-into-the-cli)
- [Simulation mode and tests](#simulation-mode-and-tests)
- [What is and is not supported](#what-is-and-is-not-supported)
- [Typical PT-specific problems](#typical-pt-specific-problems)
- [Standard PT lab deliverable](#standard-pt-lab-deliverable)

## Workflow to build a lab from scratch

1. Requirements → `*.net.json` model with `meta.target: "packet-tracer"` and PT models (`2911`, `2960-24TT`, `PC-PT`…).
2. `node scripts/netlab.ts validate lab.net.json` until the quality gate passes, including all declared tests.
3. `node scripts/netlab.ts build lab.net.json` → `topology.html`, `README.md`, `configs/*.txt`.
4. In PT: place devices with the **same hostname** as the model, cable them according to the connection table (exact port), install modules if serial ports or a power supply are needed.
5. Review each candidate config and replace `<SECRET>`/`<COMMUNITY>` with lab credentials locally, or explicitly generate restricted lab configs with `--include-secrets`. Paste one device's commands at a time and configure end devices via the GUI. These artifacts do not create a native `.pkt`; assemble and save the lab in Packet Tracer.
6. Wait for convergence (orange lights → green; STP takes ~30 s with PVST, less with Rapid PVST). The **Fast Forward Time** button speeds it up.
7. Run the model's tests (`ping` from Desktop > Command Prompt) and the verification commands.

## Recommended devices

| Role | PT model | Notes |
|---|---|---|
| CCNA lab router | **2911** (`Gi0/0-2`) | IOS 15; securityk9 license for VPN/ZBF |
| IOS XE router | **ISR4331** (`Gi0/0/0-2`) | XE interface syntax |
| Access switch | **2960-24TT** | Pure L2; no `trunk encapsulation`; one management SVI |
| Multilayer switch | **3560-24PS** (IOS) or **3650-24PS** (XE) | The 3650 ships **without a power supply**: drag in `AC-POWER-SUPPLY` |
| Firewall | ASA 5506-X / 5505 | Generator uses ASA 8.3+ syntax; verify commands against the PT device/image |
| PC / Laptop / Server | PC-PT, Laptop-PT, Server-PT | IP via GUI; servers with services via GUI |
| Wi-Fi | AccessPoint-PT, WRT300N / HomeRouter, WLC + LAP `[PT?]` | See `references/wireless.md` |
| WAN/ISP | 2911 router as ISP, Cloud-PT | Loopback to simulate Internet hosts (8.8.8.8/32) |

Avoid the generic `Router-PT`/`Switch-PT` unless requested: they do not exist as real hardware.

## Cabling

| Connection | PT cable | Note |
|---|---|---|
| PC/router/server ↔ switch | Copper Straight-Through | Unlike devices |
| switch ↔ switch, router ↔ router, PC ↔ router, PC ↔ PC | Copper Cross-Over | Like devices (DTE-DTE or DCE-DCE) |
| Router ↔ router serial | Serial DCE / DTE | The DCE end sets `clock rate` |
| Console | Console (RS-232 → Console port) | PC: Desktop > Terminal |
| Fiber | Fiber | Requires SFP/fiber ports |
| Automatic | "Automatically Choose Connection Type" (lightning bolt) | Handy, but on serial links it picks the DCE end on its own; document the actual port |

Many real devices have Auto-MDIX (cable type does not matter); the validator reports it as a note, not an error.

## Modules and hardware

- **Power off** the device (switch on the Physical tab) before inserting or removing modules; power it back on.
- Serial: HWIC-2T (1941/2901/2911) → `Serial0/0/0`, `Serial0/0/1` in slot 0.
- ISR4331: NIM-2T → `Serial0/1/0-1`.
- 3650-24PS: `AC-POWER-SUPPLY` in the power slot; the `Gi1/1/1-4` uplinks belong to the network module.
- Laptop Wi-Fi: remove the Ethernet module and insert `WPC300N` → `Wireless0` appears.

## GUI configuration (end devices and servers)

- PC/Laptop: **Desktop > IP Configuration** (Static or DHCP; IPv6 Automatic/Static) — `ipconfig`, `ipconfig /renew`, `ping`, `tracert` in **Desktop > Command Prompt**.
- Server-PT, **Services** tab: DHCP (one pool per network: Pool Name, Default Gateway, DNS Server, Start IP Address, Subnet Mask, Maximum Number of Users), DNS (A/CNAME records, Service On), HTTP/HTTPS, FTP, TFTP, EMAIL, NTP, SYSLOG, AAA.
- A DHCP server on another subnet requires `ip helper-address <server IP>` on the clients' gateway.
- The generator (`netlab config`) produces these instructions for every host/server in the model.

## Pasting configurations into the CLI

- Paste from user EXEC (`R1>`): the generated blocks start with `enable` / `configure terminal`.
- If the device already has `enable secret`, `enable` will prompt for a password and the paste gets out of sync: type `enable` and the password by hand and paste from `configure terminal`.
- `crypto key generate rsa general-keys modulus 1024`: some PT versions still ask for the size; answer `1024`.
- Generated candidates omit saving. After observed checks pass, save separately with `write memory` or `copy running-config startup-config`, following the device's prompts.
- Paste one device at a time, not everything at once; check that no `% Invalid input` appears.

## Simulation mode and tests

- **Realtime** (default) vs **Simulation** (bottom-right bar): in simulation PDUs are shown step by step, filterable by protocol (ICMP, ARP, DHCP, OSPF, STP…). Ideal for teaching ARP, DHCP DORA and 802.1Q encapsulation.
- **Add Simple PDU** (envelope) = quick ping between two devices; the bottom table shows Successful/Failed.
- The first ping may drop packets due to ARP: repeat before concluding it fails.
- **Activity Wizard** lets you build gradable activities (instructor) `[PT]`.
- The model's `trace` (`netlab trace`) predicts the expected result; if PT differs, the model and the PT build do not match: compare with real `show` output.

## What is and is not supported

| Generally supported `[PT]` | Limited or variable `[PT?]` | Not supported `[HW]` |
|---|---|---|
| VLAN, trunk, DTP, VTP, STP/RSTP, EtherChannel (LACP/PAgP), port-security | `show ... \| section/include` | Full SNMPv3, NetFlow, EEM, Python/guestshell |
| Static, RIPv2, single/multi-area OSPFv2, EIGRP, basic BGP | Per-interface OSPF (`ip ospf 1 area 0`), complex redistribution | MPLS, advanced QoS (full MQC), full VRF-lite |
| DHCP (router and Server-PT), relay, NAT/PAT, std/ext/named ACLs | ZBF, IPsec (requires securityk9 license), GRE | Type 9 encryption (scrypt), full AAA/RADIUS on all devices |
| SSH v2, NTP, Syslog, CDP, basic LLDP | Advanced IPv6 (stateful DHCPv6 on all models) | Automation (NETCONF/RESTCONF) |
| HSRP `[PT]` on 2911/3560 | DHCP snooping/DAI | |

When in doubt: mark it `[PT?]` and suggest verifying with `?` in the CLI of the specific device.

## Typical PT-specific problems

| Symptom | Cause |
|---|---|
| Orange lights for ~30 s on switch ports | STP in listening/learning (normal); use PortFast on hosts |
| Red light on a link | Wrong cable, interface `shutdown` (routers ship shut down) or device powered off |
| 3650 does not power on | Missing `AC-POWER-SUPPLY` |
| Serial interfaces do not appear | Missing module (install while powered off) |
| PC with IP 169.254.x.x | DHCP did not respond (pool, helper, VLAN/trunk) |
| First ping 1/4 or 2/4 | ARP; repeat |
| `crypto key generate` fails | Missing `hostname` or `ip domain-name` |
| Changes lost on reopen | Neither the config (`write memory`) nor the .pkt file was saved |

## Standard PT lab deliverable

1. Device list (exact PT model and modules).
2. Topology (interactive diagram + optional Mermaid).
3. Connection table with exact port and cable type.
4. VLAN and addressing tables.
5. Per-device configuration (CLI) and GUI instructions for hosts/servers.
6. Inter-VLAN routing / protocols, DHCP, NAT as applicable.
7. Verification commands with what is expected to be seen.
8. Tests (expected pings OK/FAIL) and troubleshooting of the most likely failures.
