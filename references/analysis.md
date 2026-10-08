# Analysis of screenshots, diagrams and existing configurations

## Contents
- [Golden rule: CONFIRMED / INFERRED / UNKNOWN](#golden-rule-confirmed--inferred--unknown)
- [Packet Tracer screenshots or diagrams](#packet-tracer-screenshots-or-diagrams)
- [Pasted configurations and show output](#pasted-configurations-and-show-output)
- [From analysis to model](#from-analysis-to-model)
- [Importing existing configurations](#importing-existing-configurations)
- [Response format](#response-format)

## Golden rule: CONFIRMED / INFERRED / UNKNOWN

| Category | Criterion | Example |
|---|---|---|
| **CONFIRMED** | Visible/readable without interpretation | Label "Gig0/0" next to the router; text "192.168.1.1/24" |
| **INFERRED** | Deduced with explicit reasoning; may be wrong | "Dashed link between switches in PT → probably a crossover cable" |
| **UNKNOWN** | Neither visible nor confidently deducible | Trunk allowed VLANs, passwords, routes, internal configuration |

Never fill gaps with "typical" values presented as facts. If you need to assume something to produce a useful result, assume it **explicitly** and mark it as INFERRED.

## Packet Tracer screenshots or diagrams

Identify, in this order:
1. **Devices**: type by icon (round router, rectangular switch with arrows, PC, server, cloud, AP) and label/hostname. The exact model (2911, 2960) is CONFIRMED only if it can be read.
2. **Connections**: between which devices; line type in PT (solid black = straight-through, dashed black = cross-over, red with lightning bolt = serial, orange = fiber, light blue = console) — the cable type is INFERRED unless there is a legend.
3. **Interfaces**: labels at the ends (if PT shows "Port Labels").
4. **Link status**: green triangles/dots = up; red = down; orange = STP blocking/converging (in PT). The color is CONFIRMED; its cause is INFERRED.
5. **Addressing and VLANs**: only if there is visible text/notes.
6. **Visible errors**: red lights, red interface, failed PDU (envelope with an X), on-screen messages.

Limitations: resolution may prevent reading labels → mark them UNKNOWN and ask for a larger screenshot or the output of `show ip interface brief` / `show cdp neighbors`.

## Pasted configurations and show output

| Source | What can be confirmed |
|---|---|
| `show running-config` | Hostname, interfaces, IP, port VLANs, trunks, routing, ACLs, NAT, DHCP, lines |
| `show ip interface brief` | Interfaces, IP, state (status/protocol) |
| `show vlan brief` | Existing VLANs and access ports |
| `show interfaces trunk` | Trunks, native, allowed, active, forwarding |
| `show cdp neighbors [detail]` | Real cabling (remote device and interface), platform, neighbor IP |
| `show ip route` | Effective routes (compare with the model's simulation) |

Read the configuration literally; do not assume default values without saying so (e.g. "without `switchport mode`, the 2960 negotiates with DTP dynamic auto").

## From analysis to model

1. Create the model with what is CONFIRMED; add what is INFERRED with `"confidence": "inferred"` (devices, interfaces or links) and what is UNKNOWN with `"confidence": "unknown"`, or simply omit it and mention it.
2. `status` only with evidence (lights, `show`).
3. `validate` on that model produces fault hypotheses; present them as hypotheses when they depend on inferred data.
4. `render` shows inferred items with a dashed border and unknown items dotted with `?`.

## Importing existing configurations

When the user has access to the devices (or their backups), importing is more reliable than transcribing:

1. Ask, per device, for `show running-config` and `show cdp neighbors detail` (with the prompt visible, e.g. `R1#show cdp neighbors detail`). They can go in a single `.txt` file per device.
2. `node scripts/netlab.ts import <folder> -o network.net.json --name "Network X"`.
3. Review the report: devices created only from CDP (inferred), links inferred from /30s, secrets replaced with `<SECRET>`, lines in `extraConfig`.
4. Fill in by hand what is not in a running-config: hardware model (`model`), hosts and servers, `tests`.
5. `validate` → real findings in the existing network; `render` → diagram; from here on, the model is the living documentation.

What it recognizes: interfaces (IP, VLAN, trunk, subinterfaces, port-security, EtherChannel, HSRP, IPv6, per-interface OSPF/OSPFv3, NAT, applied ACLs, helper), VLANs, static routes, OSPF, OSPFv3, EIGRP, RIP, BGP, DHCP, NAT/PAT, numbered and named ACLs, STP, SSH, NTP, syslog, SNMP, crypto map VPN; on ASA: interfaces with nameif, routes and ACLs. Everything else is kept in `extraConfig` (not verified).

## Response format

Use `templates/analysis-report.md`:

```
## Detected inventory
| Item | Value | Status |
| R1 type | Router | CONFIRMED (icon + label) |
| R1 model | 2911 | INFERRED (icon shape; no model label) |
| Trunk SW1-SW2 allowed VLANs | — | UNKNOWN |

## Visible problems
## Hypotheses (require verification)
## What I need to confirm  (specific commands or screenshots)
```
