# Wireless networks (WLAN)

## Contents
- [802.11 standards](#80211-standards)
- [Bands and channels](#bands-and-channels)
- [Concepts: SSID, BSS, ESS](#concepts-ssid-bss-ess)
- [Architectures: autonomous vs lightweight + WLC](#architectures-autonomous-vs-lightweight--wlc)
- [Wireless security](#wireless-security)
- [Best practices](#best-practices)
- [Planning](#planning)
- [Integration with the wired network](#integration-with-the-wired-network)
- [Packet Tracer: wireless](#packet-tracer-wireless)
- [Wireless troubleshooting](#wireless-troubleshooting)

Tags: `[PT]` Packet Tracer, `[PT?]` unconfirmed / depends on PT version, `[HW]` real hardware only.

## 802.11 standards

| Standard | Wi-Fi name | Approx. year | Band(s) | Max. theoretical rate |
|---|---|---|---|---|
| 802.11 | — | 1997 | 2.4 GHz | 2 Mbps |
| 802.11b | — | 1999 | 2.4 GHz | 11 Mbps |
| 802.11a | — | 1999 | 5 GHz | 54 Mbps |
| 802.11g | — | 2003 | 2.4 GHz | 54 Mbps |
| 802.11n | Wi-Fi 4 | 2009 | 2.4 and 5 GHz | 600 Mbps (4 streams, 40 MHz) |
| 802.11ac | Wi-Fi 5 | 2013 | 5 GHz | ~6.9 Gbps (standard max.: 8 streams, 160 MHz; real wave 2 devices ~3.5 Gbps with 4 streams) |
| 802.11ax | Wi-Fi 6 / 6E | 2019 / 2021 | 2.4, 5 (+6 GHz on 6E) | ~9.6 Gbps |
| 802.11be | Wi-Fi 7 | 2024 | 2.4, 5, 6 GHz | ~46 Gbps (theoretical) |

- Rates are theoretical PHY maximums; real throughput is usually less than half (shared medium, half-duplex, CSMA/CA, overhead).
- Key technologies: MIMO (11n), downlink MU-MIMO (11ac wave 2), OFDMA + BSS coloring + TWT (11ax).

## Bands and channels

| Band | Range | Interference | Non-overlapping channels (20 MHz) | Notes |
|---|---|---|---|---|
| 2.4 GHz | Longer, better wall penetration | High (Bluetooth, microwaves, neighbors) | 1, 6, 11 (Americas). Some regions allow 1/5/9/13: check local regulations | Only 3 usable channels; avoid 40 MHz |
| 5 GHz | Shorter | Low | ~20–25 depending on country (UNII-1/2/2e/3) | DFS channels may change if radar is detected |
| 6 GHz | Shorter still | Very low | Up to 59 20-MHz channels (depending on regulation) | Wi-Fi 6E/7 only; WPA3 or OWE mandatory |

- Channel width: 20/40/80/160 (and 320 MHz on Wi-Fi 7). Wider = more speed but fewer independent channels.
- Production: 2.4 GHz at 20 MHz; 5 GHz at 20 or 40 MHz in high density, 80 MHz in low density.

## Concepts: SSID, BSS, ESS

| Term | Meaning |
|---|---|
| SSID | Logical network name (up to 32 characters). Hiding it is NOT security |
| BSS | One AP + its associated clients |
| BSSID | MAC of the AP radio/SSID that identifies the BSS |
| ESS | Several BSSs with the same SSID joined by a distribution system (wired LAN); enables roaming |
| IBSS | Ad hoc, no AP |
| SSID↔VLAN mapping | Each SSID maps to a VLAN on the wired side (AP on a trunk, or WLC with dynamic interfaces) |

## Architectures: autonomous vs lightweight + WLC

| Aspect | Autonomous AP | Lightweight AP (LAP) + WLC |
|---|---|---|
| Configuration | Per AP | Centralized on the WLC |
| Protocol | — | CAPWAP (UDP 5246 control encrypted with DTLS, UDP 5247 data) |
| Functions | Everything on the AP | Split-MAC: real-time on the AP; authentication, roaming, RRM, policies on the WLC |
| Scale | Few APs | Tens to thousands |
| Switch port | Trunk if it serves several VLANs | Access (local mode: data tunneled to the WLC) |
| Variants | — | FlexConnect (local switching at the branch), cloud-managed (e.g. Meraki) |

- WLC discovery by the LAP: L2 broadcast on the same subnet, DHCP option 43, DNS (`CISCO-CAPWAP-CONTROLLER.<domain>`), or pre-configuration.
- The WLC port toward the switch is normally a trunk (dynamic interfaces = one VLAN per WLAN).

## Wireless security

| Method | Encryption | Authentication | Status |
|---|---|---|---|
| Open | None | None | Only with captive portal/isolation (guests) |
| OWE (Enhanced Open) | AES | None (opportunistic encryption) | Modern alternative to Open |
| WEP | RC4 | Shared key | **Obsolete, broken in minutes. Do not use** |
| WPA | TKIP (RC4) | PSK or 802.1X | Obsolete |
| WPA2-Personal (PSK) | AES-CCMP | Shared passphrase | Acceptable for home/SMB with a strong key |
| WPA2-Enterprise | AES-CCMP | 802.1X/EAP with RADIUS server (e.g. Cisco ISE) | Corporate standard |
| WPA3-Personal | AES (CCMP/GCMP) | SAE (resistant to offline dictionary attacks) | Recommended |
| WPA3-Enterprise | AES (optional 192-bit mode) | 802.1X/EAP + RADIUS | Recommended for corporate |

- 802.1X: supplicant (client) ↔ authenticator (AP/WLC) ↔ authentication server (RADIUS, UDP 1812/1813).
- WPA2/WPA3 transition mode for compatibility with legacy clients.

## Best practices

- Do not use WEP or TKIP; AES (CCMP) at minimum, WPA3 when all clients support it.
- Guest SSID on a separate VLAN, with ACL/firewall allowing Internet only; client isolation (client/peer-to-peer isolation).
- Corporate: WPA2/WPA3-Enterprise with RADIUS, not a PSK shared among employees.
- Few SSIDs (each SSID generates beacons and consumes airtime; rule of thumb ≤ 3–4 per radio).
- AP/WLC management on the management VLAN, not on the user VLAN.
- Change default credentials on home APs/routers and disable WPS.
- **Lab**: WPA2-PSK with AES is enough; document SSID, key and VLAN. **Production**: Enterprise + segmentation + rogue AP monitoring.

## Planning

- **Site survey**: predictive (software over floor plans) and/or passive/active on site; measure RSSI (typical target ≥ -67 dBm for voice/data), SNR (≥ 25 dB) and cell overlap (~15–20 % for roaming).
- **Co-channel interference (CCI)**: nearby APs on the same channel share airtime. Alternate 1/6/11 on 2.4 GHz and do not reuse channels in adjacent cells.
- **Adjacent channel interference**: use non-overlapping channels (not 1/3/6).
- **Power**: more power is not better; large cells create "sticky" clients and asymmetry (the client transmits with less power than the AP). In high density: more APs, less power.
- Consider materials (concrete, glass, metal), user density, applications (voice needs more coverage) and PoE available on the switch.
- With a WLC: RRM (Radio Resource Management) adjusts channel and power automatically.

## Integration with the wired network

Example: corporate WLAN on VLAN 10 (192.0.2.0/24), guests on VLAN 30 (198.51.100.0/24), AP/WLC management on VLAN 99 (203.0.113.0/24).

```
! Port toward a LAP in local mode: access on the AP management VLAN (+ PoE if applicable)
SW1(config)# interface gi1/0/10
SW1(config-if)# switchport mode access
SW1(config-if)# switchport access vlan 99
SW1(config-if)# spanning-tree portfast
! Port toward the WLC (or autonomous AP with several SSIDs): trunk with the WLAN VLANs
SW1(config)# interface gi1/0/24
SW1(config-if)# switchport mode trunk
SW1(config-if)# switchport trunk allowed vlan 10,30,99
! DHCP pool for the LAPs with option 43 pointing to WLC 203.0.113.10 [IOS][PT?]
R1(config)# ip dhcp pool APS
R1(dhcp-config)# network 203.0.113.0 255.255.255.0
R1(dhcp-config)# default-router 203.0.113.1
R1(dhcp-config)# option 43 hex f104cb00710a
```
- Option 43 (Cisco format, TLV): `f1` + length (`04` × number of WLCs) + IP of each WLC in hex. 203.0.113.10 → cb.00.71.0a → `f104cb00710a`. Check option 43 support in your PT version.
- If DHCP is on another VLAN: `ip helper-address` on the SVI/subinterface (see `references/routing.md`).
- The guest VLAN must not have a route to internal networks: ACL on the SVI or firewall.

## Packet Tracer: wireless

| PT device | Configuration | Notes |
|---|---|---|
| AccessPoint-PT (also -A, -N, -AC depending on version) | Config tab > **Port 1** (radio): SSID, channel, authentication (Disabled/WEP/WPA-PSK/WPA2-PSK...), encryption (AES/TKIP), passphrase | Configured via GUI, not CLI. Port 0 = Ethernet toward the switch. Acts as a bridge (does not provide DHCP) [PT] |
| WRT300N / HomeRouter-PT (-AC) | **GUI** tab: Setup > Internet Setup (DHCP / Static IP / PPPoE on the Internet port), Network Setup (LAN IP, DHCP server: start IP, number of users), Wireless > Basic Wireless Settings (mode, SSID, channel), Wireless Security (WPA2 Personal, AES, passphrase) | Home router with NAT and DHCP. Typical default LAN IP 192.168.0.1: check in your PT version. Save with "Save Settings" on each screen [PT] |
| Laptop-PT | Physical tab: **power off the device**, remove the Ethernet module (PT-LAPTOP-NM-1CFE), drag in a wireless module (e.g. **WPC300N**), power on | It will not let you change the module without powering off [PT] |
| PC-PT | Same: power off, remove the NIC, install a wireless module (e.g. WMP300N) | [PT] |
| Client connection | **Desktop > PC Wireless** (with Linksys modules): Connect, pick the SSID, enter the key. Alternative: Config > Wireless0 (SSID, authentication, key, DHCP/static IP) | Then check the IP in Desktop > IP Configuration or `ipconfig` [PT] |
| WLC-2504 (also WLC-PT/3504 depending on version) | Web GUI from a PC on the management network; configure interfaces, WLANs (SSID, security, interface/VLAN) | `[PT?]` availability and options vary by PT version (≥ 7.x) |
| LAP (e.g. LAP-PT, 3702i) | Requires power (PoE or adapter in Physical), IP via DHCP and reachability to the WLC (same subnet or DHCP option 43) | `[PT?]` check per version; joining the WLC may take a while |

Typical lab flow with AccessPoint-PT:
1. Switch with user VLAN + router/DHCP server for that VLAN.
2. AccessPoint-PT Port 0 → switch access port on the user VLAN.
3. Port 1: SSID `LAB-WIFI`, channel 1/6/11, WPA2-PSK + AES, passphrase ≥ 8 characters.
4. Laptop with WPC300N → PC Wireless → connect → verify DHCP IP and `ping` the gateway.

## Wireless troubleshooting

| Symptom | Check |
|---|---|
| Client does not see the SSID | Compatible band (2.4 GHz module vs 5 GHz-only AP, e.g. AccessPoint-PT-A), SSID broadcast enabled, radio on, distance/range (in PT the range is shown as a circle; move the device closer) |
| Sees the SSID but does not associate | Same authentication and encryption type on AP and client (WPA2-PSK/AES vs TKIP), exact passphrase (case-sensitive) |
| Associates but gets IP 169.254.x.x | DHCP: server/pool exists, `ip helper-address` if DHCP is on another VLAN, correct VLAN on the AP port (see `references/routing.md` / `references/troubleshooting.md`) |
| Correct IP but no access to other networks | DHCP pool gateway, inter-VLAN routing, ACLs, NAT on the router |
| SSID on the wrong VLAN | Autonomous AP port (access vs trunk) or WLAN→interface mapping on the WLC |
| Slowness / disconnects | Congested or overlapping channel (use 1/6/11), co-channel interference, power, distant client using low rates |
| LAP does not join the WLC | Power/PoE, LAP IP, L3 reachability to the WLC, option 43, version/compatibility [PT?] |

Practical order: physical/radio layer (range, band, channel) → association (SSID, security) → IP (DHCP, VLAN) → L3 connectivity (gateway, routing). For the general methodology see `references/troubleshooting.md`; PT details in `references/packet-tracer.md`.
