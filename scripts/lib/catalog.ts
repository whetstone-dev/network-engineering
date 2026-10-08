// Catalog of common Cisco Packet Tracer models (and their real-world equivalents).
// Used to validate interface names and adjust the generated syntax.
// If a model is not listed here, interface validation is simply skipped.

import type { DeviceType, Platform } from './model.ts'
import { expandRange, ifKey } from './names.ts'

export interface CatalogEntry {
  model: string
  aliases: string[]
  type: DeviceType
  platform: Platform
  interfaces: string[]           // fixed interfaces (ranges allowed)
  modular?: RegExp[]             // interfaces that appear when modules are installed
  modules?: string               // modules in human-readable form (messages and documentation)
  strict: boolean                // false = do not warn about unknown interfaces
  trunkEncapsulation?: 'required' | 'absent' | 'verify'
  vty: string                    // range of VTY lines to configure
  notes: string[]
}

const SERIAL_HWIC = /^serial0\/[0-3]\/[0-1]$/
const SERIAL_NIM = /^serial0\/[1-2]\/[0-1]$/

export const CATALOG: CatalogEntry[] = [
  {
    model: '1841', aliases: ['cisco1841'], type: 'router', platform: 'ios',
    interfaces: ['FastEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 with WIC-2T/HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 12.4. Serial ports via WIC-2T/HWIC-2T module (power off the device to install it).'],
  },
  {
    model: '1941', aliases: ['cisco1941'], type: 'router', platform: 'ios',
    interfaces: ['GigabitEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 with HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 15.x. Serial ports via HWIC-2T in an EHWIC slot (power off the device).'],
  },
  {
    model: '2811', aliases: ['cisco2811'], type: 'router', platform: 'ios',
    interfaces: ['FastEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 with HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 12.4. Built-in FastEthernet only.'],
  },
  {
    model: '2901', aliases: ['cisco2901'], type: 'router', platform: 'ios',
    interfaces: ['GigabitEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 with HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 15.x.'],
  },
  {
    model: '2911', aliases: ['cisco2911', 'isr2911'], type: 'router', platform: 'ios',
    interfaces: ['GigabitEthernet0/0-2'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 with HWIC-2T (slot 0 = Serial0/0/0-1)', strict: true, vty: '0 4',
    notes: [
      'IOS 15.x. The most common router in Packet Tracer CCNA labs.',
      'IPsec/ZBF require: license boot module c2900 technology-package securityk9 + reload.',
    ],
  },
  {
    model: 'ISR4321', aliases: ['4321', 'isr4321/k9'], type: 'router', platform: 'iosxe',
    interfaces: ['GigabitEthernet0/0/0-1'], modular: [SERIAL_NIM], modules: 'Serial0/1/0-1 with NIM-2T', strict: true, vty: '0 4',
    notes: ['IOS XE. Interfaces in slot/subslot/port format. Serial ports via NIM-2T.'],
  },
  {
    model: 'ISR4331', aliases: ['4331', 'isr4331/k9'], type: 'router', platform: 'iosxe',
    interfaces: ['GigabitEthernet0/0/0-2'], modular: [SERIAL_NIM], modules: 'Serial0/1/0-1 with NIM-2T', strict: true, vty: '0 4',
    notes: ['IOS XE. Interfaces in slot/subslot/port format. Serial ports via NIM-2T.'],
  },
  {
    model: 'Router-PT', aliases: ['router-pt-empty'], type: 'router', platform: 'ios',
    interfaces: ['FastEthernet0/0', 'FastEthernet1/0', 'Serial2/0', 'Serial3/0', 'FastEthernet4/0', 'FastEthernet5/0'],
    strict: false, vty: '0 4',
    notes: ['Generic PT router; does not exist as real hardware. Swappable modules.'],
  },
  {
    model: '2950-24', aliases: ['2950'], type: 'switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24'], strict: true, trunkEncapsulation: 'absent', vty: '0 15',
    notes: ['Legacy L2 switch. No Gigabit uplinks.'],
  },
  {
    model: '2950T-24', aliases: ['2950t'], type: 'switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24', 'GigabitEthernet0/1-2'], strict: true, trunkEncapsulation: 'absent', vty: '0 15',
    notes: [],
  },
  {
    model: '2960-24TT', aliases: ['2960', '2960-24tt-l', 'ws-c2960-24tt-l'], type: 'switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24', 'GigabitEthernet0/1-2'], strict: true, trunkEncapsulation: 'absent', vty: '0 15',
    notes: ['Standard L2 access switch in CCNA labs. Does not support "switchport trunk encapsulation".'],
  },
  {
    model: '3560-24PS', aliases: ['3560', 'ws-c3560-24ps'], type: 'l3switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24', 'GigabitEthernet0/1-2'], strict: true, trunkEncapsulation: 'required', vty: '0 15',
    notes: [
      'Multilayer: requires "switchport trunk encapsulation dot1q" before "switchport mode trunk".',
      'Enable "ip routing" to route between SVIs.',
    ],
  },
  {
    model: '3650-24PS', aliases: ['3650', 'ws-c3650-24ps'], type: 'l3switch', platform: 'iosxe',
    interfaces: ['GigabitEthernet1/0/1-24', 'GigabitEthernet1/1/1-4'], strict: true, trunkEncapsulation: 'verify', vty: '0 15',
    notes: [
      'In Packet Tracer it ships WITHOUT a power supply: drag AC-POWER-SUPPLY into the slot to power it on.',
      'IOS XE. dot1q only; check whether the version accepts/requires "switchport trunk encapsulation dot1q".',
    ],
  },
  {
    model: 'Switch-PT', aliases: [], type: 'switch', platform: 'ios',
    interfaces: [], strict: false, trunkEncapsulation: 'absent', vty: '0 15',
    notes: ['Generic PT switch; swappable modules. Does not exist as real hardware.'],
  },
  {
    model: 'ASA5505', aliases: ['asa 5505', '5505'], type: 'firewall', platform: 'asa',
    interfaces: ['Ethernet0/0-7'], strict: true, vty: '0 4',
    notes: ['Physical L2 ports assigned to VLAN interfaces (nameif/security-level under "interface vlan").', 'ASA syntax, not IOS.'],
  },
  {
    model: 'ASA5506-X', aliases: ['5506-x', 'asa5506'], type: 'firewall', platform: 'asa',
    interfaces: ['GigabitEthernet1/1-8', 'Management1/1'], strict: true, vty: '0 4',
    notes: ['Routed interfaces with nameif/security-level set directly. ASA syntax.'],
  },
  {
    model: 'PC-PT', aliases: ['pc'], type: 'pc', platform: 'endpoint',
    interfaces: ['FastEthernet0'], modular: [/^wireless0$/], modules: 'Wireless0 with a wireless module', strict: true, vty: '',
    notes: ['IP settings in Desktop > IP Configuration. Command line in Desktop > Command Prompt.'],
  },
  {
    model: 'Laptop-PT', aliases: ['laptop'], type: 'laptop', platform: 'endpoint',
    interfaces: ['FastEthernet0'], modular: [/^wireless0$/], modules: 'Wireless0 with WPC300N', strict: true, vty: '',
    notes: ['For Wi-Fi: power off, remove the Ethernet module and insert WPC300N (Wireless0 appears).'],
  },
  {
    model: 'Server-PT', aliases: ['server'], type: 'server', platform: 'endpoint',
    interfaces: ['FastEthernet0'], strict: true, vty: '',
    notes: ['Services via GUI (Services tab): DHCP, DNS, HTTP/HTTPS, FTP, TFTP, EMAIL, NTP, SYSLOG, AAA.'],
  },
  {
    model: 'Printer-PT', aliases: ['printer'], type: 'printer', platform: 'endpoint',
    interfaces: ['FastEthernet0'], strict: true, vty: '', notes: [],
  },
  {
    model: 'AccessPoint-PT', aliases: ['accesspoint', 'ap-pt'], type: 'ap', platform: 'other',
    interfaces: ['Port 0', 'Port 1'], strict: false, vty: '',
    notes: ['Port 0 = Ethernet, Port 1 = radio. SSID and security via GUI (Config > Port 1).'],
  },
  {
    model: 'WRT300N', aliases: ['linksys'], type: 'wireless-router', platform: 'other',
    interfaces: ['Internet', 'Ethernet 1-4', 'Wireless'], strict: false, vty: '',
    notes: ['SOHO router configured via GUI (GUI tab): Internet, DHCP, Wireless.'],
  },
  {
    model: 'Cloud-PT', aliases: ['cloud'], type: 'cloud', platform: 'other',
    interfaces: [], strict: false, vty: '', notes: ['PT cloud to simulate WAN/ISP (DSL, cable, Frame Relay).'],
  },
]

