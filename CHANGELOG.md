# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: incompatible changes to the model format (`modelVersion`) or the CLI.
- **MINOR**: new backward-compatible capabilities (protocols, generators, validations, references).
- **PATCH**: fixes to bugs, commands or documentation.

## [Unreleased]

### Added
- **Documentation** on the website (https://whetstone-dev.github.io/network-engineering/en/docs/): Introduction, Installation, Quickstart, Writing good requests, netlab command reference, and Quality gates, secrets & limits. Pages are MDX files in `web/src/content/docs/`.

### Changed
- The website reads the skill version from `SKILL.md` at build time and describes generated configs as validated, redacted candidates.

## [1.1.2] - 2026-10-08

### Security
- Validate configurations and builds before output, reject unsafe IDs/control characters and case-insensitive filename collisions, and refuse generated output through existing symlinks/junctions.
- Redact credential previews by default, keep explicit `--include-secrets` output out of HTML/Markdown/diagnostic/diff reports, discard values from quarantined imported lines, and never re-emit `extraConfig`.

### Changed
- Unknown fields fail validation by default; discovery uses explicit `--relaxed`. `--strict` also rejects warnings. Required inconclusive tests block validation and configuration generation; JSON reports include a modeled quality gate.
- Diagnostic builds use `--allow-invalid`, omit configs, and retain a failing exit code. IOS/ASA output no longer appends `write memory`. Optional `hostname` separates Cisco names from internal IDs.
- Explicit unsupported CLI profiles (including NX-OS) block configuration builds and return an unsupported preview instead of falling back to IOS/ASA commands.
- Skill instructions distinguish quick answers, labs and production review, modeled versus observed evidence, sharing boundaries and unsupported simulation behavior. Fix stale ASA guidance and align contributor checks with CI.

### Added
- CLI, security, malformed-input and schema regression tests, Windows CI, deterministic example-artifact checks, and a reproducible before/after hardening comparison.
- Viewer gateway text nodes, fixed severity/status CSS tokens, and permanent DOM-XSS regression tests with a real-browser comparison.

## [1.1.1] - 2026-10-08

### Security
- **Diagram viewer (DOM-XSS)**: model values were inserted as HTML without escaping in the subnet panel (gateways), the overview (device types, VLAN names) and the `class` attribute of status pills and diagnostic severities. A crafted `*.net.json` could run script when its `topology.html` was opened. All of them are now escaped; rendered examples regenerated. Reported by the Socket audit on skills.sh.

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

[Unreleased]: https://github.com/whetstone-dev/network-engineering/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/whetstone-dev/network-engineering/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/whetstone-dev/network-engineering/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/whetstone-dev/network-engineering/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/whetstone-dev/network-engineering/releases/tag/v1.0.0
