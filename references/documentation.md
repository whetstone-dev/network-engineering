# Infrastructure documentation

## Contents
- [What is generated automatically](#what-is-generated-automatically)
- [What Claude must write](#what-claude-must-write)
- [Executive summary](#executive-summary)
- [Operational procedures](#operational-procedures)
- [Keeping documentation alive](#keeping-documentation-alive)

## What is generated automatically

`node scripts/netlab.ts docs network.net.json` (or `build`) produces a Markdown file with:

| Section | Content |
|---|---|
| Executive summary | Platform, count by type, VLANs, protocols, services, validation and test results |
| Inventory | Device, type, model, platform, role, zone |
| VLANs | ID, name, network, gateway, usable range, hosts, usage, devices that carry it |
| Addressing | Device, interface, IP, mask, gateway, VLAN (includes simulated DHCP IP) |
| Connections | Source ↔ destination matrix with port, medium, type (trunk/access/routed), VLAN, subnet |
| Switch ports | Range, mode, VLAN, security (port-security, portfast, bpduguard, EtherChannel), connected to |
| Routing | Simulated tables per L3 device |
| Validation and tests | Findings and pings with forward and return path |
| Configurations | Redacted candidate CLI per device and GUI instructions |
| Verification | `show` commands per device according to its functions |

Regenerate tables from the model. HTML/Markdown redact structured credentials even if restricted config files were requested. Review free text, addressing and inventory before external sharing. All generated tests/routes are modeled; label observed verification separately.

## What Claude must write

Complement (do not duplicate) what is generated:
- **Design decisions** and their justification (chosen topology, addressing scheme, why OSPF and not static, why an unused native VLAN).
- **Assumptions** and pending data (marked).
- **Risks** and single points of failure; evolution recommendations.
- **Lab vs production differences** if applicable.

## Executive summary

For non-technical readers, 5-8 lines: purpose of the network, scope (sites, users), segmentation (how many VLANs and what for), external connectivity, main security controls, validation status and next steps. No commands.

## Operational procedures

When requested, document in a numbered, verifiable format:
- Onboarding a user/port (VLAN, port-security, document in the model).
- Adding a VLAN (create on all switches along the path, allow on trunks, SVI/subinterface, DHCP pool, ACL, update the model).
- Configuration backup (`copy running-config tftp:` / `write memory`), restore.
- Password changes / SSH key rotation.
- First-level troubleshooting (link to the symptom → cause table in `references/troubleshooting.md`).

## Keeping documentation alive

- The `*.net.json` file is the canonical documentation; version it (git) together with the generated `.md`/`.html`.
- After any change: edit the model → `validate` → `build` → review differences.
- If the user provides updated `show running-config` output, reconcile the model with it (see `references/analysis.md`).
