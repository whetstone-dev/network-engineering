// Toolkit tests. Run: node --test scripts/test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NetworkModel } from '../lib/model.ts'
import { analyze } from '../lib/validate.ts'
import { eui64, formatIpv6, parseIpv6, splitIpv6, subnetInfo, vlsm } from '../lib/ip.ts'
import { expandRange, normalizeIfName, shortIfName } from '../lib/names.ts'
import { generateConfig } from '../lib/ios.ts'
import { renderHtml } from '../lib/render.ts'
import { buildDocs } from '../lib/docs.ts'
import { toMermaid } from '../lib/mermaid.ts'
import { tracePing } from '../lib/trace.ts'

const EJ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples')
const cargar = (n: string): NetworkModel => JSON.parse(readFileSync(join(EJ, n), 'utf8'))
const codigos = (m: NetworkModel): string[] => analyze(m).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)

test('IPv4: subnetInfo computes network, broadcast and hosts', () => {
  const s = subnetInfo('172.16.5.77/27')
  assert.equal(s.network, '172.16.5.64')
  assert.equal(s.broadcast, '172.16.5.95')
  assert.equal(s.firstHost, '172.16.5.65')
  assert.equal(s.lastHost, '172.16.5.94')
  assert.equal(s.usableHosts, 30)
  assert.equal(s.wildcard, '0.0.0.31')
  assert.equal(subnetInfo('10.0.0.0 255.255.255.252').usableHosts, 2)
  assert.throws(() => subnetInfo('300.1.1.1/24'))
})

test('IPv4: VLSM allocates largest first and aligns blocks', () => {
  const r = vlsm('192.168.0.0/24', [{ name: 'WAN', hosts: 2 }, { name: 'A', hosts: 60 }, { name: 'B', hosts: 25 }])
  assert.deepEqual(r.map((x) => x.cidr), ['192.168.0.0/26', '192.168.0.64/27', '192.168.0.96/30'])
  assert.throws(() => vlsm('192.168.0.0/28', [{ name: 'X', hosts: 100 }]))
})

test('IPv6: RFC 5952 compression, subnetting and EUI-64', () => {
  assert.equal(formatIpv6(parseIpv6('2001:0db8:0000:0000:0000:ff00:0042:8329')!), '2001:db8::ff00:42:8329')
  assert.equal(formatIpv6(parseIpv6('fe80::1')!), 'fe80::1')
  assert.deepEqual(splitIpv6('2001:db8:acad::/48', 64, 2), ['2001:db8:acad::/64', '2001:db8:acad:1::/64'])
  assert.equal(eui64('00:1A:2B:3C:4D:5E', '2001:db8:acad:10::/64'), '2001:db8:acad:10:21a:2bff:fe3c:4d5e/64')
})

test('Interface names: abbreviations and ranges', () => {
  assert.equal(normalizeIfName('gi0/0/1'), 'GigabitEthernet0/0/1')
  assert.equal(normalizeIfName('Fa0/1'), 'FastEthernet0/1')
  assert.equal(shortIfName('GigabitEthernet0/0.10'), 'Gi0/0.10')
  assert.equal(expandRange('FastEthernet0/1-3').length, 3)
  assert.deepEqual(expandRange('Port-channel1'), ['Port-channel1'])
})

test('PT 3-VLAN example: no errors and every test passes', () => {
  const a = analyze(cargar('pt-3vlan-roas-dhcp.net.json'))
  assert.equal(a.counts.error, 0, JSON.stringify(a.diagnostics.filter((d) => d.severity === 'error')))
  assert.ok(a.tests.length > 0 && a.tests.every((t) => t.passed === true))
})

test('Campus example: OSPF default propagation, PAT and guest ACL', () => {
  const m = cargar('campus-ospf-nat.net.json')
  const a = analyze(m)
  assert.equal(a.counts.error, 0, JSON.stringify(a.diagnostics.filter((d) => d.severity === 'error')))
  assert.ok(a.tests.every((t) => t.passed === true))
  assert.ok(a.ctx.tables.get('CORE')!.some((r) => r.proto === 'O*' && r.prefix === 0))
  const t = tracePing(a.ctx, m, 'LAP-GUEST', 'SRV-WEB')
  assert.equal(t.status, 'fail')
  assert.match(t.reason, /GUESTS-IN/)
})

test('Every healthy example validates with no errors and passing tests', () => {
  for (const f of readdirSync(EJ).filter((x) => x.endsWith('.net.json') && !x.includes('broken'))) {
    const a = analyze(cargar(f))
    assert.equal(a.counts.error, 0, `${f}: ${a.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code).join(',')}`)
    assert.ok(a.tests.every((t) => t.passed === true), `${f}: failing tests`)
  }
})

