import type { Dictionary } from '../types';

// Las salidas de netlab en la terminal son reales (el toolkit responde en español)
export const es: Dictionary = {
  meta: {
    title: 'network-engineering — Skill de redes para Claude Code',
    description:
      'Skill para Claude Code que diseña, configura, valida, documenta y diagnostica redes Cisco y laboratorios de Packet Tracer, con diagramas interactivos.',
  },
  nav: {
    how: 'Cómo funciona',
    examples: 'Ejemplos',
    toolkit: 'Toolkit',
    install: 'Instalar',
    installCta: 'Instalar skill',
    themeLabel: 'Cambiar tema claro/oscuro',
    languageLabel: 'Idioma',
    sectionsLabel: 'Secciones',
  },
  copy: { label: 'Copiar comando', done: 'Copiado al portapapeles', failed: 'No se pudo copiar' },
  hero: {
    badge: 'Skill estable para Claude Code',
    titleA: 'Describe tu red. Recíbela',
    titleAccent: 'validada.',
    lede:
      'Pídele a Claude un laboratorio de Packet Tracer, el diseño de un campus o el diagnóstico de una falla. La skill escribe un {b|modelo único} de la red, lo {b|valida de L1 a L7} y genera configuraciones, documentación y un {b|diagrama interactivo} que nunca se contradicen.',
    seeExamples: 'Ver ejemplos',
    works: ['Claude Code', 'Cisco Packet Tracer', 'IOS · IOS XE · ASA', 'Node ≥ 22.18, sin dependencias'],
  },
  tour: {
    open: 'Abrir diagrama',
    note: 'Es el artefacto real que genera {code|netlab build}, no una captura. Arrastra, haz zoom y abre un equipo para ver su configuración.',
    tablistLabel: 'Ejemplos de diagramas',
    iframeTitle: 'Diagrama interactivo de ejemplo',
    examples: [
      { tab: 'Lab 3 VLAN + ROAS', level: 'BEGINNER', status: '0 errores · 4/4 pruebas', desc: 'Router 2911 + dos 2960, 3 VLAN + gestión + nativa sin uso, router-on-a-stick, DHCP en el router y SSH.' },
      { tab: 'Campus OSPF + NAT', level: 'ADVANCED', status: '0 errores · 6/6 pruebas', desc: 'Borde ISR4331 con PAT, core 3650 con SVI y relay DHCP, EtherChannel LACP, servidores, ACL de invitados y Wi-Fi.' },
      { tab: 'HSRP + STP + EIGRP', level: 'ADVANCED', status: '0 errores · 4/4 pruebas', desc: 'Dos distribuciones 3560 con HSRP por VLAN y root de STP alineado, doble uplink, EtherChannel y EIGRP.' },
      { tab: 'Dos sedes por serial', level: 'INTERMEDIATE', status: '0 errores · 6/6 pruebas', desc: 'Dos sedes unidas por serial (HWIC-2T, DCE con clock rate), OSPF área 0 con costo real, ROAS y DHCP por sede.' },
      { tab: 'ASA con DMZ', level: 'ADVANCED', status: '0 errores · 5/5 pruebas', desc: 'ASA 5506-X con outside/inside/dmz, PAT, NAT estática del web server, ACL de entrada e inspect icmp.' },
      { tab: 'VPN IPsec + OSPFv3', level: 'ADVANCED', status: '0 errores · 4/4 pruebas', desc: 'VPN IPsec site-to-site con exención de NAT; OSPFv2 propaga la default y OSPFv3 enruta IPv6.' },
      { tab: 'Lab con 5 fallas', level: 'INTERMEDIATE', status: '10 errores detectados', desc: 'La red beginner con 5 fallas intencionales para practicar diagnóstico.' },
      { tab: 'Diff: sano vs roto', level: 'DIFF', status: 'pestaña Cambios', desc: 'netlab diff entre la red sana y la rota: agregados, modificados y eliminados sobre el diagrama.' },
    ],
  },
  stats: [
    { value: '16', label: 'comandos netlab' },
    { value: '17', label: 'referencias por tema' },
    { value: '7', label: 'redes de ejemplo validadas' },
    { value: 'L1–L7', label: 'validación de la red entera' },
    { value: '0', label: 'dependencias npm' },
  ],
  how: {
    tag: 'Cómo funciona',
    title: 'Un modelo. Todo lo demás {em|se genera.}',
    sub: 'La red vive en un archivo {code|*.net.json}. Diagrama, configuraciones, tablas y pruebas salen de ese mismo modelo validado, así el diagrama nunca contradice a la configuración.',
    nodes: [
      { key: 'requisitos', title: 'Lo describes', body: '“3 VLAN, un router, dos switches, DHCP y SSH”. Claude pregunta solo lo que cambia el diseño y declara los supuestos.' },
      { key: 'fuente de verdad', title: 'Modelo de red', body: '{code|redes/lab.net.json} con equipos, puertos exactos, VLAN, direccionamiento VLSM, routing y pruebas esperadas.' },
      { key: 'netlab validate', title: 'Validación', body: 'Trunks y nativa, gateways, solapes, DHCP, OSPF/EIGRP, STP, HSRP, ACL, NAT, VPN… y pings simulados de ida y vuelta.' },
    ],
    buildKey: 'netlab build',
    outputs: [
      { file: 'topology.html', label: 'diagrama' },
      { file: 'configs/*.txt', label: 'IOS · ASA' },
      { file: 'README.md', label: 'docs' },
      { file: 'analysis.json', label: 'diagnóstico' },
    ],
    foot: '¿Algo cambia? Se edita el modelo y se regenera. Nunca se parchean salidas a mano.',
    replay: 'Repetir',
  },
  usage: {
    tag: 'Ejemplos de uso',
    title: 'Pídelo como se lo pedirías {em|a un ingeniero.}',
    sub: 'La skill se activa sola con cualquier tarea de redes, o la invocas con {code|/network-engineering}. Elige una petición:',
    tablistLabel: 'Peticiones de ejemplo',
    foot: 'Respuesta resumida · las salidas de netlab son reales, ejecutadas sobre los ejemplos del repositorio',
    prompts: [
      {
        id: 'lab',
        q: 'Necesito un laboratorio de Packet Tracer con 3 VLAN, un router, dos switches y DHCP.',
        tag: 'DISEÑO · PACKET TRACER',
        term: `{u|Necesito un laboratorio de Packet Tracer con 3 VLAN, un router, dos switches y DHCP.}

{sk|network-engineering} {d|flujo de diseño}
  {d|Topología }  1 × 2911 (router-on-a-stick) · 2 × 2960
  {d|VLAN     }  10 VENTAS · 20 ADMIN · 30 TI · 99 gestión · 999 nativa sin uso
  {d|Modelo   }  {hl|redes/lab-3vlan.net.json}

{s|$ netlab validate} redes/lab-3vlan.net.json
{ok|OK}    ping PC1 → PC3 (esperado success): Ida y vuelta correctas
{ok|OK}    ping PC1 → PC2 (esperado success): Ida y vuelta correctas
{ok|OK}    ping PC5 → 192.168.99.11 (esperado success): Ida y vuelta correctas
{ok|OK}    ping PC4 → 192.168.20.1 (esperado success): Ida y vuelta correctas
Resumen: {ok|0 errores}, 0 advertencias, 7 notas · 8 equipos, 7 enlaces

{s|$ netlab build} redes/lab-3vlan.net.json -o salida/lab
  topology.html   diagrama interactivo
  README.md       documentación (inventario, IP, VLAN, puertos, routing, configs, verificación)
  configs/        8 archivos (CLI IOS o instrucciones GUI de PT)
  topology.mmd    Mermaid · analysis.json  diagnósticos y tablas
Validación: {ok|0 errores}, 0 advertencias, 7 notas · pruebas {ok|4/4 OK}`,
      },
      {
        id: 'edu',
        q: 'Explícame paso a paso cómo configurar router-on-a-stick, soy principiante.',
        tag: 'MODO EDUCATIVO',
        term: `{u|Explícame paso a paso cómo configurar router-on-a-stick, soy principiante.}

{sk|network-engineering} {d|modo educativo · BEGINNER}

{hl|PASO 1 — Crear las VLAN en el switch}
{d|Qué hacemos }  Definimos VENTAS (10), ADMIN (20) y TI (30) en SW1.
{d|Por qué     }  El trunk solo transporta VLAN que existen en el switch.
{d|Comandos    }
  {s|SW1(config)#} vlan 10
  {s|SW1(config-vlan)#} name VENTAS
{d|Resultado   }  {ok|show vlan brief} lista las tres VLAN activas.
{d|Error común }  {nt|Crear la VLAN en un switch y olvidarla en el otro.}

{hl|PASO 2 — Una subinterfaz por VLAN en R1}
{d|Qué hacemos }  Partimos Gi0/0 en subinterfaces con 802.1Q.
{d|Por qué     }  Cada subinterfaz es el gateway de su VLAN.
{d|Comandos    }
  {s|R1(config)#} interface GigabitEthernet0/0.10
  {s|R1(config-subif)#} encapsulation dot1Q 10
  {s|R1(config-subif)#} ip address 192.168.10.1 255.255.255.0
{d|Error común }  {nt|Olvidar "no shutdown" en la interfaz física Gi0/0.}

{d|PASO 3 — Trunk 802.1Q hacia el router  …}`,
      },
      {
        id: 'ts',
        q: 'Los PCs de la VLAN 30 no obtienen IP, te paso el show running-config del switch.',
        tag: 'TROUBLESHOOTING',
        term: `{u|Los PCs de la VLAN 30 no obtienen IP, te paso el show running-config del switch.}

{s|$ netlab import} configs/ -o red.net.json
{s|$ netlab validate} red.net.json
{er|ERROR}   [ROAS-VLAN-NOT-ALLOWED] La VLAN 30 (R1 GigabitEthernet0/0.30) no está
        permitida en el trunk SW1 GigabitEthernet0/1.
{er|ERROR}   [DHCP-NO-SERVER] PC5 usa DHCP pero no hay pool que sirva su red
        (dominio L2 con ningún gateway).
{er|FALLA} ping PC5 → 192.168.30.1 (esperado success): PC5 no tiene dirección IP

{sk|network-engineering} {d|diagnóstico}
  {hl|Causa raíz:} el trunk hacia R1 no transporta la VLAN 30, así que el
  DHCPDISCOVER de PC5 nunca llega al router (por eso tiene 169.254.x.x).

  {s|SW1(config)#} interface g0/1
  {s|SW1(config-if)#} switchport trunk allowed vlan add 30

  {d|Verificación:} {ok|show interfaces trunk} → VLAN 30 permitida y activa en Gi0/1.
  {d|Luego:} corrige una falla a la vez y vuelve a probar. Con esta resuelta
  aparece la siguiente: el pool TI usa default-router 192.168.3.1.`,
      },
      {
        id: 'vlsm',
        q: 'Divide 192.168.0.0/24 para Ventas (60), TI (25) y un enlace WAN.',
        tag: 'VLSM',
        term: `{u|Divide 192.168.0.0/24 para Ventas (60), TI (25) y un enlace WAN.}

{s|$ netlab vlsm} 192.168.0.0/24 VENTAS:60 TI:25 WAN:2

 Nombre   Pedidos  Red               Máscara           Gateway        Broadcast       Útiles
 {d|──────── ──────── ───────────────── ───────────────── ────────────── ─────────────── ──────}
 {hl|VENTAS}   60       192.168.0.0{s|/26}    255.255.255.192   192.168.0.1    192.168.0.63    {ok|62}
 {hl|TI}       25       192.168.0.64{s|/27}   255.255.255.224   192.168.0.65   192.168.0.95    {ok|30}
 {hl|WAN}      2        192.168.0.96{s|/30}   255.255.255.252   192.168.0.97   192.168.0.99    {ok|2}

{sk|network-engineering} {d|método}
  Se ordena de mayor a menor y cada red toma el bloque más pequeño que
  cubre sus hosts + red + broadcast: 60 → /26 (62), 25 → /27 (30), 2 → /30.
  {d|Libre para crecer:} 192.168.0.100 – 192.168.0.255`,
      },
      {
        id: 'trace',
        q: '¿El portátil de invitados realmente sale a Internet? Muéstrame el camino.',
        tag: 'SIMULACIÓN',
        term: `{u|¿El portátil de invitados realmente sale a Internet? Muéstrame el camino.}

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

{sk|network-engineering} {d|nota}
  La simulación aproxima a IOS (sin temporizadores ni ARP real).
  Confírmalo en el equipo con {ok|ping} y {ok|show ip nat translations}.`,
      },
    ],
  },
  features: {
    tag: 'Qué incluye',
    title: 'Razona sobre la red completa, {em|no sobre comandos sueltos.}',
    validate: {
      title: 'Valida la red entera',
      body: 'Detecta lo que rompe un laboratorio antes de pegar un solo comando: VLAN no permitida en el trunk, nativa distinta, gateway fuera de la subred, DHCP sin servidor, adyacencias que no se forman, root de STP desalineado con HSRP.',
    },
    diagram: {
      title: 'Diagrama en un solo HTML',
      body: 'Inspector por equipo con su config, vista física y L3, filtro por VLAN, caminos de ping resaltados y exportación SVG/PNG. Abre sin internet.',
    },
    configs: {
      title: 'Configuraciones listas para pegar',
      body: 'Cisco IOS / IOS XE y ASA por equipo; instrucciones de GUI para PCs y servidores de Packet Tracer.',
    },
    honest: {
      title: 'No inventa comandos',
      body: 'Marca qué funciona dónde, separa laboratorio de producción y rotula como ilustrativa cualquier salida {code|show} de ejemplo.',
      chips: ['[PT] Packet Tracer', '[IOS]', '[XE] IOS XE', '[HW] hardware real'],
    },
    edu: {
      title: 'Modo educativo',
      body: 'PASO 1…N con qué hacemos, por qué, comandos, resultado esperado y error común.',
    },
    import: {
      title: 'Importa y compara',
      body: 'De {code|show running-config} + {code|show cdp neighbors} a modelo, sin importar secretos. {code|diff} entre versiones con diagrama de cambios.',
    },
    analyze: {
      title: 'Analiza capturas',
      body: 'Lee capturas de Packet Tracer, diagramas y salidas {code|show} separando hechos de suposiciones.',
      rows: [
        { level: 'CONFIRMADO', text: 'R1 Gi0/0 en trunk' },
        { level: 'INFERIDO', text: 'VLAN 20 = ADMIN' },
        { level: 'DESCONOCIDO', text: 'máscara de PC4' },
      ],
    },
  },
  toolkit: {
    tag: 'Toolkit netlab',
    title: 'También funciona {em|sin Claude.}',
    sub: 'El mismo CLI que usa la skill. TypeScript ejecutado de forma nativa por Node ≥ 22.18: sin {code|npm install}, sin build.',
    groups: [
      {
        title: 'Diseñar',
        sub: 'Del modelo a todo lo demás.',
        items: [
          { cmd: 'init', desc: 'Modelo base con autocompletado (JSON Schema)' },
          { cmd: 'validate', desc: 'Errores L1–L7 + pings simulados' },
          { cmd: 'build', desc: 'Diagrama, docs, configs, Mermaid, análisis' },
          { cmd: 'config', desc: 'CLI por equipo: IOS, IOS XE o ASA' },
          { cmd: 'render · docs · mermaid', desc: 'Cada salida por separado' },
        ],
      },
      {
        title: 'Simular',
        sub: 'Antes de tocar el equipo.',
        items: [
          { cmd: 'trace', desc: 'Ping ida/vuelta con LPM, ACL, NAT, HSRP, ASA e IPsec' },
          { cmd: 'routes', desc: 'Tablas con AD y métrica reales; {code|--ipv6} con OSPFv3' },
          { cmd: 'catalog', desc: 'Modelos de Packet Tracer y sus interfaces' },
        ],
      },
      {
        title: 'Redes existentes',
        sub: 'Documentar y auditar.',
        items: [
          { cmd: 'import', desc: '{code|show running-config} + CDP → modelo' },
          { cmd: 'diff', desc: 'Agregados, modificados y eliminados, con diagrama' },
        ],
      },
      {
        title: 'Calcular',
        sub: 'Direccionamiento sin errores.',
        items: [
          { cmd: 'subnet', desc: 'Red, máscara, rango y broadcast' },
          { cmd: 'vlsm', desc: 'Bloque dividido por hosts pedidos' },
          { cmd: 'ipv6 --split', desc: 'Subredes IPv6' },
          { cmd: 'eui64', desc: 'Interfaz IPv6 desde la MAC' },
        ],
      },
    ],
    ciNote: '{code|validate} sale con código 1 si hay errores: úsalo en CI.',
  },
  install: {
    tag: 'Instalación',
    title: 'Un comando. {em|Luego, solo pide.}',
    tablistLabel: 'Método de instalación',
    tabs: [
      {
        label: 'Skills CLI (npx)',
        blocks: [
          { comment: 'Instalar con skills.sh', cmd: 'npx skills add whetstone-dev/network-engineering', prompt: '$' },
          { comment: 'Global y sin preguntas, directo para Claude Code', cmd: 'npx skills add whetstone-dev/network-engineering --agent claude-code --global --yes', prompt: '$' },
        ],
        hint: 'Actualizar: {code|npx skills update}',
      },
      {
        label: 'macOS / Linux',
        blocks: [
          { comment: 'Skill personal, disponible en todos los proyectos', cmd: 'git clone https://github.com/whetstone-dev/network-engineering.git ~/.claude/skills/network-engineering', prompt: '$' },
        ],
        hint: 'Actualizar: {code|git -C ~/.claude/skills/network-engineering pull}',
      },
      {
        label: 'Windows',
        blocks: [
          { comment: 'PowerShell', cmd: 'git clone https://github.com/whetstone-dev/network-engineering.git "$HOME\\.claude\\skills\\network-engineering"', prompt: '>' },
        ],
        hint: 'La carpeta debe llamarse {code|network-engineering}, igual que la skill.',
      },
      {
        label: 'Solo un proyecto',
        blocks: [
          { comment: 'Dentro del repositorio del proyecto', cmd: 'git clone https://github.com/whetstone-dev/network-engineering.git .claude/skills/network-engineering', prompt: '$' },
        ],
        hint: 'Todo el equipo la recibe al clonar el repositorio.',
      },
    ],
    steps: [
      { title: 'Instala', body: 'Con {code|npx} o {code|git clone}. Reinicia Claude Code para que detecte la skill.' },
      { title: 'Describe tu red', body: 'Requisitos, una captura de Packet Tracer o tus {code|show running-config}.' },
      { title: 'Recibe la red validada', body: 'Diseño, tablas, configs por equipo, verificación y el diagrama en {code|topology.html}.' },
    ],
    reqs: ['Claude Code', 'Node.js ≥ 22.18', 'MIT'],
  },
  cta: { title: 'Tu próximo laboratorio está {em|a un mensaje.}', github: 'Ver en GitHub' },
  footer: { changelog: 'Changelog', contributing: 'Contribuir', license: 'Licencia', linksLabel: 'Enlaces del pie' },
};