export function lookupModel(model: string | undefined): CatalogEntry | undefined {
  if (!model) return undefined
  const k = model.trim().toLowerCase()
  return CATALOG.find((e) => e.model.toLowerCase() === k || e.aliases.includes(k))
}

export function catalogInterfaces(e: CatalogEntry): string[] {
  return e.interfaces.flatMap(expandRange)
}

/** Does the interface exist on this model? null = cannot tell. */
export function interfaceExists(e: CatalogEntry, nombre: string): boolean | null {
  const base = nombre.split('.')[0] // subinterfaces inherit from the physical interface
  const k = ifKey(base)
  if (/^(vlan|loopback|port-channel|tunnel)\d+/.test(k)) return true
  if (catalogInterfaces(e).some((i) => ifKey(i) === k)) return true
  if (e.modular?.some((r) => r.test(k))) return true
  return e.strict ? false : null
}

/** Hardware notices that must be resolved physically in PT (modules, power supply). */
export function hardwareNotes(model: string | undefined, ifaceNames: string[]): string[] {
  const e = lookupModel(model)
  if (!e) return []
  const notas: string[] = []
  const fijas = catalogInterfaces(e).map(ifKey)
  const usaModulo = ifaceNames.some((n) => {
    const k = ifKey(n.split('.')[0])
    return !fijas.includes(k) && !!e.modular?.some((r) => r.test(k))
  })
  if (usaModulo && e.modules) notas.push(`Install module with the device powered off: ${e.modules}`)
  if (e.model === '3650-24PS') notas.push('Install AC-POWER-SUPPLY power supply')
  return notas
}
