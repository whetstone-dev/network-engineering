# Interactive network diagrams

## Contents
- [Technology decision](#technology-decision)
- [Generating a diagram](#generating-a-diagram)
- [What it shows and what it lets you do](#what-it-shows-and-what-it-lets-you-do)
- [L3 view and version comparison](#l3-view-and-version-comparison)
- [Controlling the layout](#controlling-the-layout)
- [Status and confidence](#status-and-confidence)
- [Delivering the diagram](#delivering-the-diagram)
- [Mermaid (secondary)](#mermaid-secondary)
- [Extending the renderer](#extending-the-renderer)

## Technology decision

| Option | Interactivity | Dependencies | Offline/local | Generation from the model | Verdict |
|---|---|---|---|---|---|
| Mermaid | Low (no inspector) | Mermaid JS runtime | Needs the viewer | Very easy | Secondary export |
| Graphviz | None (image) | `dot` binary (not installed) | Yes | Easy | Discarded |
| React / React Flow | High | Build + npm | Requires a bundle | Medium | Overengineering for an artifact |
| Cytoscape.js / D3 | High | 300+ KB library (CDN or embedded) | Only if embedded | Medium | Unnecessary at this scale |
| **Embedded SVG + vanilla JS** | High (inspector, filters, traces) | **None** | **Yes, a single .html** | Direct (layout in Node) | **Chosen** |

Reasons: a single self-contained HTML file that opens with a double click, publishable as an Artifact, with no CDN or build, and with a **deterministic** layout computed in `scripts/lib/layout.ts` from network roles. The viewer (`assets/viewer.js`, `assets/viewer.css`) is inlined at generation time.

## Generating a diagram

```bash
node scripts/netlab.ts render network.net.json                 # → network.html next to the model
node scripts/netlab.ts render network.net.json -o out.html
node scripts/netlab.ts build network.net.json                  # diagram + docs + configs
```
Always run `validate` before delivering: the diagram shows the errors, but the user must not receive a broken network without knowing it.

## What it shows and what it lets you do

- **Devices** with their own icons per type (router, switch, L3 switch, firewall, cloud/ISP, PC, laptop, server, AP, wireless router, WLC, phone, printer, IoT, modem, hub) and below them: id, model and primary IP (or simulated DHCP IP).
- **Links** by medium: copper (solid), crossover (dashed), trunk (thick), serial (red), fiber (orange), wireless (dotted), console. Port labels at each end (`Gi0/1 .1`) and in the middle (subnet, `802.1Q 10,20,30` or `VLAN 10`). Per-end link lights (green/red/amber) in Packet Tracer style.
- **Interaction**: click a device → inspector (properties, interfaces with IP/VLAN/peer, simulated routing table, services, generated configuration with a Copy button, verification commands, findings). Click a link → ends, VLAN, subnet, status.
- **Filters**: by VLAN (dims whatever does not carry that VLAN), search by name/IP (`/`), label layers (Ports, IP, Labels, VLAN color).
- **Diagnostics**: "!" markers on devices/links with errors; a tab with all findings, click to locate the subject.
- **Tests**: list of simulated pings; clicking highlights the forward and return path, including intermediate switches.
- **Tables**: addressing, VLANs, connections, ports, inventory.
- **Export**: SVG and PNG of the diagram; **Layout** copies the positions so they can be saved in the model.
- **STP**: lights on blocked (alternate) ports show amber; with the VLAN filter, the blocked ports for that VLAN are shown. The root bridge carries the "STP root" label and the inspector lists root/blocked ports per VLAN.
- **HSRP and IPv6**: the inspector shows the HSRP role of each interface (active/standby, priority) and the simulated IPv6 table (OSPFv3).
- Pan (drag background), zoom (wheel, buttons), drag devices, light/dark theme, responsive.

## L3 view and version comparison

- **L3** button: draws only routers, multilayer switches, firewalls and Internet, and each subnet as a "pill" (CIDR, VLAN, host count, HSRP). Useful for explaining routing and addressing plans. Click a subnet: gateways, active HSRP virtual IP, switches and devices in the L2 domain. Search, VLAN filter and test highlighting also work here.
- `netlab diff old.net.json new.net.json -o changes.html`: the diagram of the new model with devices/links **added** (green), **modified** (dotted amber) and **removed** (red ghosts in their previous position), plus the **Changes** tab (per-field detail, new/resolved problems and tests that change).

## Controlling the layout

- `hierarchical` (default): rows by function. Root = highest-tier devices (Internet/ISP, firewall/edge routers). Same-level peers connected to each other (WAN routers, two cores) stay on the same row.
- Adjustments without coordinates: `role` (`internet`, `edge`, `core`, `distribution`, `access`, `server`, `endpoint`, `wireless`) or numeric `tier`.
- `circular`: rings and meshes (infrastructure in a circle, hosts facing outward).
- `manual`: the user drags devices in the HTML, presses **Layout**, and the JSON is pasted into the model's `layout` (`algorithm: "manual"`, `positions`). Devices without a position are placed automatically.
- `zones`: dotted boxes around groups (DMZ, site, server farm).

## Status and confidence

| Field | Values | Visual |
|---|---|---|
| `devices[].status`, `interfaces[].status`, `links[].status` | `up`, `down`, `warning`, `error`, `unknown` | Device status light and end lights; `down` link in dashed red |
| `interfaces[].shutdown` | `true` | Red end (DOWN) |
| `confidence` | `confirmed`, `inferred`, `unknown` | Dashed (`~`) or dotted (`?`) border |
| Validator findings | error / warning | Red/amber "!" marker |

The default status is "as designed" (UP). Use `status` only to reflect real observations (screenshots, `show`), never to invent states.

## Delivering the diagram

- **Local**: the `.html` opens with a double click in any modern browser, offline.
- **Artifact**: HTML contains redacted configuration previews. Review free text, inventory and addresses before sharing, and publish only within the user's sharing authorization. The local HTML remains the default deliverable.
- Give the file path and what to check first (Diagnostics tab if there are errors, Tests tab).

## Mermaid (secondary)

`node scripts/netlab.ts mermaid network.net.json -o network.mmd` generates a `flowchart` for READMEs/wikis (subgraphs per zone, trunks with `===`, wireless with `-.-`). It does not replace the HTML: it has no inspector or states.

## Extending the renderer

- New device type: add it to `DeviceType` (`scripts/lib/model.ts`), to the layout rank (`baseRank` in `layout.ts`), and a `<symbol>` in `SYMBOLS` + `ICON` in `assets/viewer.js`.
- New data in the inspector: add it in `buildViewerData` (`scripts/lib/render.ts`) and show it in `renderInspector` (viewer).
- Keep the viewer free of external dependencies: it is a portability requirement.
