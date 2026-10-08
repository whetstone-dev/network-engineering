# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: incompatible changes to the model format (`modelVersion`) or the CLI.
- **MINOR**: new backward-compatible capabilities (protocols, generators, validations, references).
- **PATCH**: fixes to bugs, commands or documentation.

## [Unreleased]

## [1.1.0] - 2026-10-08

The project is now English-first and lives in the **whetstone-dev** organization.

### Added
- **Website** in `web/` (Next.js static export, English and Spanish): explains the skill with the real diagrams from `examples/rendered`, usage examples and installation. Published to GitHub Pages by `.github/workflows/pages.yml`: https://whetstone-dev.github.io/network-engineering/
- `SKILL.md` rule: Claude answers in the user's language even though the skill content is in English.

### Changed
- **Everything is in English**: `SKILL.md`, the 17 references, templates, JSON Schema descriptions, `netlab` output (diagnostics, trace, routes, calculators, CLI help), generated documentation, comments and banners in generated configs, the interactive diagram viewer, code comments and repository docs. The website opens in English by default.
- **Example data in English**: VLANs `SALES`, `IT`, `MGMT`, `GUESTS`, `USERS`, `SERVERS`; sites `SITE-A`/`SITE-B`; devices `LAP-GUEST`, `PC-S1`, `PC-S2`; ACL `GUESTS-IN`. `examples/wan-2sedes-ospf-serial.net.json` was renamed to `examples/wan-2sites-ospf-serial.net.json`. All rendered diagrams were regenerated.
- `netlab import` writes the placeholders `<SECRET>` and `<COMMUNITY>` (previously `<SECRETO>`/`<COMUNIDAD>`); models imported before keep validating. The default output file is `imported-network.net.json`.
- The repository moved to the **whetstone-dev** organization: `npx skills add whetstone-dev/network-engineering`. GitHub redirects the old URLs.

## [1.0.0] - 2026-10-08

First public release.

### Added
- **`*.net.json` network model** as the single source of truth, with a JSON Schema (`schemas/network-model.schema.json`) for VS Code autocomplete and detection of misspelled fields.
- **`netlab` CLI** (native TypeScript on Node.js ≥ 22.18, zero dependencies): `validate`, `build`, `render`, `config`, `docs`, `mermaid`, `trace`, `routes`, `init`, `import`, `diff`, `schema`, `catalog` and calculators (`subnet`, `vlsm`, `ipv6`, `eui64`).
- **Whole-network validation**: cabling and media, interfaces per Packet Tracer model, VLANs, trunks and native VLAN, router-on-a-stick, EtherChannel, per-VLAN STP (root and blocked ports), HSRP, IPv4/IPv6, DHCP with simulated leases, OSPF/OSPFv3/EIGRP/RIP/BGP, static routes, ACLs, NAT/PAT, ASA and IPsec VPN.
- **Simulation**: routing tables with real AD and metrics (OSPF cost, EIGRP composite metric) and round-trip ping with LPM, ACLs, NAT, HSRP, stateful ASA firewall and IPsec tunnels.
- **Config generation**: Cisco IOS / IOS XE (VLANs, trunks, ROAS, SVIs, EtherChannel, STP, HSRP, OSPF, OSPFv3, EIGRP, RIP, BGP, DHCP, NAT with VPN exemption, ACLs, SSH, IPsec crypto map), Cisco ASA 8.3+ and GUI instructions for Packet Tracer end devices.
- **Self-contained interactive diagram** (SVG + JS, no CDN): inspector, physical and L3 views, VLAN filter, search, diagnostics, ping highlighting, STP lights, dark mode, SVG/PNG export and persistent layout.
- **Import** of `show running-config` and `show cdp neighbors [detail]` into a model (secrets are not imported).
- **Diff** between model versions with a report and a change diagram.
- **17 references** (IOS, Packet Tracer, IPv4, IPv6, switching, STP, routing, services, security, wireless, topologies, troubleshooting, labs, analysis, documentation, diagramming, model), templates and 7 validated examples.
- Test suite (`node --test`) and CI on GitHub Actions.

[Unreleased]: https://github.com/whetstone-dev/network-engineering/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/whetstone-dev/network-engineering/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/whetstone-dev/network-engineering/releases/tag/v1.0.0
