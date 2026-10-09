# network-engineering — Networking skill for Claude Code

[![CI](https://github.com/whetstone-dev/network-engineering/actions/workflows/ci.yml/badge.svg)](https://github.com/whetstone-dev/network-engineering/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Node ≥ 22.18](https://img.shields.io/badge/node-%E2%89%A5%2022.18-green.svg)
[![Website](https://img.shields.io/badge/website-whetstone--dev.github.io-34dcc6.svg)](https://whetstone-dev.github.io/network-engineering/)

A skill for [Claude Code](https://claude.com/claude-code) that turns Claude into a **network engineering** assistant: it designs, configures, validates, documents, teaches and troubleshoots networks, with first-class support for **Cisco Packet Tracer** and **interactive topology diagrams**.

The network is described in a JSON model (`*.net.json`) that is the **single source of truth**: configs, diagram, documentation, validation and tests are all generated from that model, so they never contradict each other.

## What it does

- **Designs complete networks** from requirements: topology, VLSM, VLANs, routing, services and security.
- **Generates validated candidate configs**: Cisco IOS / IOS XE and ASA, plus GUI instructions for Packet Tracer end devices. Credentials are redacted by default; commands require target-device review and do not save startup-config.
- **Validates the whole network**, not just syntax: trunks and native VLAN, unreachable gateways, overlapping subnets, DHCP without a server, OSPF/EIGRP adjacencies, STP (root and blocked ports), HSRP, ACLs, NAT, firewall, VPN… and runs **simulated round-trip pings**.
- **Interactive diagram** in a single offline HTML file: per-device inspector with its config, physical and L3 views, VLAN filter, diagnostics, highlighted ping paths, SVG/PNG export.
- **Imports existing networks** from `show running-config` + `show cdp neighbors`, and **compares versions** (`diff`) with a change diagram.
- **Lab mode and teaching mode** (BEGINNER / INTERMEDIATE / ADVANCED, step by step with the *why*) plus systematic **troubleshooting**.
- **Never invents commands**: flags differences between Packet Tracer, IOS, IOS XE and real hardware, and separates what is confirmed from what is inferred.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- **Node.js ≥ 22.18** (runs TypeScript natively). No npm dependencies.

## Installation

**Option 1 — Skills CLI** ([skills.sh](https://skills.sh)):

```bash
npx skills add whetstone-dev/network-engineering
```

**Option 2 — Clone as a personal skill** (available in every project):

```bash
# macOS / Linux
git clone https://github.com/whetstone-dev/network-engineering.git ~/.claude/skills/network-engineering
```
```powershell
# Windows (PowerShell)
git clone https://github.com/whetstone-dev/network-engineering.git "$HOME\.claude\skills\network-engineering"
```

**Option 3 — Single project**: clone into `.claude/skills/network-engineering` inside the project repository.

The folder must be named `network-engineering` (same as the skill). Restart Claude Code so it picks it up.

### Updating

```bash
git -C ~/.claude/skills/network-engineering pull     # git install
npx skills update                                    # Skills CLI install
```

Versions are published under [Releases](https://github.com/whetstone-dev/network-engineering/releases) following [SemVer](https://semver.org/); see [CHANGELOG.md](CHANGELOG.md) for changes.

## Usage

Ask Claude for any networking task and the skill activates on its own:

- *"I need a Packet Tracer lab with 3 VLANs, one router, two switches and DHCP."*
- *"Explain step by step how to configure router-on-a-stick, I'm a beginner."*
- *"Design the network for a company with two sites joined by a VPN and Internet access through NAT."*
- *"PCs in VLAN 30 aren't getting an IP, here is the switch show running-config."*
- *"Analyze this Packet Tracer screenshot."*
- *"Document this network from these configs."*

Or invoke it explicitly: `/network-engineering <description or path to a .net.json>`.

### `netlab` toolkit (also usable without Claude)

```bash
node scripts/netlab.ts help
node scripts/netlab.ts init my-net.net.json                      # starter model with autocomplete (JSON Schema)
node scripts/netlab.ts validate my-net.net.json                  # full validation + simulated pings
node scripts/netlab.ts validate my-net.net.json --strict --json  # warnings also fail; modeled quality gate
node scripts/netlab.ts build my-net.net.json -o out              # diagram + docs + configs
node scripts/netlab.ts trace my-net.net.json PC1 8.8.8.8         # simulated ping with its path
node scripts/netlab.ts import configs/ -o net.net.json           # from show running-config + CDP
node scripts/netlab.ts diff v1.net.json v2.net.json -o changes.html
node scripts/netlab.ts vlsm 192.168.0.0/24 SALES:60 IT:25 WAN:2
```

Ready-to-explore examples live in [`examples/`](examples/) (the `.html` files in `examples/rendered/` open with a double click after cloning).

`build` and `config` refuse errors or inconclusive tests before writing configurations. `build --allow-invalid` creates diagnostic reports without configs and returns nonzero when its gate fails. `--include-secrets` explicitly enables restricted config output; HTML, Markdown and diagnostics remain redacted. Unknown imported lines lose their values and are never emitted. Review free text before sharing artifacts.

## Repository layout

| Path | Contents |
|---|---|
| `SKILL.md` | Entry point: task router, design flow, quality rules |
| `references/` | Topic knowledge loaded on demand (IOS, Packet Tracer, IPv4/IPv6, switching, STP, routing, services, security, wireless, topologies, troubleshooting, labs…) |
| `scripts/netlab.ts` | Toolkit CLI |
| `scripts/lib/` | Model, schema, L2/STP/L3/IPv6/HSRP analysis, simulation (ACL, NAT, ASA, IPsec), IOS and ASA generators, importer, diff, layout, renderer, documentation |
| `schemas/` | JSON Schema for the model |
| `assets/` | Diagram viewer (dependency-free JS/CSS, embedded in the HTML) |
| `templates/` | Starter model, lab, analysis and troubleshooting reports |
| `examples/` | Validated models and rendered diagrams |
| `web/` | Website (Next.js, EN/ES) published on GitHub Pages; not part of the skill |

## Known limitations

- The simulation approximates IOS: it does not model timers, ECMP, redistribution or per-instance MST; always confirm with `show` on the device.
- VPN is IOS-only (crypto map); no VPN generation for ASA.
- Tests trace IPv4 ICMP only. IPv6 routing tables are supported; IPv6 connectivity, TCP/UDP application policies and WLAN behavior require separate verification. BGP models direct sessions without transit; EIGRP uses assumed bandwidth/delay defaults.
- Generated results are modeled or approximate, not observed on devices. Packet Tracer labs require manual assembly; native `.pkt` generation is not supported.
- Reading screenshots depends on image quality; the skill separates CONFIRMED / INFERRED / UNKNOWN.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs are welcome.

## License

[MIT](LICENSE) © Juan David (Juanfrxz)