test('Broken lab: detects the 5 root causes', () => {
  const c = codigos(cargar('troubleshooting-broken-lab.net.json'))
  for (const esperado of ['ROAS-VLAN-NOT-ALLOWED', 'NATIVE-VLAN-MISMATCH', 'GW-UNREACHABLE', 'GW-NOT-IN-SUBNET', 'DHCP-GW-OUTSIDE']) {
    assert.ok(c.includes(esperado), `missing ${esperado} in ${c.join(',')}`)
  }
})

test('Validator: trunk vs access, duplicate IP and incompatible EtherChannel', () => {
  const m: NetworkModel = {
    modelVersion: 1, meta: { name: 't' },
    devices: [
      { id: 'S1', type: 'switch', interfaces: [{ name: 'Gi0/1', mode: 'trunk' }, { name: 'Gi0/2', mode: 'access', channelGroup: { id: 1, mode: 'passive' } }, { name: 'Vlan1', ip: '10.0.0.1/24' }] },
      { id: 'S2', type: 'switch', interfaces: [{ name: 'Gi0/1', mode: 'access' }, { name: 'Gi0/2', mode: 'access', channelGroup: { id: 1, mode: 'passive' } }, { name: 'Vlan1', ip: '10.0.0.1/24' }] },
    ],
    links: [{ a: 'S1:Gi0/1', b: 'S2:Gi0/1' }, { a: 'S1:Gi0/2', b: 'S2:Gi0/2' }],
  }
  const c = codigos(m)
  for (const e of ['TRUNK-MODE-MISMATCH', 'IP-DUP', 'ETHERCHANNEL-MODE']) assert.ok(c.includes(e), `missing ${e}`)
})

test('Validator: undefined ACL, OSPF area mismatch and static route with unreachable next hop', () => {
  const m: NetworkModel = {
    modelVersion: 1, meta: { name: 't' },
    devices: [
      { id: 'R1', type: 'router', interfaces: [{ name: 'Gi0/0', ip: '10.0.12.1/30', acl: { in: 'NOEXISTE' } }], routing: { ospf: { networks: [{ prefix: '10.0.12.0/30', area: 0 }] }, static: [{ prefix: '8.8.8.0/24', nextHop: '172.16.0.1' }] } },
      { id: 'R2', type: 'router', interfaces: [{ name: 'Gi0/0', ip: '10.0.12.2/30' }], routing: { ospf: { networks: [{ prefix: '10.0.12.0/30', area: 1 }] } } },
    ],
    links: [{ a: 'R1:Gi0/0', b: 'R2:Gi0/0' }],
  }
  const a = analyze(m)
  const c = a.diagnostics.map((d) => d.code)
  for (const e of ['ACL-UNDEFINED', 'OSPF-AREA-MISMATCH', 'STATIC-UNRESOLVED']) assert.ok(c.includes(e), `missing ${e}`)
})

test('Serial WAN: real OSPF cost, wrong cable and OSPF on one end only', () => {
  const base = (): NetworkModel => ({
    modelVersion: 1, meta: { name: 'wan' },
    devices: [
      { id: 'R1', type: 'router', model: '2911', interfaces: [{ name: 'Serial0/0/0', ip: '10.0.0.1/30', clockRate: 64000 }, { name: 'Gi0/0', ip: '10.1.0.1/24' }],
        routing: { ospf: { routerId: '1.1.1.1', networks: [{ prefix: '10.0.0.0/30', area: 0 }, { prefix: '10.1.0.0/24', area: 0 }] } } },
      { id: 'R2', type: 'router', model: '2911', interfaces: [{ name: 'Serial0/0/0', ip: '10.0.0.2/30' }, { name: 'Gi0/0', ip: '10.2.0.1/24' }],
        routing: { ospf: { routerId: '2.2.2.2', networks: [{ prefix: '10.0.0.0/30', area: 0 }, { prefix: '10.2.0.0/24', area: 0 }] } } },
    ],
    links: [{ a: 'R1:Serial0/0/0', b: 'R2:Serial0/0/0', medium: 'serial', dce: 'a' }],
  })
  const ok = analyze(base())
  assert.equal(ok.counts.error, 0)
  const r = ok.ctx.tables.get('R1')!.find((x) => x.proto === 'O')!
  assert.equal(r.metric, 65, 'serial (64) + LAN Gigabit (1)')
  const cobre = base(); cobre.links[0].medium = 'copper-cross'
  assert.ok(codigos(cobre).includes('SERIAL-MEDIUM'))
  const sinRed = base(); sinRed.devices[1].routing!.ospf!.networks = [{ prefix: '10.2.0.0/24', area: 0 }]
  assert.ok(codigos(sinRed).includes('OSPF-NO-ADJACENCY'))
})

