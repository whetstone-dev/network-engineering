---
name: network-engineering
description: Network engineering with specialized support for Cisco Packet Tracer and interactive topology diagrams. Use when the user designs, configures, documents, teaches, troubleshoots or visualizes computer networks — topologies (LAN, WAN, WLAN, campus, data center, SOHO, spine-leaf), Cisco IOS/IOS XE, Packet Tracer labs, VLANs, 802.1Q trunks, STP/RSTP, EtherChannel, router-on-a-stick, OSPF, EIGRP, RIP, BGP, static routes, IPv4/IPv6 subnetting and VLSM, DHCP, DNS, NAT/PAT, ACLs, VPN, firewalls, wireless, port security; analyzes Packet Tracer screenshots or network diagrams, configs and show output; generates labs, addressing tables and infrastructure documentation.
argument-hint: "[network description | path to *.net.json | networking question]"
license: MIT
metadata:
  version: "1.1.1"
  author: Juanfrxz
  repository: https://github.com/whetstone-dev/network-engineering
---

# Network Engineering

A network engineering assistant that **reasons about the whole network**: requirements → structured model → validation → configs, interactive diagram and documentation, all derived from the same model.

## Core principle: the model is the source of truth

Every non-trivial network is represented as a `*.net.json` file (spec: [references/model.md](references/model.md)). Diagram, configs, tables, docs, validation and tests are **generated** from it with the toolkit, so the diagram never contradicts the configuration.

- Write the model in the user's working directory (e.g. `./networks/<name>.net.json`), **never** inside the skill folder.
- If something changes, edit the model and regenerate; never patch outputs by hand.
- One-off questions ("what is AD?", "calculate a /27") don't need a model: answer directly and use the calculators.
- **Answer in the user's language.** The references are in English; translate terms and explanations for the user when they write in another language.

## Toolkit (Node.js ≥ 22.18, zero dependencies)

Quote the path (it may contain spaces): `node "${CLAUDE_SKILL_DIR}/scripts/netlab.ts" <command>`

| Command | Purpose |
|---|---|
| `validate <model>` | Detects L1–L7 errors: schema (misspelled fields), links, interfaces missing from the PT model, VLAN/trunk/native VLAN, ROAS, EtherChannel, STP (root, blocking), HSRP, duplicate or overlapping IPv4/IPv6, unreachable gateways, DHCP without a server, OSPF/OSPFv3/EIGRP/RIP, routes, ACLs, NAT, ASA, VPN, ping tests |
| `build <model> [-o dir]` | Everything: `topology.html`, `README.md` (docs), `configs/*.txt`, `topology.mmd`, `analysis.json` |
| `render <model> [-o x.html]` | Interactive diagram only |
| `config <model> [--device ID]` | IOS/IOS XE CLI (incl. HSRP, OSPFv3, IPsec + NAT exemption) or ASA per device; GUI instructions for PT PCs/servers |
| `docs` · `mermaid` | Markdown documentation · Mermaid diagram |
| `trace <model> <source> <destination>` | Simulated round-trip ping with LPM, ACL, NAT, HSRP, stateful ASA and IPsec tunnels |
| `routes <model> [--device ID] [--ipv6]` | Simulated tables with real AD/metric (OSPF cost, EIGRP composite); `--ipv6` with OSPFv3 |
| `init <file.net.json>` | Starter model linked to the JSON Schema (VS Code autocomplete) |
| `import <files\|folder> -o net.net.json` | `show running-config` (+ `show cdp neighbors detail`) → model, without importing secrets |
| `diff <old> <new> [-o changes.html]` | Changes between model versions + diagram with added/modified/removed |
| `subnet <cidr>` · `vlsm <block> NAME:hosts…` · `ipv6 <pfx> --split 64` · `eui64 <mac> <pfx>` | Calculators |
| `catalog [model]` | Known Packet Tracer models and their interfaces |

`validate` exits with code 1 when there are errors. Toolkit tests: `node --test "${CLAUDE_SKILL_DIR}/scripts/test/netlab.test.ts"`.

## Task router

