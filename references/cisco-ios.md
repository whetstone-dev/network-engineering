# Cisco IOS / IOS XE — conventions and anti-hallucination policy

## Contents
- [Command accuracy policy](#command-accuracy-policy)
- [Support tags](#support-tags)
- [CLI modes](#cli-modes)
- [IOS vs IOS XE vs Packet Tracer](#ios-vs-ios-xe-vs-packet-tracer)
- [Interface names by platform](#interface-names-by-platform)
- [Base device template](#base-device-template)
- [Correct configuration order](#correct-configuration-order)
- [Essential verification commands](#essential-verification-commands)
- [Save, erase and recover](#save-erase-and-recover)
- [Common syntax errors](#common-syntax-errors)

## Command accuracy policy

1. **Prefer generating with `netlab config`**: the generator only emits standard, already-reviewed commands.
2. If you write commands by hand, use only those that appear in these references or that you know with certainty. If you are not sure of the exact syntax, of a parameter, or that the platform supports it, **say so** ("verify with `?` in the CLI") instead of presenting it as certain.
3. Never invent keywords, options or `show` output. Sample output must be marked as **illustrative**.
4. Always state the platform: a command that is correct on IOS XE may not exist on a 2960 or in Packet Tracer.
5. Anything the model does not cover goes into `extraConfig` and is reported as unverified.

## Support tags

| Tag | Meaning |
|---|---|
| `[PT]` | Works in Cisco Packet Tracer (8.x) |
| `[PT?]` | PT support unconfirmed or version-dependent: verify |
| `[IOS]` | Classic IOS 15.x (ISR G2: 1941/2901/2911, Catalyst 2960/3560) |
| `[XE]` | IOS XE (ISR 4000, Catalyst 3650/3850/9000) |
| `[HW]` | Requires real hardware/software; does not exist or does not work in PT |

## CLI modes

| Prompt | Mode | Enter | Exit |
|---|---|---|---|
| `R1>` | User EXEC | login | `exit` |
| `R1#` | Privileged EXEC | `enable` | `disable` |
| `R1(config)#` | Global configuration | `configure terminal` | `end` / Ctrl+Z |
| `R1(config-if)#` | Interface | `interface g0/0` | `exit` |
| `R1(config-subif)#` | Subinterface | `interface g0/0.10` | `exit` |
| `R1(config-if-range)#` | Range | `interface range f0/1 - 10` | `exit` |
| `R1(config-line)#` | Line | `line vty 0 4` | `exit` |
| `R1(config-router)#` | Protocol | `router ospf 1` | `exit` |
| `R1(dhcp-config)#` | DHCP pool | `ip dhcp pool X` | `exit` |
| `R1(config-ext-nacl)#` | Named ACL | `ip access-list extended X` | `exit` |

From configuration mode, EXEC commands run with `do` (e.g. `do show ip interface brief`) `[PT]`.

## IOS vs IOS XE vs Packet Tracer

| Topic | IOS 15 (ISR G2 / 2960 / 3560) | IOS XE (ISR 4000 / 3650 / 9000) | Packet Tracer |
|---|---|---|---|
| Interface names | `Gi0/0`, `Fa0/1` | `Gi0/0/0` (ISR4k), `Gi1/0/1` (3650) | Same as the emulated model |
| `switchport trunk encapsulation dot1q` | Required on 3560/3750; does not exist on 2960 | 3650/3850: dot1q only, usually does not exist — verify | Same as the model |
| Routing on a switch | 3560: `ip routing` | `ip routing` | `[PT]` on 3560/3650 |
| Licensing | `license boot module ... securityk9` for IPsec/ZBF | Smart licensing `[HW]` | `[PT]` on 2911 (requires reload) |
| `show running-config | section X` | Yes | Yes | `[PT?]` (partial pipe support) |
| `write memory` / `copy run start` | Yes | Yes | `[PT]` |
| `ip ospf <pid> area <a>` on interface | Yes | Yes | `[PT?]` → prefer `network ... area` |
| SNMPv3, NetFlow, EEM, `archive` | Yes | Yes | `[HW]` |

## Interface names by platform

Use `node scripts/netlab.ts catalog <model>`. Summary:

| Model | Built-in interfaces |
|---|---|
| 1841 / 2811 | `FastEthernet0/0-1` |
| 1941 / 2901 | `GigabitEthernet0/0-1` |
| 2911 | `GigabitEthernet0/0-2` |
| ISR4321 / ISR4331 | `GigabitEthernet0/0/0-1` / `0/0/0-2` |
| 2960-24TT | `FastEthernet0/1-24`, `GigabitEthernet0/1-2` |
| 3560-24PS | `FastEthernet0/1-24`, `GigabitEthernet0/1-2` |
| 3650-24PS | `GigabitEthernet1/0/1-24`, `GigabitEthernet1/1/1-4` |
| PC-PT / Server-PT / Laptop-PT | `FastEthernet0` (Laptop with Wi-Fi module: `Wireless0`) |

Serial: HWIC-2T module on ISR G2 → `Serial0/0/0-1`; NIM-2T on ISR4k → `Serial0/1/0-1`. Install with the device **powered off**.

## Base device template

```
enable
configure terminal
hostname R1
no ip domain-lookup
enable secret <SECRET>
service password-encryption
banner motd #Authorized personnel only#
line console 0
 password <SECRET>
 login
 logging synchronous
exit
```
`no ip domain-lookup` avoids the wait when a command is mistyped (in labs). In production, if DNS is used for name resolution, do not disable it: configure `ip name-server`.

## Correct configuration order

1. Hostname, basic security.
2. VLANs (on switches) **before** assigning them to ports.
3. ACLs **before** applying them (`ip access-group`): an ACL applied without being defined filters nothing in IOS (permits everything); behavior varies in some versions — do not leave it that way.
4. Interfaces: on subinterfaces, `encapsulation dot1Q` **before** `ip address`; on 3560 trunks, `encapsulation` **before** `mode trunk`.
5. EtherChannel: members with `channel-group`, then `interface Port-channel`.
6. Routing, services (DHCP, NAT), VTY/SSH lines (hostname and `ip domain-name` must exist before `crypto key generate rsa`).
7. `end`, then run the relevant verification commands and connectivity tests. Save separately with `write memory` only after successful observed verification and within the user's authorization.

## Essential verification commands

| Goal | Command |
|---|---|
| L1/L2 and L3 status summary | `show ip interface brief` |
| Interface detail (errors, duplex) | `show interfaces g0/0` |
| VLANs and ports | `show vlan brief` |
| Trunks (mode, native, allowed, active) | `show interfaces trunk` |
| Administrative/operational mode of a port | `show interfaces f0/1 switchport` |
| MAC table | `show mac address-table` |
| STP | `show spanning-tree [vlan N]` |
| Neighbors | `show cdp neighbors [detail]`, `show lldp neighbors` |
| Routing | `show ip route`, `show ip protocols` |
| OSPF | `show ip ospf neighbor`, `show ip ospf interface brief` |
| DHCP | `show ip dhcp binding`, `show ip dhcp pool` |
| NAT | `show ip nat translations`, `show ip nat statistics` |
| ACL (counters) | `show access-lists` |
| Config | `show running-config`, `show startup-config` |

Output is never invented: if sample output is shown, it must be labeled "illustrative output".

## Save, erase and recover

- Save: `copy running-config startup-config` (asks to confirm the filename: Enter) or `write memory` (no prompts; better for pasting in bulk).
- Erase config: `erase startup-config` + `reload`. On switches, the VLAN database is in `flash:vlan.dat` (`delete vlan.dat`).
- Password recovery: requires physical access (configuration register `0x2142` on routers) `[HW]`; PT has a partial procedure `[PT?]`.

## Common syntax errors

| IOS message (paraphrased) | Cause |
|---|---|
| `% Invalid input detected at '^' marker.` | Command does not exist in that mode or on that platform |
| `% Incomplete command.` | Missing parameters |
| `% Ambiguous command` | Abbreviation too short |
| `... overlaps with ...` | Two interfaces on the same device in overlapping subnets |
| `Bad mask` / `Inconsistent address and mask` | Invalid mask, or network with host bits set in `ip route`/`network` |
| `Command rejected: ... is a dynamic port` | `port-security` on a port without `switchport mode access` |
| `% Access VLAN does not exist. Creating vlan X` | Warning (not an error): IOS creates the VLAN when assigning it |