test('IOS generator: router-on-a-stick, 2960 and 3560 switches', () => {
  const m = cargar('pt-3vlan-roas-dhcp.net.json')
  const r1 = generateConfig(m, m.devices.find((d) => d.id === 'R1')!).text
  assert.match(r1, /interface GigabitEthernet0\/0\.10\n description .*\n encapsulation dot1Q 10\n ip address 192\.168\.10\.1 255\.255\.255\.0/)
  assert.match(r1, /ip dhcp excluded-address 192\.168\.10\.1 192\.168\.10\.10/)
  assert.match(r1, /crypto key generate rsa general-keys modulus 1024/)
  const sw1 = generateConfig(m, m.devices.find((d) => d.id === 'SW1')!).text
  assert.match(sw1, /interface range FastEthernet0\/1 - 10\n switchport mode access\n switchport access vlan 10/)
  assert.doesNotMatch(sw1, /^ switchport trunk encapsulation/m)
  const l3 = generateConfig({ modelVersion: 1, meta: { name: 'x' }, devices: [], links: [] }, { id: 'MLS', type: 'l3switch', model: '3560-24PS', interfaces: [{ name: 'Gi0/1', mode: 'trunk' }] }).text
  assert.match(l3, /switchport trunk encapsulation dot1q\n switchport mode trunk/)
  assert.match(l3, /^ip routing$/m)
})

