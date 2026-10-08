// Network model: the single source of truth.
// Diagrams, configurations, documentation and validations are derived from this structure.
// Human-readable specification: references/model.md

export const MODEL_VERSION = 1

export type DeviceType =
  | 'router' | 'switch' | 'l3switch' | 'firewall' | 'wlc' | 'ap' | 'wireless-router'
  | 'pc' | 'laptop' | 'server' | 'printer' | 'phone' | 'tablet' | 'smartphone' | 'iot'
  | 'cloud' | 'internet' | 'modem' | 'hub' | 'other'

export type Status = 'up' | 'down' | 'warning' | 'error' | 'unknown'
export type Confidence = 'confirmed' | 'inferred' | 'unknown'
export type Target = 'packet-tracer' | 'ios' | 'iosxe' | 'generic'
export type Platform = 'ios' | 'iosxe' | 'asa' | 'nxos' | 'endpoint' | 'other'
export type Role = 'internet' | 'edge' | 'core' | 'distribution' | 'access' | 'server' | 'endpoint' | 'wireless'
export type IfMode = 'routed' | 'access' | 'trunk' | 'host' | 'svi' | 'subinterface' | 'loopback'
export type Medium = 'copper-straight' | 'copper-cross' | 'fiber' | 'serial' | 'wireless' | 'console' | 'coaxial' | 'phone' | 'auto'
export type ChannelMode = 'active' | 'passive' | 'on' | 'desirable' | 'auto'

export interface Meta {
  name: string
  description?: string
  target?: Target            // target platform for generated configurations
  level?: 'beginner' | 'intermediate' | 'advanced'
  author?: string
  language?: string
}

export interface Vlan {
  id: number
  name: string
  subnet?: string            // "192.168.10.0/24"
  gateway?: string           // "192.168.10.1"
  ipv6Prefix?: string
  purpose?: 'data' | 'voice' | 'management' | 'native' | 'blackhole' | 'guest' | 'servers'
  color?: string
  description?: string
}

export interface PortSecurity {
  maximum?: number
  violation?: 'shutdown' | 'restrict' | 'protect'
  sticky?: boolean
  macs?: string[]
}

export interface Iface {
  name: string               // full IOS name: "GigabitEthernet0/0/0"; ranges allowed: "FastEthernet0/1-10"
  description?: string
  mode?: IfMode              // inferred if missing (see normalize.ts)
  ip?: string                // "192.168.1.1/24"
  ipv6?: string[]            // ["2001:db8:acad:10::1/64"]
  linkLocal?: string         // "fe80::1"
  dhcp?: boolean             // DHCP client (hosts or 'ip address dhcp')
  vlan?: number              // access VLAN / subinterface dot1Q VLAN / SVI VLAN
  native?: boolean           // subinterface with 'encapsulation dot1Q N native'
  nativeVlan?: number        // trunk native VLAN (default 1)
  allowedVlans?: number[] | 'all'
  voiceVlan?: number
  shutdown?: boolean
  status?: Status
  helper?: string[]          // ip helper-address
  nat?: 'inside' | 'outside'
  acl?: { in?: string; out?: string }
  portSecurity?: PortSecurity
  portfast?: boolean
  bpduguard?: boolean
  channelGroup?: { id: number; mode: ChannelMode }
  ospf?: { area: number | string; cost?: number; passive?: boolean }
  ospfv3?: { area: number | string; cost?: number; passive?: boolean }   // 'ipv6 ospf <pid> area <a>'
  hsrp?: Hsrp                // redundant gateway (standby)
  nameif?: string            // ASA: logical name (inside, outside, dmz)
  securityLevel?: number     // ASA: 0-100
  stp?: { cost?: number; portPriority?: number }
  clockRate?: number         // serial DCE
  bandwidth?: number         // kbps
  speed?: string
  duplex?: 'auto' | 'full' | 'half'
  confidence?: Confidence
  notes?: string
}

export interface StaticRoute {
  prefix: string             // "0.0.0.0/0"
  nextHop?: string
  exitInterface?: string
  ad?: number
  description?: string
}

export interface OspfConfig {
  processId?: number
  routerId?: string
  networks?: { prefix: string; area: number | string }[]
  passiveInterfaces?: string[]
  defaultOriginate?: boolean
  referenceBandwidth?: number
}

export interface EigrpConfig {
  as: number
  routerId?: string
  networks?: string[]
  passiveInterfaces?: string[]
}

export interface RipConfig {
  version?: 1 | 2
  networks?: string[]
  passiveInterfaces?: string[]
  defaultOriginate?: boolean
  noAutoSummary?: boolean
}

export interface BgpConfig {
  as: number
  routerId?: string
  neighbors: { ip: string; remoteAs: number; description?: string }[]
  networks?: string[]
}

export interface Hsrp {
  group: number
  ip: string                 // virtual IP (the hosts' gateway)
  priority?: number          // default 100
  preempt?: boolean
  version?: 1 | 2
}

export interface Ospfv3Config {
  processId?: number
  routerId?: string          // required if the device has no IPv4
  passiveInterfaces?: string[]
  defaultOriginate?: boolean
}

export interface IpsecTunnel {
  name: string               // used to name the crypto map, transform-set and ACL
  peer: string               // public IP of the remote end
  localInterface: string     // interface where the crypto map is applied
  psk: string                // pre-shared key (placeholder in production)
  localNetworks: string[]
  remoteNetworks: string[]
  ike?: { encryption?: string; hash?: string; group?: number; lifetime?: number }
  transform?: string         // e.g. "esp-aes 256 esp-sha-hmac"
}

