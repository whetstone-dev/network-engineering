# Validated examples

Each `*.net.json` is a complete model. The `.html` files in `rendered/` are their interactive diagrams (open them with a double click).

| Model | Level | What it shows | Status |
|---|---|---|---|
| `pt-3vlan-roas-dhcp.net.json` | Beginner | 1 × 2911 router + 2 × 2960 switches, 3 VLANs + management + unused native, router-on-a-stick, DHCP on the router, SSH | 0 errors · 4/4 tests |
| `campus-ospf-nat.net.json` | Advanced | ISR4331 edge with PAT and default route via OSPF, 3650 core (SVIs, `ip routing`, DHCP relay), LACP EtherChannel, Server-PT DHCP/DNS/Web, guest ACL, Wi-Fi, zones | 0 errors · 6/6 tests (includes one expected isolation) |
| `wan-2sedes-ospf-serial.net.json` | Intermediate | Two sites joined by serial (HWIC-2T, DCE with clock rate), OSPF area 0 with real cost (`[110/65]`), ROAS and DHCP per site, per-site zones | 0 errors · 6/6 tests |
| `campus-hsrp-stp-eigrp.net.json` | Advanced | Two 3560 distribution switches with per-VLAN HSRP and aligned STP root, access switches with dual uplinks (STP blocks one path per VLAN), LACP EtherChannel, EIGRP composite metric, PAT | 0 errors · 4/4 tests |
| `asa-dmz.net.json` | Advanced | ASA 5506-X with outside/inside/dmz, PAT, static NAT for the web server, inbound ACL, DHCP and inspect icmp; isolation tests by security level | 0 errors · 5/5 tests |
| `vpn-ipsec-ospfv3.net.json` | Advanced | Site-to-site IPsec VPN with NAT exemption; OSPFv2 advertises the default route and OSPFv3 routes IPv6 at headquarters | 0 errors · 4/4 tests |
| `troubleshooting-broken-lab.net.json` | Intermediate | The beginner network with 5 intentional faults to practice troubleshooting | 10 errors detected |

`rendered/diff-lab-vs-broken.html` shows `netlab diff` between the healthy and the broken network (**Cambios**/changes tab). The **L3** button in any diagram shows the logical view of routers and subnets.

```bash
node scripts/netlab.ts validate examples/troubleshooting-broken-lab.net.json
node scripts/netlab.ts build examples/campus-ospf-nat.net.json -o out/campus
node scripts/netlab.ts trace examples/campus-ospf-nat.net.json LAP-INV 8.8.8.8
node scripts/netlab.ts trace examples/vpn-ipsec-ospfv3.net.json BR-PC HQ-SRV
node scripts/netlab.ts routes examples/vpn-ipsec-ospfv3.net.json --ipv6
node scripts/netlab.ts diff examples/pt-3vlan-roas-dhcp.net.json examples/troubleshooting-broken-lab.net.json -o changes.html
node scripts/netlab.ts import scripts/test/fixtures -o imported.net.json
```

## Troubleshooting lab solution

VLAN names in the models: VENTAS = sales, ADMIN = administration, TI = IT.

| # | Fault | Symptom | Evidence on the device | Fix |
|---|---|---|---|---|
| 1 | Trunk SW1→R1 does not allow VLAN 30 | PC5 (IT) gets no IP (169.254.x.x) | `show interfaces trunk` on SW1: VLAN 30 missing on Gi0/1 | `interface g0/1` → `switchport trunk allowed vlan add 30` |
| 2 | SW2 Gi0/1 uses native VLAN 1 (SW1 uses 999) | CDP "Native VLAN mismatch" messages | `show interfaces trunk` on both | On SW2: `switchport trunk native vlan 999` |
| 3 | PC4 with gateway 192.168.2.1 | PC4 cannot leave its network | `ipconfig` on PC4 | Gateway 192.168.20.1 |
| 4 | PC3 (VLAN 10 IP) on port Fa0/13 (VLAN 20) | PC3 cannot reach anyone in VENTAS | `show vlan brief` on SW2 | Move the cable to Fa0/1-10 or set `switchport access vlan 10` |
| 5 | IT pool with `default-router 192.168.3.1` | IT hosts have no way out even though they get an IP | `show running-config \| section dhcp` on R1 | `ip dhcp pool TI` → `default-router 192.168.30.1` |

Note: while fault 1 is active, fault 5 stays hidden (PC5 does not even get an IP) — a good example of why you fix and re-test one fault at a time.
