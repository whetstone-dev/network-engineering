# Troubleshooting: {{one-line symptom}}

## 1. Problem
- What fails: {{...}}
- From / to: {{...}}
- Since when / what changed: {{...}}

## 2. Scope
{{One host, one VLAN, one site, one service...}}

## 3. Evidence
| # | Command / source | Observation | Interpretation |
|---|---|---|---|
| 1 | `show ip interface brief` (R1) | {{...}} | {{...}} |

## 4. Layer-by-layer review
| Layer | Status | Note |
|---|---|---|
| Physical | {{OK / failing / not verified}} | |
| Interfaces | | |
| VLANs / trunks | | |
| Addressing / gateway | | |
| Routing (round trip) | | |
| ACL / firewall / NAT | | |
| Services (DHCP, DNS) | | |

## 5. Discarded hypotheses
- {{Hypothesis}} — discarded because {{evidence}}.

## 6. Root cause
{{Explanation of why this cause produces exactly the symptom.}}

## 7. Fix
```
{{exact commands, per device}}
```

## 8. Verification
- {{Command}} → {{expected result}}
- Tests: {{round-trip pings}}

## 9. Prevention
- {{Process, documentation or design change; update the *.net.json model}}
