# Lab mode and educational mode

## Contents
- [Detecting the mode](#detecting-the-mode)
- [Generating a lab](#generating-a-lab)
- [Levels](#levels)
- [Base lab catalog](#base-lab-catalog)
- [Step-by-step educational mode](#step-by-step-educational-mode)
- [Comprehension questions](#comprehension-questions)
- [Troubleshooting labs](#troubleshooting-labs)

## Detecting the mode

- **Lab**: "create a lab / exercise / practice / activity for me". Full deliverable with optional solution.
- **Educational**: the user is learning ("I don't understand", "explain it to me", "I'm a student", "step by step"). Do not deliver only the final configuration: explain what, why, what problem it solves, the command, the expected result and how to verify it.
- If the level is unclear, assume BEGINNER for students and ask only if it changes the result significantly.

## Generating a lab

1. Design the model (`meta.level`, `meta.target: "packet-tracer"`), including `tests` that demonstrate the objective (and `expect: "fail"` for isolation).
2. `validate` → 0 errors. `build` → diagram, configs (solution) and documentation.
3. Write the lab handout with `templates/lab.md`:
   - Objective and scenario · Prerequisites · Topology (diagram + connection table)
   - Devices (PT model and modules) · VLAN and addressing tables
   - Instructions in parts (without revealing commands at ADVANCED)
   - Expected tests · Questions · Solution (generated configs) separated at the end or in a separate file
4. For the student, you can deliver the model **without** configs (only `topology.html` + handout) and the solution in `configs/`.

## Levels

| Level | Typical scope | How it is guided |
|---|---|---|
| BEGINNER | 1 router, 1-2 switches, 2-3 VLANs, ROAS, DHCP on the router, static routes | Full commands with line-by-line explanation; verification after each step |
| INTERMEDIATE | L3 switch with SVIs, single-area OSPF, DHCP relay, NAT/PAT, standard/extended ACLs, EtherChannel, port-security | Hints on what to configure; key commands only as hints |
| ADVANCED | Multi-area OSPF or EIGRP + redistribution, HSRP, IPv6 dual-stack, IPsec/GRE VPN, ZBF/ASA, VLSM addressing design by the student | Only requirements and acceptance criteria (tests); the student designs |

## Base lab catalog

| Lab | Suggested base |
|---|---|
| VLAN + trunk + router-on-a-stick + DHCP | `examples/pt-3vlan-roas-dhcp.net.json` |
| Collapsed-core campus with OSPF, NAT, relay, guest ACL, EtherChannel | `examples/campus-ospf-nat.net.json` |
| VLAN/trunk/DHCP troubleshooting | `examples/troubleshooting-broken-lab.net.json` |
| Serial WAN between sites with OSPF | `examples/wan-2sites-ospf-serial.net.json` |
| Redundancy: HSRP + per-VLAN STP + EtherChannel + EIGRP | `examples/campus-hsrp-stp-eigrp.net.json` |
| ASA firewall with DMZ, static NAT and ACL | `examples/asa-dmz.net.json` |
| Site-to-site IPsec VPN + IPv6/OSPFv3 | `examples/vpn-ipsec-ospfv3.net.json` |
| Static and default routes between 3 routers | Start from the WAN example and replace OSPF with `routing.static` |
| Multi-area OSPF / EIGRP | New model; `tests` between endpoints |
| IPv6 dual-stack / SLAAC | Interfaces with `ipv6` and `linkLocal`; see `references/ipv6.md` |
| L2 security (port-security, BPDU guard, blackhole VLAN) | Start from `pt-3vlan-roas-dhcp` |

When reusing an example, change names, addressing and details: every new lab must be its own.

## Step-by-step educational mode

Per-step format (real configuration, no skipped steps):

```
STEP 1 — Create the VLANs
What we do: create VLANs 10, 20 and 30 on SW1 and SW2.
Why: a switch only switches frames for VLANs that exist in its database;
     without them, the assigned ports would stay inactive.
Commands (SW1 and SW2):
  vlan 10
   name SALES
Expected result: show vlan brief lists SALES as "active".
Verification: show vlan brief
Common mistake: creating the VLAN on only one switch → hosts in that VLAN cannot see each other across switches.
```

Typical sequence: STEP 1 Create VLANs → 2 Assign ports → 3 Configure trunk → 4 Inter-VLAN routing → 5 DHCP → 6 Verify (pings and `show`). Use brief analogies only if they help; end each step with its verification, not at the end.

Always distinguish **lab vs production**: "in the lab we use `cisco` as the password; in production, a strong `enable secret` and SSH with local users or AAA".

## Comprehension questions

Include 4-6 questions that require reasoning, not memorization:
- "What would happen if VLAN 20 were not allowed on the SW1–R1 trunk? Which ping would fail and which would not?"
- "Why does the subinterface need `encapsulation dot1Q` before the IP?"
- "What changes if you move the DHCP server to another subnet?"
Give the answers in the solution section.

## Troubleshooting labs

1. Build the correct network and validate (0 errors).
2. Copy the model and introduce 3-6 realistic faults across different layers (cable/port, VLAN, trunk, IP/gateway, routing, ACL, DHCP).
3. `validate` on the broken version must detect every fault (if one is not detected, explain it yourself in the solution).
4. Deliver to the student: observable symptoms and objective; the solution lists fault → evidence (`show`) → fix.
