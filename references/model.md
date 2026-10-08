# Network model (`*.net.json`) — single source of truth

## Contents
- [Principle](#principle)
- [Root structure](#root-structure)
- [meta](#meta)
- [vlans](#vlans)
- [devices](#devices)
- [interfaces](#interfaces)
- [routing](#routing)
- [services](#services)
- [acls, security, stp](#acls-security-stp)
- [links](#links)
- [zones, layout, tests](#zones-layout-tests)
- [Redundancy, IPv6, firewall and VPN](#redundancy-ipv6-firewall-and-vpn)
- [Schema, import and versions](#schema-import-and-versions)
- [Conventions and shortcuts](#conventions-and-shortcuts)
- [Common mistakes when writing the model](#common-mistakes-when-writing-the-model)

## Principle

The network exists **first** as JSON. Diagram, configurations, documentation, tables, validation and tests are **derived** from it with `scripts/netlab.ts`. Never write a configuration or a diagram "by hand" that does not come from the model: if something changes, change the model and regenerate.

JSON was chosen (not YAML) because Node parses it with no dependencies, it has no type ambiguities (`010`, `no`, `on`), and the types are defined in `scripts/lib/model.ts` (the canonical definition; this document explains it).

Minimal template: `templates/model-skeleton.net.json`. Full examples in `examples/`.

## Root structure

```json
{
  "modelVersion": 1,
  "meta": { "name": "...", "target": "packet-tracer" },
  "vlans": [],
  "devices": [],
  "links": [],
  "zones": [],
  "layout": { "algorithm": "hierarchical" },
  "tests": []
}
```

Required: `modelVersion` (= 1), `meta.name`, `devices`, `links`. `$schema` is optional and enables autocompletion in VS Code (see [Schema](#schema-import-and-versions)).

## meta

| Field | Values | Use |
|---|---|---|
| `name` | text | Title of the diagram and the document |
| `description` | text | Subtitle / summary |
| `target` | `packet-tracer` · `ios` · `iosxe` · `generic` | Adjusts syntax and warnings. `ios`/`iosxe` = production: weak passwords are flagged |
| `level` | `beginner` · `intermediate` · `advanced` | Labs |
| `language` | `es`, `en`… | Documentation language |

## vlans

```json
{ "id": 10, "name": "SALES", "subnet": "192.168.10.0/24", "gateway": "192.168.10.1", "purpose": "data" }
```
`purpose`: `data`, `voice`, `management`, `native`, `blackhole`, `guest`, `servers`. `color` (hex) and `description` are optional. The validator compares `subnet`/`gateway` against the actual SVIs/subinterfaces.

**Same VLAN at several sites** (VLAN 10 = 10.1.10.0/24 at SITE-A and 10.2.10.0/24 at SITE-B): declare the VLAN only once **without** `subnet`/`gateway`; addressing lives on each site's interfaces. If you prefer per-VLAN tables with their network, use different IDs per site (110, 210).

## devices

| Field | Description |
|---|---|
| `id` | Unique; used as the hostname. No spaces. |
| `label`, `vendor` | Text shown in the diagram · vendor (`cisco`) |
| `type` | `router`, `switch`, `l3switch`, `firewall`, `wlc`, `ap`, `wireless-router`, `pc`, `laptop`, `server`, `printer`, `phone`, `tablet`, `smartphone`, `iot`, `cloud`, `internet`, `modem`, `hub`, `other` |
| `model` | PT/Cisco model (`2911`, `ISR4331`, `2960-24TT`, `3560-24PS`, `3650-24PS`, `PC-PT`, `Server-PT`…). If it is in the catalog (`netlab catalog`), interface names are validated. |
| `platform` | `ios`, `iosxe`, `asa`, `nxos`, `endpoint`, `other` (if missing, taken from the catalog) |
| `role` | `internet`, `edge`, `core`, `distribution`, `access`, `server`, `endpoint`, `wireless` — row in the diagram |
| `tier` | Forces the diagram row (0 = top) |
| `zone` | Logical tag (visual boxes are defined in `zones`) |
| `status` | `up`, `down`, `warning`, `error`, `unknown` (observed state; default "as designed") |
| `confidence` | `confirmed`, `inferred`, `unknown` (screenshot analysis) |
| `gateway`, `dns` | Hosts and L2 switches (`ip default-gateway`) |
| `vlans` | VLANs to create on a switch (default: those used by its ports) |
| `vtpMode` | `server`, `client`, `transparent`, `off` |
| `extraConfig` | Unmodeled IOS lines. Emitted at the end and marked as **unverified**. |
| `mac` | Switch base MAC (STP root tie-breaker; if missing, the id is used and a warning is raised) |
| `vpn` | Site-to-site IPsec tunnels (see [VPN](#redundancy-ipv6-firewall-and-vpn)) |
| `firewall` | ASA: `{ "inspectIcmp": true, "sameSecurityPermit": false }` |
| `notes` | Free text |
| `interfaces`, `routing`, `services`, `acls`, `security`, `stp` | **Per device** (inside each object in `devices`), described in the following sections |

Device skeleton:
```json
{ "id": "R1", "type": "router", "vendor": "cisco", "model": "2911", "role": "edge",
  "interfaces": [], "routing": {}, "services": {}, "acls": [], "security": {}, "stp": {} }
```

**Hardware modules**: not declared; just use the interface name the module creates (e.g. `Serial0/0/0` on a 2911 = HWIC-2T in slot 0). `netlab catalog <model>` shows built-in and modular interfaces; the generated documentation lists under "Hardware" which module to install.

## interfaces

```json
{ "name": "GigabitEthernet0/0.10", "vlan": 10, "ip": "192.168.10.1/24", "description": "SALES gateway" }
```

| Field | Applies to | Description |
|---|---|---|
| `name` | all | Full IOS name (abbreviations like `gi0/0` are accepted). Ranges: `"FastEthernet0/1-10"` → `interface range`. |
| `mode` | all | `routed`, `access`, `trunk`, `host`, `svi`, `subinterface`, `loopback`. **Inferred**: `VlanX`→svi, `LoopbackX`→loopback, name with `.`→subinterface, hosts→host, switch→access, router→routed, l3switch with IP→routed |
| `ip` | L3 | `"a.b.c.d/nn"` |
| `ipv6`, `linkLocal` | L3 | `["2001:db8:acad:10::1/64"]`, `"fe80::1"` |
| `dhcp` | hosts / router | DHCP client (`ip address dhcp` on routers) |
| `vlan` | access, subinterface, SVI | Access VLAN / `encapsulation dot1Q N` |
| `native` | subinterface | `encapsulation dot1Q N native` |
| `nativeVlan`, `allowedVlans` | trunk | Native (default 1) and allowed list (default all) |
| `voiceVlan` | access | `switchport voice vlan` |
| `shutdown`, `status` | all | Administratively down / observed state |
| `helper` | L3 | `ip helper-address` (DHCP relay) |
| `nat` | L3 | `inside` / `outside` |
| `acl` | L3 | `{ "in": "NAME", "out": "NAME" }` |
| `portSecurity` | access | `{ "maximum": 2, "sticky": true, "violation": "restrict", "macs": [] }` |
| `portfast`, `bpduguard` | access | STP edge |
| `channelGroup` | physical | `{ "id": 1, "mode": "active" }`; also declare `Port-channel1` with the same L2 config |
| `ospf` | L3 | `{ "area": 0, "cost": 10, "passive": true }` (alternative to `routing.ospf.networks`) |
| `clockRate`, `bandwidth`, `speed`, `duplex` | physical | Serial DCE: `clockRate: 64000`. `bandwidth` (kbps) changes the OSPF cost and the EIGRP metric |
| `ospfv3` | L3 IPv6 | `{ "area": 0, "cost": 10, "passive": false }` → `ipv6 ospf <pid> area <a>` |
| `hsrp` | SVI / L3 | `{ "group": 10, "ip": "10.1.10.1", "priority": 110, "preempt": true, "version": 2 }` |
| `nameif`, `securityLevel` | ASA | `"outside"`/`0`, `"inside"`/`100`, `"dmz"`/`50` |
| `stp` | switch ports | `{ "cost": 19, "portPriority": 128 }` (optional; default based on speed) |

## routing

```json
"routing": {
  "ipRouting": true,
  "static": [{ "prefix": "0.0.0.0/0", "nextHop": "203.0.113.1" }],
  "ospf": { "processId": 1, "routerId": "1.1.1.1", "networks": [{ "prefix": "10.0.0.0/30", "area": 0 }],
            "passiveInterfaces": ["Vlan10"], "defaultOriginate": true },
  "eigrp": { "as": 100, "networks": ["10.0.0.0/30"], "passiveInterfaces": [] },
  "rip": { "version": 2, "networks": ["10.0.0.0"], "defaultOriginate": false },
  "bgp": { "as": 65001, "neighbors": [{ "ip": "203.0.113.1", "remoteAs": 65000 }], "networks": ["198.51.100.0/24"] }
}
```
- `static[].nextHop` and/or `exitInterface`; `ad` for a floating route.
- OSPF: explicit `networks` **or** `interfaces[].ospf.area`. Networks are emitted with a wildcard (`network 10.0.0.0 0.0.0.3 area 0`).
- EIGRP/RIP without `networks`: all interfaces with an IP are advertised except those with `nat: outside`.
- `ipv6Static`: `[{ "prefix": "::/0", "nextHop": "2001:db8::1" }]`.

## services

```json
"services": {
  "dhcp": { "excluded": [{ "from": "192.168.10.1", "to": "192.168.10.10" }],
            "pools": [{ "name": "SALES", "network": "192.168.10.0/24", "defaultRouter": "192.168.10.1", "dns": ["8.8.8.8"] }] },
  "dns": { "records": [{ "name": "www.company.local", "type": "A", "value": "10.10.100.20" }] },
  "nat": { "insideSources": ["10.10.0.0/16"], "overloadInterface": "GigabitEthernet0/0/0",
           "static": [{ "inside": "10.10.100.20", "outside": "203.0.113.5" }] },
  "http": true, "https": true, "ftp": true, "tftp": true, "ntp": true,
  "ntpServer": "10.10.100.10", "syslogServer": "10.10.100.10", "snmp": { "community": "<COMMUNITY>", "mode": "ro" }
}
```
- DHCP on a **router** → IOS CLI. DHCP on a **server** (Server-PT) → GUI instructions (one pool per network, Start IP computed from `excluded`).
- NAT: `pool: { "name", "start", "end", "prefix", "overload" }` for dynamic NAT; `aclName` (default `"1"`).

## acls, security, stp

```json
"acls": [{ "name": "GUESTS-IN", "type": "extended", "entries": [
  { "action": "remark", "text": "Internet only" },
  { "action": "permit", "protocol": "udp", "src": "any", "dst": "any", "dstPort": "eq bootps" },
  { "action": "deny", "protocol": "ip", "src": "10.10.50.0/24", "dst": "10.0.0.0/8" },
  { "action": "permit", "protocol": "ip", "src": "10.10.50.0/24", "dst": "any" } ] }],
"security": { "enableSecret": "class", "consolePassword": "cisco", "vtyPassword": "cisco", "servicePasswordEncryption": true,
              "banner": "Restricted access", "vtyAcl": "MGMT-VTY", "minPasswordLength": 8,
              "ssh": { "domain": "company.local", "username": "admin", "password": "<SECRET>", "modulus": 2048 } },
"stp": { "mode": "rapid-pvst", "rootPrimary": [10, 20], "rootSecondary": [], "priorities": [{ "vlans": [30], "priority": 4096 }] }
```
- ACL addresses: `any`, `host X`, `X` (host), `X/len`, `X wildcard`. Numeric name → classic numbered ACL (`access-list 10 ...`).
- Passwords: lab values only with `target: packet-tracer`. In production use placeholders (`<SECRET>`) and have the user replace them.

## links

```json
{ "a": "R1:GigabitEthernet0/0", "b": "SW1:GigabitEthernet0/1", "medium": "copper-straight", "status": "up" }
```
- Endpoint `"PC1"` without an interface: valid if the device has a single physical interface.
- `medium`: `copper-straight`, `copper-cross`, `fiber`, `serial`, `wireless`, `console`, `coaxial`, `phone`, `auto`.
- `dce`: `"a"`/`"b"` on serial links (the DCE end needs `clockRate`).
- Optional `id` (default `L1`, `L2`…), `label`, `speed`, `confidence`, `notes`.
- An interface can be in only one link. SVIs, loopbacks and subinterfaces are not cabled.

## zones, layout, tests

```json
"zones": [{ "id": "dmz", "label": "DMZ", "kind": "security", "devices": ["SRV-WEB"] }],
"layout": { "algorithm": "hierarchical", "positions": { "R1": { "x": 400, "y": 110 } } },
"tests": [{ "from": "PC1", "to": "PC3", "expect": "success", "description": "Same VLAN across switches" }]
```
- `zones[].kind`: `site`, `building`, `security`, `cloud`, `other` (informational); `color` optional.
- `layout.algorithm`: `hierarchical` (default), `circular` (ring/mesh), `manual`. `positions` is obtained with the diagram's **Layout** button after repositioning devices.
- `tests`: simulated round-trip ping (`to` = device id or IP). `expect: "fail"` to verify isolation (ACL, VLAN).

## Redundancy, IPv6, firewall and VPN

**HSRP** (two gateways for the same VLAN): same `hsrp.group` and `hsrp.ip` (VIP) on the SVIs/subinterfaces of both devices; hosts use the VIP as `gateway`. The one with the highest `priority` wins (tie: highest IP). Align the HSRP active router with the STP root for that VLAN (`stp.rootPrimary`); the validator warns if they do not match (`STP-HSRP-MISALIGNED`).

**IPv6 / OSPFv3**: `ipv6` and `linkLocal` on interfaces; hosts with `ipv6Gateway` (usually the router's fixed link-local, e.g. `fe80::1`). OSPFv3 is enabled per interface with `ospfv3.area` and tuned with `routing.ospfv3` (`routerId` is required if the device has no IPv4).

**ASA** (`type: "firewall"`, `platform: "asa"`, `model: "ASA5506-X"` or `"ASA5505"`): each L3 interface with `nameif` and `securityLevel`. On the 5505, `Ethernet0/x` ports are L2 (`"vlan": N`) and the `VlanN` interfaces carry nameif/IP. NAT with `services.nat` (`insideSources` + `overloadInterface` → `nat (inside,outside) dynamic interface`; `static` → `nat (dmz,outside) static`). ACLs same as in IOS (the generator converts to masks); applied with `interfaces[].acl.in` → `access-group`. Without `firewall.inspectIcmp`, outbound pings get no reply.

**Site-to-site IPsec VPN** (IOS crypto map), on each end:
```json
"vpn": { "siteToSite": [{ "name": "HQ-BR", "peer": "198.51.100.2", "localInterface": "GigabitEthernet0/0", "psk": "<SECRET>",
  "localNetworks": ["192.168.10.0/24"], "remoteNetworks": ["192.168.30.0/24"],
  "ike": { "encryption": "aes 256", "hash": "sha", "group": 14, "lifetime": 86400 }, "transform": "esp-aes 256 esp-sha-hmac" }] }
```
The other end must be a mirror (networks swapped, same PSK/IKE/transform). If the router also does PAT, the generator builds the NAT ACL with the **exemption** for VPN traffic. Default `ike.group`: 5 in Packet Tracer, 14 in production.

## Schema, import and versions

- **JSON Schema**: `schemas/network-model.schema.json`. With `"$schema": "<relative path to the schema>"`, VS Code autocompletes and flags errors as you type. `netlab init network.net.json` creates a model that is already linked. `validate` uses the same schema and warns about unknown fields with a suggestion (`allowedVlan` → `allowedVlans`).
- **Import** an existing network: `netlab import <files|folder> -o network.net.json` with each device's `show running-config` and, for cabling, `show cdp neighbors detail` (including the prompt `R1#show cdp neighbors detail` so the device it belongs to is known). Without CDP, only point-to-point links (/30, /31) are inferred. Passwords, keys and communities are replaced with `<SECRET>`; anything unrecognized goes into `extraConfig`.
- **Compare versions**: `netlab diff old.net.json new.net.json -o changes.html` lists per-field changes, new/resolved issues and tests whose result changes, and renders the diagram with added (green), modified (amber) and removed (dashed red) elements.

## Conventions and shortcuts

- Short UPPERCASE IDs (`R1`, `SW-ACC1`, `PC-V1`); used as the hostname.
- Gateway = first usable IP of each subnet unless the user says otherwise.
- Native VLAN with no hosts (e.g. 999) and a separate management VLAN: good practice, also in intermediate labs.
- Access ports in ranges (`FastEthernet0/1-10`) to keep the model compact; links point to a specific port within the range.
- For DHCP hosts, the analysis **simulates** the IP they would receive (marked as simulated).

## Common mistakes when writing the model

| Symptom in `validate` | Typical cause in the JSON |
|---|---|
| `LINK-IF-NOT-FOUND` | The link uses an interface not declared in `interfaces` |
| `LINK-IF-AMBIGUOUS` | Endpoint without an interface on a device that has several |
| `IF-NOT-IN-MODEL` | Name that does not exist on that model (`Gi0/0/0` on a 2911, `Fa0/1` on a 3650) |
| `ROAS-ACCESS-PORT` | Switch port facing the router without `"mode": "trunk"` |
| `ETHERCHANNEL-MEMBER-MISMATCH` | Members with L2 config different from the `Port-channel` |
| `DHCP-NO-SERVER` | Missing `helper` on the SVI/subinterface, or the pool does not cover the network |