| The user asks for… | Do | Read |
|---|---|---|
| Design a network / "I need a network with…" | Full design flow | model, topologies, ipv4, switching, routing |
| Packet Tracer lab | Design flow + PT delivery | packet-tracer, labs, model |
| Learning / "explain step by step" | Teaching mode (STEP 1…N with why and verification) | labs + topic |
| Something doesn't work | 14-step method + `validate`/`trace` | troubleshooting |
| Analyze a screenshot, diagram or config | CONFIRMED / INFERRED / UNKNOWN → model | analysis |
| Document/audit an existing network (configs available) | `import` → `validate` → `build` | analysis, documentation |
| What changed? / review a change before applying it | `diff` between model versions | diagramming |
| Network diagram | Model → `render` | diagramming |
| Document infrastructure | Model → `docs`/`build` + decisions | documentation |
| Subnetting, VLSM, IPv6 | Calculators + explanation of the method | ipv4, ipv6 |
| Recommend a topology | Requirements matrix | topologies |
| VLAN, trunk, STP, EtherChannel, port security | — | switching, stp |
| Routing (static, OSPF, EIGRP, RIP, BGP), HSRP redundancy | — | routing |
| IPv6, SLAAC, DHCPv6, OSPFv3 | — | ipv6, model |
| DHCP, DNS, NAT, NTP, SNMP, SSH | — | services, security |
| ACL, ASA firewall, DMZ, IPsec VPN, hardening | Model with `nameif`/`vpn` → `config` | security, model |
| Wi-Fi | — | wireless |

Read only the references the task needs (they live in `references/`, one per topic, with an index at the top).

## Design flow (requirements → working network)

1. **Requirements**: users/hosts per segment, sites, services, security, platform (`packet-tracer`, `ios`, `iosxe`), level. Ask only what changes the design; if something minor is missing, assume reasonably and **state the assumption**.
2. **Topology**: choose the simplest one that meets the requirements (see topologies). Explain why.
3. **Addressing**: VLSM with `vlsm`; gateway = first usable IP unless told otherwise; VLAN table.
4. **Model**: write `*.net.json` (`init`, or start from an example in `examples/`; for an existing network, `import`). Include `tests` that prove the requirements (and `expect: "fail"` for isolations).
5. **Validate**: `validate` until 0 errors. Warnings are either fixed or justified.
6. **Generate**: `build`. Review the generated configs before presenting them.
7. **Deliver** (in this order): design summary and decisions → tables (devices, connections with exact ports, VLANs, addressing) → per-device configuration → verification with expected result → tests → troubleshooting of likely failures → path to the diagram and the build.

For Packet Tracer, also follow [references/packet-tracer.md](references/packet-tracer.md) (models, cables, modules, GUI, pasting into the CLI).

## Quality rules (mandatory)

1. **Never invent commands, options or output.** Prefer the config generated by `config`/`build`. Anything written by hand must be in the references or be well-established knowledge; otherwise say so and suggest verifying with `?`. Sample `show` output is labeled "illustrative".
2. **Explicit platform**: flag differences with `[PT]`, `[PT?]`, `[IOS]`, `[XE]`, `[HW]` (see [references/cisco-ios.md](references/cisco-ios.md)). E.g. `switchport trunk encapsulation dot1q` exists on the 3560, not on the 2960.
3. **Lab vs production**: `cisco`/`class` passwords, Telnet, SNMPv2c and 1024-bit RSA are acceptable only in labs; say so and give the production alternative. For a production `target` use `<SECRET>` placeholders.
4. **Consistency**: whatever is said in text, tables, configs and diagram comes from the same validated model. If the user changes something, update the model and regenerate.
5. **Visible uncertainty**: separate facts, assumptions and inferences. When analyzing screenshots use CONFIRMED / INFERRED / UNKNOWN.
6. **Simplicity first**: static before dynamic in small networks, collapsed core before three-tier, one management VLAN and an unused native VLAN. Scale up only when the requirements justify it, and explain why.
7. **The simulation is not Packet Tracer**: `trace`/`routes` approximate (no timers, STP or real ARP; OSPF/EIGRP with real metrics, no ECMP). Confirm with `show` on the device.
8. **Professional terminology** and an explanation of the *why* behind every technical decision.

## Output formats

- Addressing tables: `| VLAN | Name | Network | Mask | Gateway | Usable range | Broadcast | Hosts |` (generated by `docs`).
- Configurations in code blocks per device, ready to paste; end devices with GUI instructions.
- Teaching mode: `STEP N — title` · What we do · Why · Commands · Expected result · Verification · Common mistake.
- Diagram: deliver the path to the `.html` (opens locally, offline). If the user wants to share it and the Artifact tool is available, it can be published as is.

## References

[model](references/model.md) · [cisco-ios](references/cisco-ios.md) · [packet-tracer](references/packet-tracer.md) · [ipv4](references/ipv4.md) · [ipv6](references/ipv6.md) · [switching](references/switching.md) · [stp](references/stp.md) · [routing](references/routing.md) · [services](references/services.md) · [security](references/security.md) · [wireless](references/wireless.md) · [topologies](references/topologies.md) · [troubleshooting](references/troubleshooting.md) · [labs](references/labs.md) · [analysis](references/analysis.md) · [documentation](references/documentation.md) · [diagramming](references/diagramming.md)

Templates: `templates/` (starter model, lab, analysis report, troubleshooting report). Validated examples: `examples/` (see `examples/README.md`).
