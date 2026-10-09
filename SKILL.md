---
name: network-engineering
description: Use for computer network design, troubleshooting, configuration review, addressing plans, labs and topology diagrams, especially Cisco Packet Tracer, IOS/IOS XE and ASA. Covers IPv4/IPv6, VLANs, routing, ACLs, NAT and VPNs through structured network models and a local validation toolkit.
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

Represent network designs and reconstructed infrastructure in a `*.net.json` file (spec: [references/model.md](references/model.md)). Generate diagrams, configs, tables, docs and tests from it. The model records intended or reconstructed state; observed device state can differ.

- Write the model in the user's working directory (e.g. `./networks/<name>.net.json`), **never** inside the skill folder.
- If something changes, edit the model and regenerate; never patch outputs by hand.
- One-off questions ("what is AD?", "calculate a /27") don't need a model: answer directly and use the calculators.
- **Answer in the user's language.** The references are in English; translate terms and explanations for the user when they write in another language.

## Toolkit (Node.js ≥ 22.18, zero dependencies)

Resolve the installed skill directory in the current agent environment and quote its path: `node "<skill-dir>/scripts/netlab.ts" <command>`. In Claude Code, `${CLAUDE_SKILL_DIR}` supplies that directory.

| Command | Purpose |
|---|---|
| `validate <model> [--strict] [--json]` | Schema, topology, addressing, routing and security consistency checks, within documented simulation limits. Errors and inconclusive tests fail; strict also rejects warnings. `--relaxed` is for discovery and treats unknown fields as warnings. |
| `build <model> [-o dir] [--strict]` | Validated `topology.html`, `README.md`, `configs/*.txt`, `topology.mmd`, `analysis.json`. `--allow-invalid` writes diagnostic reports only; a failed gate still exits nonzero. |
| `render <model> [-o x.html]` | Interactive diagram only |
| `config <model> [--device ID] [--strict]` | Validated, redacted candidate IOS/IOS XE or ASA CLI; GUI instructions for PT PCs/servers. `config`/`build --include-secrets` explicitly enables secrets in config output only. |
| `docs` · `mermaid` | Markdown documentation · Mermaid diagram |
| `trace <model> <source> <destination>` | Simulated round-trip ping with LPM, ACL, NAT, HSRP, stateful ASA and IPsec tunnels |
| `routes <model> [--device ID] [--ipv6]` | Modeled tables using OSPF costs and an EIGRP metric approximation; `--ipv6` includes OSPFv3 |
| `init <file.net.json>` | Starter model linked to the JSON Schema (VS Code autocomplete) |
| `import <files\|folder> -o net.net.json` | `show running-config` (+ CDP) → partial model. Recognized credentials become placeholders; unsupported retained lines lose their values and are quarantined. Review import gaps. |
| `diff <old> <new> [-o changes.html]` | Changes between model versions + diagram with added/modified/removed |
| `subnet <cidr>` · `vlsm <block> NAME:hosts…` · `ipv6 <pfx> --split 64` · `eui64 <mac> <pfx>` | Calculators |
| `catalog [model]` | Known Packet Tracer models and their interfaces |

Run `help` for flags. Toolkit tests: `node --test scripts/test/*.test.ts` from the skill directory.

## Execution policy

- **Quick answer**: conceptual questions, command explanations and calculations need only a direct answer or calculator result.
- **Design/lab**: build the model, validate, generate relevant artifacts and describe verification. State lab assumptions. Packet Tracer delivery consists of models, commands and assembly instructions; the toolkit does not create editable `.pkt` projects.
- **Audit/production review**: reconstruct available evidence, record sources in device/interface/link `notes` with `confidence`, and run `validate --strict`. Report missing information and quarantined commands. Do not assume physical interfaces, optics, firmware/licensing, address ownership, security policy or acceptable disruption.

Label evidence **MODELED** for implemented model rules, **APPROXIMATE** for simplified protocol behavior, **OBSERVED** only for supplied or collected operational evidence, and **INCONCLUSIVE** when information or support is missing. These are report labels, not new JSON confidence values. Simulated success does not establish observed connectivity. Every declared model test is required; an unknown result blocks generation and a claim that the modeled requirements passed. A negative ping needs positive connectivity controls and a checked denial reason before claiming security isolation.

Generation produces candidate configurations for review. Use supported platform profiles and identify version-specific commands that still need device verification. Imported `extraConfig` is untrusted and never emitted. HTML and Markdown contain redacted previews, including when restricted config files were requested. Review free text and infrastructure details before external sharing; redaction does not authorize publication.

CLI generation supports IOS/IOS XE routers/switches and ASA firewalls. Explicit unsupported profiles, including NX-OS, block configuration builds; do not relabel a device to bypass this check.

Apply changes only within the user's explicit authorization, with a backup, impact review and rollback procedure appropriate to the change. Verify observed state before persisting. Existing authorization remains valid; generation alone does not authorize applying or saving commands.