export interface Routing {
  ipRouting?: boolean        // l3switch: 'ip routing'
  static?: StaticRoute[]
  ipv6Static?: { prefix: string; nextHop?: string; exitInterface?: string }[]
  ospf?: OspfConfig
  eigrp?: EigrpConfig
  rip?: RipConfig
  bgp?: BgpConfig
  ospfv3?: Ospfv3Config
}

export interface DhcpPool {
  name: string
  network: string            // "192.168.10.0/24"
  defaultRouter?: string
  dns?: string[]
  domain?: string
  leaseDays?: number
}

export interface Services {
  dhcp?: { excluded?: { from: string; to?: string }[]; pools: DhcpPool[] }
  dns?: { records: { name: string; type: 'A' | 'AAAA' | 'CNAME'; value: string }[] }
  nat?: {
    insideSources?: string[]                       // prefixes to translate
    overloadInterface?: string                     // PAT using this interface's IP
    pool?: { name: string; start: string; end: string; prefix: number; overload?: boolean }
    static?: { inside: string; outside: string }[]
    aclName?: string                               // name/number of the generated ACL (default "1")
  }
  http?: boolean
  https?: boolean
  ftp?: boolean
  tftp?: boolean
  email?: boolean
  syslog?: boolean
  ntp?: boolean                                    // the device acts as an NTP server (Server-PT)
  ntpServer?: string                               // client: 'ntp server X'
  syslogServer?: string                            // client: 'logging host X'
  snmp?: { community: string; mode: 'ro' | 'rw' }
}

export interface AclEntry {
  action: 'permit' | 'deny' | 'remark'
  protocol?: string          // ip | tcp | udp | icmp | ...
  src?: string               // "any" | "host 1.2.3.4" | "1.2.3.4" | "192.168.10.0/24"
  dst?: string
  srcPort?: string           // "eq 80" | "range 20 21" | "gt 1023"
  dstPort?: string
  established?: boolean
  log?: boolean
  text?: string              // for remark
}

export interface Acl {
  name: string               // numeric => classic numbered ACL
  type: 'standard' | 'extended'
  entries: AclEntry[]
}

export interface SecurityConfig {
  enableSecret?: string
  consolePassword?: string
  vtyPassword?: string
  servicePasswordEncryption?: boolean
  banner?: string
  ssh?: { domain: string; username: string; password: string; modulus?: number }
  vtyAcl?: string
  minPasswordLength?: number
}

export interface StpConfig {
  mode?: 'pvst' | 'rapid-pvst' | 'mst'
  rootPrimary?: number[]
  rootSecondary?: number[]
  priorities?: { vlans: number[]; priority: number }[]
}

export interface Device {
  id: string
  type: DeviceType
  label?: string
  vendor?: string
  model?: string             // e.g. "2911", "ISR4331", "2960-24TT", "PC-PT"
  platform?: Platform
  role?: Role
  tier?: number              // forced row in the diagram
  zone?: string
  status?: Status
  confidence?: Confidence
  interfaces: Iface[]
  gateway?: string           // hosts and L2 switches (ip default-gateway)
  dns?: string[]
  ipv6Gateway?: string
  vlans?: number[]           // VLANs to create on this switch (default: the ones it uses)
  routing?: Routing
  services?: Services
  acls?: Acl[]
  stp?: StpConfig
  vtpMode?: 'server' | 'client' | 'transparent' | 'off'
  security?: SecurityConfig
  extraConfig?: string[]     // unmodeled IOS lines (flagged as unverified)
  mac?: string               // base MAC (STP tie-breaker); the id is used if missing
  vpn?: { siteToSite: IpsecTunnel[] }
  firewall?: { inspectIcmp?: boolean; sameSecurityPermit?: boolean }   // ASA
  notes?: string
}

export interface Link {
  id?: string
  a: string                  // "R1:GigabitEthernet0/0" or "PC1" (if the device has a single interface)
  b: string
  medium?: Medium
  speed?: string
  status?: Status
  label?: string
  dce?: 'a' | 'b'            // DCE end on serial links
  confidence?: Confidence
  notes?: string
}

export interface Zone {
  id: string
  label?: string
  kind?: 'site' | 'building' | 'security' | 'cloud' | 'other'
  devices: string[]
  color?: string
}

export interface Layout {
  algorithm?: 'hierarchical' | 'circular' | 'manual'
  positions?: Record<string, { x: number; y: number }>
}

export interface Test {
  from: string               // source device id
  to: string                 // device id or IP
  type?: 'ping'
  expect?: 'success' | 'fail'
  description?: string
}

export interface NetworkModel {
  $schema?: string
  modelVersion: number
  meta: Meta
  vlans?: Vlan[]
  devices: Device[]
  links: Link[]
  zones?: Zone[]
  layout?: Layout
  tests?: Test[]
}

// ---- Analysis results ----

export type Severity = 'error' | 'warning' | 'info'

export interface Diagnostic {
  severity: Severity
  code: string
  message: string
  subject?: { device?: string; interface?: string; link?: string; vlan?: number }
  hint?: string
}

export const HOST_TYPES: ReadonlySet<DeviceType> = new Set<DeviceType>([
  'pc', 'laptop', 'server', 'printer', 'phone', 'tablet', 'smartphone', 'iot',
])
export const SWITCH_TYPES: ReadonlySet<DeviceType> = new Set<DeviceType>(['switch', 'l3switch'])
export const ROUTING_TYPES: ReadonlySet<DeviceType> = new Set<DeviceType>([
  'router', 'l3switch', 'firewall', 'wireless-router', 'internet', 'cloud',
])
