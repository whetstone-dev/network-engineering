# Ejemplos validados

Cada `*.net.json` es un modelo completo. Los `.html` de `rendered/` son sus diagramas interactivos (abrir con doble clic).

| Modelo | Nivel | Qué demuestra | Estado |
|---|---|---|---|
| `pt-3vlan-roas-dhcp.net.json` | Beginner | 1 router 2911 + 2 switches 2960, 3 VLAN + gestión + nativa sin uso, router-on-a-stick, DHCP en el router, SSH | 0 errores · 4/4 pruebas |
| `campus-ospf-nat.net.json` | Advanced | Borde ISR4331 con PAT y default por OSPF, core 3650 (SVI, `ip routing`, relay DHCP), EtherChannel LACP, Server-PT DHCP/DNS/Web, ACL de invitados, Wi-Fi, zonas | 0 errores · 6/6 pruebas (incluye un aislamiento esperado) |
| `wan-2sedes-ospf-serial.net.json` | Intermediate | Dos sedes unidas por serial (HWIC-2T, DCE con clock rate), OSPF área 0 con costo real (`[110/65]`), ROAS y DHCP por sede, zonas por sitio | 0 errores · 6/6 pruebas |
| `campus-hsrp-stp-eigrp.net.json` | Advanced | Dos distribuciones 3560 con HSRP por VLAN y root de STP alineado, accesos con doble uplink (STP bloquea un camino por VLAN), EtherChannel LACP, EIGRP con métrica compuesta, PAT | 0 errores · 4/4 pruebas |
| `asa-dmz.net.json` | Advanced | ASA 5506-X con outside/inside/dmz, PAT, NAT estática del web server, ACL de entrada, DHCP e inspect icmp; pruebas de aislamiento por nivel de seguridad | 0 errores · 5/5 pruebas |
| `vpn-ipsec-ospfv3.net.json` | Advanced | VPN IPsec site-to-site con exención de NAT; OSPFv2 propaga la default y OSPFv3 enruta IPv6 en la sede central | 0 errores · 4/4 pruebas |
| `troubleshooting-broken-lab.net.json` | Intermediate | La red beginner con 5 fallas intencionales para practicar diagnóstico | 10 errores detectados |

`rendered/diff-lab-vs-broken.html` muestra `netlab diff` entre la red sana y la rota (pestaña **Cambios**). Botón **L3** en cualquier diagrama: vista lógica de routers y subredes.

```bash
node scripts/netlab.ts validate examples/troubleshooting-broken-lab.net.json
node scripts/netlab.ts build examples/campus-ospf-nat.net.json -o salida/campus
node scripts/netlab.ts trace examples/campus-ospf-nat.net.json LAP-INV 8.8.8.8
node scripts/netlab.ts trace examples/vpn-ipsec-ospfv3.net.json BR-PC HQ-SRV
node scripts/netlab.ts routes examples/vpn-ipsec-ospfv3.net.json --ipv6
node scripts/netlab.ts diff examples/pt-3vlan-roas-dhcp.net.json examples/troubleshooting-broken-lab.net.json -o cambios.html
node scripts/netlab.ts import scripts/test/fixtures -o importado.net.json
```

## Solución del laboratorio de troubleshooting

| # | Falla | Síntoma | Evidencia en el equipo | Corrección |
|---|---|---|---|---|
| 1 | Trunk SW1→R1 no permite VLAN 30 | PC5 (TI) no obtiene IP (169.254.x.x) | `show interfaces trunk` en SW1: VLAN 30 ausente en Gi0/1 | `interface g0/1` → `switchport trunk allowed vlan add 30` |
| 2 | SW2 Gi0/1 con nativa 1 (SW1 usa 999) | Mensajes CDP "Native VLAN mismatch" | `show interfaces trunk` en ambos | En SW2: `switchport trunk native vlan 999` |
| 3 | PC4 con gateway 192.168.2.1 | PC4 no sale de su red | `ipconfig` en PC4 | Gateway 192.168.20.1 |
| 4 | PC3 (IP de VLAN 10) en puerto Fa0/13 (VLAN 20) | PC3 no alcanza a nadie de VENTAS | `show vlan brief` en SW2 | Mover el cable a Fa0/1-10 o asignar `switchport access vlan 10` |
| 5 | Pool TI con `default-router 192.168.3.1` | Hosts de TI sin salida aunque reciban IP | `show running-config \| section dhcp` en R1 | `ip dhcp pool TI` → `default-router 192.168.30.1` |

Nota: con la falla 1 activa, la 5 queda oculta (PC5 ni siquiera recibe IP); es un buen ejemplo de por qué se corrige y se vuelve a probar de a una falla.