## Task router

| The user asks for… | Do | Read |
|---|---|---|
| Design a network / "I need a network with…" | Full design flow | model, topologies, ipv4, switching, routing |
| Packet Tracer lab | Design flow + PT delivery | packet-tracer, labs, model |
| Learning / "explain step by step" | Teaching mode (STEP 1…N with why and verification) | labs + topic |
| Something doesn't work | 14-step method + `validate`/`trace` | troubleshooting |
| Analyze a screenshot, diagram or config | CONFIRMED / INFERRED / UNKNOWN → model | analysis |
| Document/audit an existing network (configs available) | `import` → strict validation + evidence/gaps → `docs`/`render` | analysis, documentation |
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

1. **Requirements**: users/hosts per segment, sites, services, security, platform (`packet-tracer`, `ios`, `iosxe`), level. Ask only what changes the design. State minor lab assumptions; follow the stricter evidence policy for production review.
2. **Topology**: choose the simplest one that meets the requirements (see topologies). Explain why.
3. **Addressing**: VLSM with `vlsm`; gateway = first usable IP unless told otherwise; VLAN table.
4. **Model**: write `*.net.json` (`init`, or start from an example in `examples/`; for an existing network, `import`). Add tests for requirements that IPv4 ICMP can evaluate. TCP/UDP ports, IPv6 connectivity and WLAN behavior need separate observed checks; ping does not prove those policies.
5. **Validate**: require a passing quality gate and known, passing tests. Fix or explain warnings in labs; production strict validation requires resolving them.
6. **Generate**: `build`. Review the generated configs before presenting them.
7. **Deliver**: concise outcome, relevant assumptions, quality gate/evidence status and artifact paths. Include tables, configurations, observed verification procedures and troubleshooting when they help the task; answer simple questions briefly.

For Packet Tracer, also follow [references/packet-tracer.md](references/packet-tracer.md) (models, cables, modules, GUI, pasting into the CLI).

## Quality rules (mandatory)

1. **Never invent commands, options or output.** A generator does not establish device compatibility. Validate the model, check the supported platform and flag commands requiring verification against the target software/image. Label sample `show` output "illustrative".
2. **Explicit platform**: flag differences with `[PT]`, `[PT?]`, `[IOS]`, `[XE]`, `[HW]` (see [references/cisco-ios.md](references/cisco-ios.md)). E.g. `switchport trunk encapsulation dot1q` exists on the 3560, not on the 2960.
3. **Lab vs production**: `cisco`/`class` passwords, Telnet, SNMPv2c and 1024-bit RSA are acceptable only in labs; say so and give the production alternative. For a production `target` use `<SECRET>` placeholders.
4. **Consistency**: whatever is said in text, tables, configs and diagram comes from the same validated model. If the user changes something, update the model and regenerate.
5. **Visible uncertainty**: separate facts, assumptions and inferences. When analyzing screenshots use CONFIRMED / INFERRED / UNKNOWN.
6. **Simplicity first**: static before dynamic in small networks, collapsed core before three-tier, one management VLAN and an unused native VLAN. Scale up only when the requirements justify it, and explain why.
7. **Simulation limits**: static STP blocking and OSPF costs are modeled; convergence, ARP, ECMP and redistribution are not. EIGRP uses assumed bandwidth/delay defaults; BGP supports direct sessions without transit. IPv6 route analysis does not supply IPv6 packet tracing. VPN generation is IOS crypto-map IKEv1, not ASA VPN or IKEv2. Wireless guidance does not simulate WLAN behavior. Confirm relevant state on devices.
8. **Professional terminology** and an explanation of the *why* behind every technical decision.

## Output formats

- Addressing tables: `| VLAN | Name | Network | Mask | Gateway | Usable range | Broadcast | Hosts |` (generated by `docs`).
- Configurations in code blocks per relevant device, labeled candidate/redacted when applicable; end devices with GUI instructions.
- Teaching mode: `STEP N — title` · What we do · Why · Commands · Expected result · Verification · Common mistake.
- Diagram: deliver the local `.html` path. Review its contents and honor the user's sharing authorization before publishing.

## References

[model](references/model.md) · [cisco-ios](references/cisco-ios.md) · [packet-tracer](references/packet-tracer.md) · [ipv4](references/ipv4.md) · [ipv6](references/ipv6.md) · [switching](references/switching.md) · [stp](references/stp.md) · [routing](references/routing.md) · [services](references/services.md) · [security](references/security.md) · [wireless](references/wireless.md) · [topologies](references/topologies.md) · [troubleshooting](references/troubleshooting.md) · [labs](references/labs.md) · [analysis](references/analysis.md) · [documentation](references/documentation.md) · [diagramming](references/diagramming.md)

Templates: `templates/` (starter model, lab, analysis report, troubleshooting report). Validated examples: `examples/` (see `examples/README.md`).