test('Outputs: self-contained HTML, documentation and Mermaid', () => {
  const a = analyze(cargar('campus-ospf-nat.net.json'))
  const html = renderHtml(a)
  assert.match(html, /<script id="net-data" type="application\/json">/)
  assert.doesNotMatch(html, /<script[^>]+src=/, 'must not depend on external scripts')
  assert.ok(!/<\/script>[\s\S]*"meta"/.test(html.split('id="net-data"')[1].split('</script>')[0]))
  const md = buildDocs(a)
  assert.match(md, /## Addressing/)
  assert.match(md, /\| CORE \| Vlan10 \| 10\.10\.10\.1 \|/)
  assert.match(toMermaid(a), /^flowchart TB/)
})

// ---------------- v2: HSRP, STP, EIGRP, OSPFv3, ASA, IPsec, schema, import, diff ----------------
import { importConfigs } from '../lib/importer.ts'
import { diffModels } from '../lib/diff.ts'
import { buildViewerData } from '../lib/render.ts'
import { generateAll } from '../lib/ios.ts'

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('HSRP + STP + EIGRP: per-VLAN active, blocked ports and composite metric', () => {
  const a = analyze(cargar('campus-hsrp-stp-eigrp.net.json'))
  assert.equal(a.counts.error + a.counts.warning, 0, JSON.stringify(a.diagnostics.filter((d) => d.severity !== 'info')))
  const activo = (vip: string): string | undefined => a.ctx.hsrp.find((h) => h.vip === vip && h.role === 'active')?.device
  assert.equal(activo('10.1.10.1'), 'DS1')
  assert.equal(activo('10.1.20.1'), 'DS2')
  const v10 = a.stp.vlans.find((v) => v.vlan === 10)!
  assert.equal(v10.root, 'DS1')
  assert.ok(v10.ports.some((p) => p.device === 'AS1' && p.iface === 'FastEthernet0/24' && p.role === 'alternate'))
  assert.equal(a.stp.vlans.find((v) => v.vlan === 20)!.root, 'DS2')
  const d10 = a.ctx.tables.get('EDGE')!.find((r) => r.proto === 'D' && r.prefix === 24)!
  assert.equal(d10.metric, 3072, 'SVI 1G + Gi: 256 × (10 + 2)')
})

test('ASA: security levels, inspect icmp, static NAT and inbound ACL', () => {
  const m = cargar('asa-dmz.net.json')
  const a = analyze(m)
  assert.equal(a.counts.error, 0)
  assert.ok(a.tests.every((t) => t.passed === true))
  const fw = generateAll(m).find((c) => c.device === 'FW1')!.text
  assert.match(fw, /nat \(dmz,outside\) static 203\.0\.113\.10/)
  assert.match(fw, /access-group OUTSIDE-IN in interface outside/)
  assert.match(fw, /access-list OUTSIDE-IN extended permit tcp any host 192\.168\.2\.10 eq www/)
  assert.match(fw, /inspect icmp/)
  const sinInspect = cargar('asa-dmz.net.json'); delete sinInspect.devices.find((d) => d.id === 'FW1')!.firewall
  assert.match(tracePing(analyze(sinInspect).ctx, sinInspect, 'PC1', '8.8.8.8').reason, /inspect icmp/)
})

test('Site-to-site IPsec: tunnel, NAT exemption and mirrored validation', () => {
  const m = cargar('vpn-ipsec-ospfv3.net.json')
  const a = analyze(m)
  assert.equal(a.counts.error, 0, JSON.stringify(a.diagnostics.filter((d) => d.severity === 'error')))
  assert.match(a.tests[0].forward.map((h) => h.note ?? '').join(' '), /IPsec/)
  const edge = generateAll(m).find((c) => c.device === 'HQ-EDGE')!.text
  assert.match(edge, /crypto map VPN-MAP 10 ipsec-isakmp/)
  assert.match(edge, / deny ip 192\.168\.10\.0 0\.0\.0\.255 192\.168\.30\.0 0\.0\.0\.255/)
  assert.match(edge, /ip nat inside source list NAT-INSIDE interface GigabitEthernet0\/0 overload/)
  const roto = cargar('vpn-ipsec-ospfv3.net.json')
  roto.devices.find((d) => d.id === 'BR')!.vpn!.siteToSite[0].psk = 'otra'
  assert.ok(codigos(roto).includes('VPN-PSK-MISMATCH'))
})

test('OSPFv3: IPv6 table with link-local next hop and cost', () => {
  const a = analyze(cargar('vpn-ipsec-ospfv3.net.json'))
  const r = a.tables6.get('HQ-EDGE')!.find((x) => x.proto === 'O')!
  assert.equal(r.nextHop, 'fe80::2')
  assert.equal(r.metric, 2)
})

test('Schema: misspelled fields with a suggestion, and clean examples', () => {
  const m = cargar('pt-3vlan-roas-dhcp.net.json') as unknown as { devices: { interfaces: Record<string, unknown>[] }[] }
  m.devices[1].interfaces[0].allowedVlan = [10]
  const d = analyze(m as unknown as NetworkModel).diagnostics.find((x) => x.code === 'SCHEMA-UNKNOWN-FIELD')
  assert.ok(d && /allowedVlans/.test(d.message), d?.message)
  for (const f of readdirSync(EJ).filter((x) => x.endsWith('.net.json'))) {
    const s = analyze(cargar(f)).diagnostics.filter((x) => x.code.startsWith('SCHEMA'))
    assert.equal(s.length, 0, `${f}: ${s.map((x) => x.message).join('; ')}`)
  }
})

test('Import: running-config + CDP → valid model with links and no secrets', () => {
  const files = readdirSync(FIX).map((f) => ({ name: f, text: readFileSync(join(FIX, f), 'utf8') }))
  const { model } = importConfigs(files, 'fixture')
  assert.equal(model.links.length, 2)
  assert.equal(model.devices.find((d) => d.id === 'R2')!.confidence, 'inferred')
  const r1 = model.devices.find((d) => d.id === 'R1')!
  assert.equal(r1.security!.enableSecret, '<SECRET>')
  assert.ok(!JSON.stringify(model).includes('$1$'), 'must not import hashes')
  assert.equal(analyze(model).counts.error, 0)
})

test('Import round trip: generated configs → model with HSRP, EtherChannel and EIGRP', () => {
  const m = cargar('campus-hsrp-stp-eigrp.net.json')
  const files = generateAll(m).filter((c) => c.kind === 'cli').map((c) => ({ name: `${c.device}.txt`, text: c.text }))
  const { model } = importConfigs(files)
  const ds1 = model.devices.find((d) => d.id === 'DS1')!
  assert.equal(ds1.type, 'l3switch')
  assert.deepEqual(ds1.interfaces.find((i) => i.name === 'Vlan10')!.hsrp, { group: 10, ip: '10.1.10.1', priority: 110, preempt: true })
  assert.ok(ds1.interfaces.some((i) => i.name === 'FastEthernet0/1-2' && i.channelGroup?.mode === 'active'))
  assert.equal(ds1.routing!.eigrp!.as, 100)
  assert.ok(!ds1.extraConfig, JSON.stringify(ds1.extraConfig))
})

test('Diff: device changes, removed link, new problems and HTML with ghost links', () => {
  const viejo = cargar('pt-3vlan-roas-dhcp.net.json')
  const nuevo = cargar('pt-3vlan-roas-dhcp.net.json')
  nuevo.links = nuevo.links.filter((l) => l.a !== 'PC5')
  nuevo.devices.find((d) => d.id === 'SW1')!.interfaces[0].allowedVlans = [10, 20, 99, 999]
  const av = analyze(viejo)
  const an = analyze(nuevo)
  const d = diffModels(av, an)
  assert.equal(d.devices.SW1, 'changed')
  assert.ok(Object.values(d.links).includes('removed'))
  assert.ok(d.introduced.some((x) => x.code === 'ROAS-VLAN-NOT-ALLOWED'))
  const data = buildViewerData(an, { diff: d, old: av }) as { links: { ghost?: boolean }[]; l3: { nodes: unknown[] } }
  assert.ok(data.links.some((l) => l.ghost))
  assert.ok(data.l3.nodes.length > 0)
})
