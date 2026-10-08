# Systematic troubleshooting

## Contents
- [Method (14 steps)](#method-14-steps)
- [Commands by layer](#commands-by-layer)
- [Symptom → likely cause](#symptom--likely-cause)
- [Using the toolkit to diagnose](#using-the-toolkit-to-diagnose)
- [Validator codes and their fix](#validator-codes-and-their-fix)
- [Report format](#report-format)

## Method (14 steps)

Work bottom-up (OSI) unless the evidence points to a specific layer; change **one thing at a time** and verify.

1. **Define the problem**: what exactly fails, from where, to where, since when, what changed.
2. **Scope**: one host, one VLAN, one site, all? Only one service (DNS, HTTP) or all connectivity?
3. **Physical layer**: LEDs, correct cable, correct port, device powered on, modules.
4. **Interfaces**: `show ip interface brief` (up/up; administratively down; up/down), `show interfaces` (errors, duplex).
5. **VLAN**: `show vlan brief` (port in the correct VLAN; VLAN exists on *all* switches along the path).
6. **Trunks**: `show interfaces trunk` (mode, same native VLAN on both sides, allowed VLANs and "active in management domain").
7. **Addressing**: correct IP/mask, no duplicates, in the subnet of its VLAN (`ipconfig`, `show ip interface brief`).
8. **Gateway**: the host points to the correct IP and it responds (`ping <gateway>`); ARP (`show ip arp`, `arp -a`).
9. **Routing**: `show ip route` on every hop toward the destination **and back** (a missing return route is very common); `show ip protocols`, neighbors.
10. **ACL/firewall**: `show access-lists` (counters increasing), `show ip interface` (ACL applied, direction), implicit deny.
11. **Services**: DHCP (`show ip dhcp binding`, helper), DNS (resolves by IP but not by name), NAT (`show ip nat translations`).
12. **Tests**: `ping`, `traceroute`/`tracert`, extended ping with source (`ping 8.8.8.8 source g0/1`).
13. **Root cause**: explain why the symptom occurs with that cause (not just "it got fixed").
14. **Fix and verification**: apply, re-test everything affected, document (update the model).

## Commands by layer

| Layer | Commands |
|---|---|
| 1 | `show interfaces status`, `show interfaces <if>` (CRC, collisions, duplex), `show controllers` (serial: DCE/DTE and clock) |
| 2 | `show vlan brief`, `show interfaces trunk`, `show interfaces <if> switchport`, `show mac address-table`, `show spanning-tree`, `show etherchannel summary`, `show port-security`, `show cdp neighbors detail`, `show lldp neighbors` |
| 3 | `show ip interface brief`, `show ip route`, `show ip protocols`, `show ip ospf neighbor`, `show ip eigrp neighbors`, `show ip arp`, `ping`, `traceroute` |
| 4-7 | `show access-lists`, `show ip nat translations`, `show ip dhcp binding`, `show ip dhcp conflict`, `show ip ssh`, `show ntp status`, `nslookup` (PC) |
| PT hosts | `ipconfig /all`, `ipconfig /renew`, `ping`, `tracert`, `arp -a`, `nslookup` |

`debug` (e.g. `debug ip dhcp server events`, `debug ip ospf adj`) only in the lab, or with great care in production; disable with `undebug all`.

## Symptom → likely cause

| Symptom | Causes to check first |
|---|---|
| PC with 169.254.x.x | No DHCP response: pool missing, `ip helper-address` missing, VLAN/trunk not carrying the VLAN, server down |
| Ping to gateway fails, same VLAN OK | Subinterface/SVI with wrong VLAN or IP, VLAN not allowed on the trunk toward the router, router physical interface `shutdown` |
| Same VLAN across switches fails | VLAN not created on one switch, not allowed on the trunk, link in access mode, native mismatch |
| Inter-VLAN fails, gateway OK | `ip routing` missing (L3 switch), ACL, wrong host gateway, different host mask |
| Internet fails, LAN OK | Default route missing, NAT (inside/outside swapped, NAT ACL does not match), no return route at the ISP for the public IP |
| Works by IP, not by name | DNS on the host or in the DHCP pool, DNS record, DNS service off |
| OSPF neighbor does not appear | Area, subnet/mask, hello/dead, passive interface, non-matching `network`, duplicate router-id |
| Port err-disabled | Port-security (violation shutdown), BPDU guard; `show interfaces status err-disabled` |
| Intermittent / slow | Duplex mismatch, STP loop, CRC errors, EtherChannel with suspended members |
| CDP "Native VLAN mismatch" | Different native VLAN on each end of the trunk |
| SSH refused | No `ip domain-name`/RSA key, `transport input`, `login local` without a user, ACL on VTY |

## Using the toolkit to diagnose

When the user describes or pastes a network (config, `show`, screenshot):

1. Build/update the model with what is **confirmed** (mark inferred items with `confidence`).
2. `node scripts/netlab.ts validate network.net.json` → list of candidate causes with code.
3. `node scripts/netlab.ts trace network.net.json PC1 PC3` → where the path breaks (forward or return), blocking ACL, NAT applied.
4. `node scripts/netlab.ts routes network.net.json --device R1` → simulated table to compare against the real `show ip route`. **The differences between simulated and real are the clue**.
5. Propose the minimal fix, apply it to the model, re-validate and deliver the exact commands for the device.

The simulator is a model: it does not reproduce timers, STP or real ARP. Always confirm with `show` on the device.

## Validator codes and their fix

| Code | Usual fix |
|---|---|
| `TRUNK-MODE-MISMATCH` | `switchport mode trunk` on both ends |
| `NATIVE-VLAN-MISMATCH` | Same `switchport trunk native vlan` on both ends |
| `ALLOWED-VLAN-MISMATCH` / `ROAS-VLAN-NOT-ALLOWED` | `switchport trunk allowed vlan add N` (with `add`!) |
| `ROAS-ACCESS-PORT` | Switch port toward the router as trunk |
| `GW-UNREACHABLE` | VLAN of the host port, trunks along the path, subinterface/SVI for that VLAN |
| `GW-NOT-IN-SUBNET` / `SEGMENT-SUBNET-MISMATCH` | IP/mask/gateway of the host or of the interface |
| `DHCP-NO-SERVER` | Pool for that network or `ip helper-address` on the gateway |
| `DHCP-GW-NOT-EXCLUDED` | `ip dhcp excluded-address` for gateway and servers |
| `OSPF-AREA-MISMATCH` / `OSPF-PASSIVE-NEIGHBOR` | Match the area; remove `passive-interface` on router-to-router links |
| `OSPF-NO-ADJACENCY` (or EIGRP/RIP) | Add the link network to the protocol on the router that does not advertise it |
| `SERIAL-MEDIUM` / `SERIAL-NO-DCE` / `SERIAL-NO-CLOCK` / `SERIAL-CLOCK-ON-DTE` | Serial cable; `clock rate` only on the DCE end |
| `IF-NOT-IN-MODEL` | Use the model's real interface name or install the indicated module |
| `STATIC-UNRESOLVED` | Next hop must be the neighbor's IP on a connected network |
| `L3-NO-IP-ROUTING` | `ip routing` on the multilayer switch |
| `ETHERCHANNEL-MODE` | LACP active/passive, PAgP desirable/auto, or on/on |
| `ACL-UNDEFINED` | Create the ACL or fix the applied name |
| `NAT-INTERFACES` | `ip nat inside` / `ip nat outside` on the correct interfaces |
| `TEST-FAILED` | Read the reason: it gives device, interface and cause (route, ACL, L2, NAT, ASA, VPN) |
| `HSRP-VIP-MISMATCH` / `HSRP-NO-PREEMPT` | Same virtual IP in the group; `standby N preempt` on the highest-priority router |
| `STP-ROOT-UNDESIRED` / `STP-HSRP-MISALIGNED` | `spanning-tree vlan X root primary` on the core/distribution switch that is HSRP active |
| `ASA-NO-NAMEIF` / message "requires an ACL" | nameif + security-level; traffic from a lower to a higher level needs ACL + access-group |
| message "missing inspect icmp" | `policy-map global_policy` → `class inspection_default` → `inspect icmp` |
| `VPN-NO-MIRROR` / `VPN-ACL-NOT-MIRRORED` / `VPN-PSK-MISMATCH` / `VPN-IKE-MISMATCH` | Both ends mirrored: networks swapped, same key, same IKE policy and transform-set |
| `VPN-NO-ROUTE` | Route (usually the default) toward the remote networks via the crypto map interface |
| `OSPFV3-NO-RID` / `IPV6-GW-UNREACHABLE` | `router-id` under `ipv6 router ospf`; IPv6 gateway = router's link-local on that link |
| `SCHEMA-UNKNOWN-FIELD` | Misspelled field in the model (the message suggests the correct one) |

## Report format

Use `templates/troubleshooting-report.md`: problem, scope, evidence (with its source), discarded hypotheses, root cause, fix (commands), verification and prevention.
