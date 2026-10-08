import type { Dictionary } from '../types';

// Las salidas de netlab se muestran tal cual (el toolkit responde en español); Claude responde en el idioma del usuario
export const en: Dictionary = {
  meta: {
    title: 'network-engineering — Networking skill for Claude Code',
    description:
      'A Claude Code skill that designs, configures, validates, documents and troubleshoots Cisco networks and Packet Tracer labs, with interactive diagrams.',
  },
  nav: {
    how: 'How it works',
    examples: 'Examples',
    toolkit: 'Toolkit',
    install: 'Install',
    installCta: 'Install skill',
    themeLabel: 'Toggle light/dark theme',
    languageLabel: 'Language',
    sectionsLabel: 'Sections',
  },
  copy: { label: 'Copy command', done: 'Copied to clipboard', failed: 'Could not copy' },
  hero: {
    badge: 'Stable skill for Claude Code',
    titleA: 'Describe your network. Get it back',
    titleAccent: 'validated.',
    lede:
      'Ask Claude for a Packet Tracer lab, a campus design or the diagnosis of an outage. The skill writes a {b|single model} of the network, {b|validates it from L1 to L7} and generates configs, documentation and an {b|interactive diagram} that never contradict each other.',
    seeExamples: 'See examples',
    works: ['Claude Code', 'Cisco Packet Tracer', 'IOS · IOS XE · ASA', 'Node ≥ 22.18, zero dependencies'],
  },
  tour: {
    open: 'Open diagram',
    note: 'This is the real artifact produced by {code|netlab build}, not a screenshot. Drag, zoom and open a device to see its config.',
    tablistLabel: 'Diagram examples',
    iframeTitle: 'Example interactive diagram',
    examples: [
      { tab: '3-VLAN lab + ROAS', level: 'BEGINNER', status: '0 errors · 4/4 tests', desc: '2911 router + two 2960s, 3 VLANs + management + unused native, router-on-a-stick, DHCP on the router and SSH.' },
      { tab: 'Campus OSPF + NAT', level: 'ADVANCED', status: '0 errors · 6/6 tests', desc: 'ISR4331 edge with PAT, 3650 core with SVIs and DHCP relay, LACP EtherChannel, servers, guest ACL and Wi-Fi.' },
      { tab: 'HSRP + STP + EIGRP', level: 'ADVANCED', status: '0 errors · 4/4 tests', desc: 'Two 3560 distribution switches with per-VLAN HSRP and aligned STP root, dual uplinks, EtherChannel and EIGRP.' },
      { tab: 'Two sites over serial', level: 'INTERMEDIATE', status: '0 errors · 6/6 tests', desc: 'Two sites joined by serial (HWIC-2T, DCE with clock rate), OSPF area 0 with real cost, ROAS and DHCP per site.' },
      { tab: 'ASA with DMZ', level: 'ADVANCED', status: '0 errors · 5/5 tests', desc: 'ASA 5506-X with outside/inside/dmz, PAT, static NAT for the web server, inbound ACL and inspect icmp.' },
      { tab: 'IPsec VPN + OSPFv3', level: 'ADVANCED', status: '0 errors · 4/4 tests', desc: 'Site-to-site IPsec VPN with NAT exemption; OSPFv2 advertises the default and OSPFv3 routes IPv6.' },
      { tab: 'Lab with 5 faults', level: 'INTERMEDIATE', status: '10 errors detected', desc: 'The beginner network with 5 intentional faults to practice troubleshooting.' },
      { tab: 'Diff: healthy vs broken', level: 'DIFF', status: 'Changes tab', desc: 'netlab diff between the healthy and the broken network: added, modified and removed on the diagram.' },
    ],
  },
  stats: [
    { value: '16', label: 'netlab commands' },
    { value: '17', label: 'topic references' },
    { value: '7', label: 'validated example networks' },
    { value: 'L1–L7', label: 'whole-network validation' },
    { value: '0', label: 'npm dependencies' },
  ],
  how: {
    tag: 'How it works',
    title: 'One model. Everything else {em|is generated.}',
    sub: 'The network lives in a {code|*.net.json} file. Diagram, configs, tables and tests all come from that same validated model, so the diagram never contradicts the config.',
    nodes: [
      { key: 'requirements', title: 'You describe it', body: '“3 VLANs, one router, two switches, DHCP and SSH”. Claude only asks what changes the design and states its assumptions.' },
      { key: 'source of truth', title: 'Network model', body: '{code|networks/lab.net.json} with devices, exact ports, VLANs, VLSM addressing, routing and expected tests.' },
      { key: 'netlab validate', title: 'Validation', body: 'Trunks and native VLAN, gateways, overlaps, DHCP, OSPF/EIGRP, STP, HSRP, ACL, NAT, VPN… plus simulated round-trip pings.' },
    ],
    buildKey: 'netlab build',
    outputs: [
      { file: 'topology.html', label: 'diagram' },
      { file: 'configs/*.txt', label: 'IOS · ASA' },
      { file: 'README.md', label: 'docs' },
      { file: 'analysis.json', label: 'diagnostics' },
    ],
    foot: 'Something changed? Edit the model and regenerate. Outputs are never patched by hand.',
    replay: 'Replay',
  },
  usage: {
    tag: 'Usage examples',
    title: 'Ask the way you would {em|ask an engineer.}',
    sub: 'The skill kicks in on any networking task, or call it with {code|/network-engineering}. Pick a request:',
    tablistLabel: 'Example requests',
    foot: 'Summarized answer · netlab output is real and shown as-is (the toolkit speaks Spanish)',
    prompts: [
      {
        id: 'lab',
        q: 'I need a Packet Tracer lab with 3 VLANs, one router, two switches and DHCP.',
        tag: 'DESIGN · PACKET TRACER',
        term: `{u|I need a Packet Tracer lab with 3 VLANs, one router, two switches and DHCP.}

{sk|network-engineering} {d|design flow}
  {d|Topology }  1 × 2911 (router-on-a-stick) · 2 × 2960
  {d|VLANs    }  10 SALES · 20 ADMIN · 30 IT · 99 management · 999 unused native
  {d|Model    }  {hl|networks/lab-3vlan.net.json}

{s|$ netlab validate} networks/lab-3vlan.net.json
{ok|OK}    ping PC1 → PC3 (esperado success): Ida y vuelta correctas
{ok|OK}    ping PC1 → PC2 (esperado success): Ida y vuelta correctas
{ok|OK}    ping PC5 → 192.168.99.11 (esperado success): Ida y vuelta correctas
{ok|OK}    ping PC4 → 192.168.20.1 (esperado success): Ida y vuelta correctas
Resumen: {ok|0 errores}, 0 advertencias, 7 notas · 8 equipos, 7 enlaces

{s|$ netlab build} networks/lab-3vlan.net.json -o out/lab
  topology.html   diagrama interactivo
  README.md       documentación (inventario, IP, VLAN, puertos, routing, configs, verificación)
  configs/        8 archivos (CLI IOS o instrucciones GUI de PT)
  topology.mmd    Mermaid · analysis.json  diagnósticos y tablas
Validación: {ok|0 errores}, 0 advertencias, 7 notas · pruebas {ok|4/4 OK}`,
      },
      {
        id: 'edu',
        q: 'Explain step by step how to configure router-on-a-stick, I’m a beginner.',
        tag: 'TEACHING MODE',
        term: `{u|Explain step by step how to configure router-on-a-stick, I’m a beginner.}

{sk|network-engineering} {d|teaching mode · BEGINNER}

{hl|STEP 1 — Create the VLANs on the switch}
{d|What       }  We define SALES (10), ADMIN (20) and IT (30) on SW1.
{d|Why        }  A trunk only carries VLANs that exist on the switch.
{d|Commands   }
  {s|SW1(config)#} vlan 10
  {s|SW1(config-vlan)#} name SALES
{d|Expected   }  {ok|show vlan brief} lists the three VLANs as active.
{d|Common bug }  {nt|Creating the VLAN on one switch and forgetting the other.}

{hl|STEP 2 — One subinterface per VLAN on R1}
{d|What       }  We split Gi0/0 into 802.1Q subinterfaces.
{d|Why        }  Each subinterface is the gateway for its VLAN.
{d|Commands   }
  {s|R1(config)#} interface GigabitEthernet0/0.10
  {s|R1(config-subif)#} encapsulation dot1Q 10
  {s|R1(config-subif)#} ip address 192.168.10.1 255.255.255.0
{d|Common bug }  {nt|Forgetting "no shutdown" on the physical interface Gi0/0.}

{d|STEP 3 — 802.1Q trunk towards the router  …}`,
      },
      {
        id: 'ts',
        q: 'PCs in VLAN 30 aren’t getting an IP, here is the switch show running-config.',
        tag: 'TROUBLESHOOTING',
        term: `{u|PCs in VLAN 30 aren’t getting an IP, here is the switch show running-config.}

{s|$ netlab import} configs/ -o net.net.json
{s|$ netlab validate} net.net.json
{er|ERROR}   [ROAS-VLAN-NOT-ALLOWED] La VLAN 30 (R1 GigabitEthernet0/0.30) no está
        permitida en el trunk SW1 GigabitEthernet0/1.
{er|ERROR}   [DHCP-NO-SERVER] PC5 usa DHCP pero no hay pool que sirva su red
        (dominio L2 con ningún gateway).
{er|FALLA} ping PC5 → 192.168.30.1 (esperado success): PC5 no tiene dirección IP

{sk|network-engineering} {d|diagnosis}
  {hl|Root cause:} the trunk towards R1 doesn’t carry VLAN 30, so PC5’s
  DHCPDISCOVER never reaches the router (hence the 169.254.x.x address).

  {s|SW1(config)#} interface g0/1
  {s|SW1(config-if)#} switchport trunk allowed vlan add 30

  {d|Verify:} {ok|show interfaces trunk} → VLAN 30 allowed and active on Gi0/1.
  {d|Next:} fix one fault at a time and test again. Once this one is solved
  the next shows up: the IT pool uses default-router 192.168.3.1.`,
      },
      {
        id: 'vlsm',
        q: 'Split 192.168.0.0/24 for Sales (60), IT (25) and a WAN link.',
        tag: 'VLSM',
        term: `{u|Split 192.168.0.0/24 for Sales (60), IT (25) and a WAN link.}

{s|$ netlab vlsm} 192.168.0.0/24 SALES:60 IT:25 WAN:2

 Nombre   Pedidos  Red               Máscara           Gateway        Broadcast       Útiles
 {d|──────── ──────── ───────────────── ───────────────── ────────────── ─────────────── ──────}
 {hl|SALES}    60       192.168.0.0{s|/26}    255.255.255.192   192.168.0.1    192.168.0.63    {ok|62}
 {hl|IT}       25       192.168.0.64{s|/27}   255.255.255.224   192.168.0.65   192.168.0.95    {ok|30}
 {hl|WAN}      2        192.168.0.96{s|/30}   255.255.255.252   192.168.0.97   192.168.0.99    {ok|2}

{sk|network-engineering} {d|method}
  Sort largest first; each network takes the smallest block that fits
  its hosts + network + broadcast: 60 → /26 (62), 25 → /27 (30), 2 → /30.
  {d|Free to grow:} 192.168.0.100 – 192.168.0.255`,
      },
      {
        id: 'trace',
        q: 'Does the guest laptop really reach the Internet? Show me the path.',
        tag: 'SIMULATION',
        term: `{u|Does the guest laptop really reach the Internet? Show me the path.}

{s|$ netlab trace} campus-ospf-nat.net.json LAP-INV 8.8.8.8
ping LAP-INV → 8.8.8.8: {ok|SUCCESS} — Ida y vuelta correctas
{hl|Ida:}
  LAP-INV {d|[sale Wireless0]}
  CORE    {d|[entra Vlan50] [sale GigabitEthernet1/0/24]}
  EDGE    {d|[entra GigabitEthernet0/0/1] [sale GigabitEthernet0/0/0]}
          {nt|(NAT: origen 10.10.50.11 → 203.0.113.2)}
  ISP     {d|[entra GigabitEthernet0/0]}
{hl|Vuelta:}
  ISP     {d|[sale GigabitEthernet0/0]}
  EDGE    {d|[entra GigabitEthernet0/0/0] [sale GigabitEthernet0/0/1]}
          {nt|(NAT: destino 203.0.113.2 → 10.10.50.11)}
  CORE    {d|[entra GigabitEthernet1/0/24] [sale Vlan50]}
  LAP-INV {d|[entra Wireless0]}

{sk|network-engineering} {d|note}
  The simulation approximates IOS (no timers, no real ARP).
  Confirm it on the device with {ok|ping} and {ok|show ip nat translations}.`,
      },
    ],
  },
  features: {
    tag: 'What’s inside',
    title: 'It reasons about the whole network, {em|not loose commands.}',
    validate: {
      title: 'Validates the whole network',
      body: 'Catches what breaks a lab before you paste a single command: VLAN not allowed on the trunk, native VLAN mismatch, gateway outside the subnet, DHCP without a server, adjacencies that never form, STP root misaligned with HSRP.',
    },
    diagram: {
      title: 'Diagram in a single HTML',
      body: 'Per-device inspector with its config, physical and L3 views, VLAN filter, highlighted ping paths and SVG/PNG export. Works offline.',
    },
    configs: {
      title: 'Paste-ready configs',
      body: 'Cisco IOS / IOS XE and ASA per device; GUI instructions for Packet Tracer PCs and servers.',
    },
    honest: {
      title: 'Never invents commands',
      body: 'Flags what works where, separates lab from production, and labels any sample {code|show} output as illustrative.',
      chips: ['[PT] Packet Tracer', '[IOS]', '[XE] IOS XE', '[HW] real hardware'],
    },
    edu: {
      title: 'Teaching mode',
      body: 'STEP 1…N with what we do, why, commands, expected result and the common mistake.',
    },
    import: {
      title: 'Import and compare',
      body: 'From {code|show running-config} + {code|show cdp neighbors} to a model, without importing secrets. {code|diff} between versions with a change diagram.',
    },
    analyze: {
      title: 'Reads screenshots',
      body: 'Reads Packet Tracer screenshots, diagrams and {code|show} output, separating facts from assumptions.',
      rows: [
        { level: 'CONFIRMED', text: 'R1 Gi0/0 is a trunk' },
        { level: 'INFERRED', text: 'VLAN 20 = ADMIN' },
        { level: 'UNKNOWN', text: 'PC4 subnet mask' },
      ],
    },
  },
  toolkit: {
    tag: 'netlab toolkit',
    title: 'Also works {em|without Claude.}',
    sub: 'The same CLI the skill uses. TypeScript run natively by Node ≥ 22.18: no {code|npm install}, no build step.',
    groups: [
      {
        title: 'Design',
        sub: 'From the model to everything else.',
        items: [
          { cmd: 'init', desc: 'Starter model with autocomplete (JSON Schema)' },
          { cmd: 'validate', desc: 'L1–L7 errors + simulated pings' },
          { cmd: 'build', desc: 'Diagram, docs, configs, Mermaid, analysis' },
          { cmd: 'config', desc: 'Per-device CLI: IOS, IOS XE or ASA' },
          { cmd: 'render · docs · mermaid', desc: 'Each output on its own' },
        ],
      },
      {
        title: 'Simulate',
        sub: 'Before touching the device.',
        items: [
          { cmd: 'trace', desc: 'Round-trip ping with LPM, ACL, NAT, HSRP, ASA and IPsec' },
          { cmd: 'routes', desc: 'Tables with real AD and metric; {code|--ipv6} with OSPFv3' },
          { cmd: 'catalog', desc: 'Packet Tracer models and their interfaces' },
        ],
      },
      {
        title: 'Existing networks',
        sub: 'Document and audit.',
        items: [
          { cmd: 'import', desc: '{code|show running-config} + CDP → model' },
          { cmd: 'diff', desc: 'Added, modified and removed, with a diagram' },
        ],
      },
      {
        title: 'Calculate',
        sub: 'Error-free addressing.',
        items: [
          { cmd: 'subnet', desc: 'Network, mask, range and broadcast' },
          { cmd: 'vlsm', desc: 'A block split by requested hosts' },
          { cmd: 'ipv6 --split', desc: 'IPv6 subnets' },
          { cmd: 'eui64', desc: 'IPv6 interface ID from the MAC' },
        ],
      },
    ],
    ciNote: '{code|validate} exits with code 1 on errors: use it in CI.',
  },
  install: {
    tag: 'Install',
    title: 'One command. {em|Then just ask.}',
    tablistLabel: 'Install method',
    tabs: [
      {
        label: 'Skills CLI (npx)',
        blocks: [
          { comment: 'Install with skills.sh', cmd: 'npx skills add whetstone-dev/network-engineering', prompt: '$' },
          { comment: 'Global and non-interactive, straight into Claude Code', cmd: 'npx skills add whetstone-dev/network-engineering --agent claude-code --global --yes', prompt: '$' },
        ],
        hint: 'Update: {code|npx skills update}',
      },
      {
        label: 'macOS / Linux',
        blocks: [
          { comment: 'Personal skill, available in every project', cmd: 'git clone https://github.com/whetstone-dev/network-engineering.git ~/.claude/skills/network-engineering', prompt: '$' },
        ],
        hint: 'Update: {code|git -C ~/.claude/skills/network-engineering pull}',
      },
      {
        label: 'Windows',
        blocks: [
          { comment: 'PowerShell', cmd: 'git clone https://github.com/whetstone-dev/network-engineering.git "$HOME\\.claude\\skills\\network-engineering"', prompt: '>' },
        ],
        hint: 'The folder must be named {code|network-engineering}, same as the skill.',
      },
      {
        label: 'Single project',
        blocks: [
          { comment: 'Inside the project repository', cmd: 'git clone https://github.com/whetstone-dev/network-engineering.git .claude/skills/network-engineering', prompt: '$' },
        ],
        hint: 'The whole team gets it when they clone the repo.',
      },
    ],
    steps: [
      { title: 'Install', body: 'With {code|npx} or {code|git clone}. Restart Claude Code so it picks up the skill.' },
      { title: 'Describe your network', body: 'Requirements, a Packet Tracer screenshot or your {code|show running-config}.' },
      { title: 'Get a validated network', body: 'Design, tables, per-device configs, verification and the diagram in {code|topology.html}.' },
    ],
    reqs: ['Claude Code', 'Node.js ≥ 22.18', 'MIT'],
  },
  cta: { title: 'Your next lab is {em|one message away.}', github: 'View on GitHub' },
  footer: { changelog: 'Changelog', contributing: 'Contributing', license: 'License', linksLabel: 'Footer links' },
};
