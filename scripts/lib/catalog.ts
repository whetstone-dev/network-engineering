// Catálogo de modelos frecuentes en Cisco Packet Tracer (y su equivalente real).
// Sirve para validar nombres de interfaz y ajustar la sintaxis generada.
// Si un modelo no está aquí, la validación de interfaces simplemente se omite.

import type { DeviceType, Platform } from './model.ts'
import { expandRange, ifKey } from './names.ts'

export interface CatalogEntry {
  model: string
  aliases: string[]
  type: DeviceType
  platform: Platform
  interfaces: string[]           // interfaces fijas (admite rangos)
  modular?: RegExp[]             // interfaces que aparecen al instalar módulos
  modules?: string               // módulos en lenguaje legible (mensajes y documentación)
  strict: boolean                // false = no advertir interfaces desconocidas
  trunkEncapsulation?: 'required' | 'absent' | 'verify'
  vty: string                    // rango de líneas VTY a configurar
  notes: string[]
}

const SERIAL_HWIC = /^serial0\/[0-3]\/[0-1]$/
const SERIAL_NIM = /^serial0\/[1-2]\/[0-1]$/

export const CATALOG: CatalogEntry[] = [
  {
    model: '1841', aliases: ['cisco1841'], type: 'router', platform: 'ios',
    interfaces: ['FastEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 con WIC-2T/HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 12.4. Seriales con módulo WIC-2T/HWIC-2T (apagar el equipo para instalarlo).'],
  },
  {
    model: '1941', aliases: ['cisco1941'], type: 'router', platform: 'ios',
    interfaces: ['GigabitEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 con HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 15.x. Seriales con HWIC-2T en slot EHWIC (apagar el equipo).'],
  },
  {
    model: '2811', aliases: ['cisco2811'], type: 'router', platform: 'ios',
    interfaces: ['FastEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 con HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 12.4. Solo FastEthernet integradas.'],
  },
  {
    model: '2901', aliases: ['cisco2901'], type: 'router', platform: 'ios',
    interfaces: ['GigabitEthernet0/0-1'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 con HWIC-2T', strict: true, vty: '0 4',
    notes: ['IOS 15.x.'],
  },
  {
    model: '2911', aliases: ['cisco2911', 'isr2911'], type: 'router', platform: 'ios',
    interfaces: ['GigabitEthernet0/0-2'], modular: [SERIAL_HWIC], modules: 'Serial0/x/0-1 con HWIC-2T (slot 0 = Serial0/0/0-1)', strict: true, vty: '0 4',
    notes: [
      'IOS 15.x. Router más usado en los labs CCNA de Packet Tracer.',
      'IPsec/ZBF requieren: license boot module c2900 technology-package securityk9 + reload.',
    ],
  },
  {
    model: 'ISR4321', aliases: ['4321', 'isr4321/k9'], type: 'router', platform: 'iosxe',
    interfaces: ['GigabitEthernet0/0/0-1'], modular: [SERIAL_NIM], modules: 'Serial0/1/0-1 con NIM-2T', strict: true, vty: '0 4',
    notes: ['IOS XE. Interfaces con formato slot/subslot/puerto. Seriales con NIM-2T.'],
  },
  {
    model: 'ISR4331', aliases: ['4331', 'isr4331/k9'], type: 'router', platform: 'iosxe',
    interfaces: ['GigabitEthernet0/0/0-2'], modular: [SERIAL_NIM], modules: 'Serial0/1/0-1 con NIM-2T', strict: true, vty: '0 4',
    notes: ['IOS XE. Interfaces con formato slot/subslot/puerto. Seriales con NIM-2T.'],
  },
  {
    model: 'Router-PT', aliases: ['router-pt-empty'], type: 'router', platform: 'ios',
    interfaces: ['FastEthernet0/0', 'FastEthernet1/0', 'Serial2/0', 'Serial3/0', 'FastEthernet4/0', 'FastEthernet5/0'],
    strict: false, vty: '0 4',
    notes: ['Router genérico de PT; no existe como hardware real. Módulos intercambiables.'],
  },
  {
    model: '2950-24', aliases: ['2950'], type: 'switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24'], strict: true, trunkEncapsulation: 'absent', vty: '0 15',
    notes: ['Switch L2 antiguo. Sin uplinks Gigabit.'],
  },
  {
    model: '2950T-24', aliases: ['2950t'], type: 'switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24', 'GigabitEthernet0/1-2'], strict: true, trunkEncapsulation: 'absent', vty: '0 15',
    notes: [],
  },
  {
    model: '2960-24TT', aliases: ['2960', '2960-24tt-l', 'ws-c2960-24tt-l'], type: 'switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24', 'GigabitEthernet0/1-2'], strict: true, trunkEncapsulation: 'absent', vty: '0 15',
    notes: ['Switch L2 de acceso estándar en labs CCNA. No admite "switchport trunk encapsulation".'],
  },
  {
    model: '3560-24PS', aliases: ['3560', 'ws-c3560-24ps'], type: 'l3switch', platform: 'ios',
    interfaces: ['FastEthernet0/1-24', 'GigabitEthernet0/1-2'], strict: true, trunkEncapsulation: 'required', vty: '0 15',
    notes: [
      'Multicapa: requiere "switchport trunk encapsulation dot1q" antes de "switchport mode trunk".',
      'Habilitar "ip routing" para enrutar entre SVIs.',
    ],
  },
  {
    model: '3650-24PS', aliases: ['3650', 'ws-c3650-24ps'], type: 'l3switch', platform: 'iosxe',
    interfaces: ['GigabitEthernet1/0/1-24', 'GigabitEthernet1/1/1-4'], strict: true, trunkEncapsulation: 'verify', vty: '0 15',
    notes: [
      'En Packet Tracer viene SIN fuente de poder: arrastrar AC-POWER-SUPPLY al slot para encenderlo.',
      'IOS XE. Solo dot1q; verificar si la versión acepta/requiere "switchport trunk encapsulation dot1q".',
    ],
  },
  {
    model: 'Switch-PT', aliases: [], type: 'switch', platform: 'ios',
    interfaces: [], strict: false, trunkEncapsulation: 'absent', vty: '0 15',
    notes: ['Switch genérico de PT; módulos intercambiables. No existe como hardware real.'],
  },
  {
    model: 'ASA5505', aliases: ['asa 5505', '5505'], type: 'firewall', platform: 'asa',
    interfaces: ['Ethernet0/0-7'], strict: true, vty: '0 4',
    notes: ['Puertos físicos L2 asignados a interfaces VLAN (nameif/security-level en "interface vlan").', 'Sintaxis ASA, no IOS.'],
  },
  {
    model: 'ASA5506-X', aliases: ['5506-x', 'asa5506'], type: 'firewall', platform: 'asa',
    interfaces: ['GigabitEthernet1/1-8', 'Management1/1'], strict: true, vty: '0 4',
    notes: ['Interfaces ruteadas con nameif/security-level directamente. Sintaxis ASA.'],
  },
  {
    model: 'PC-PT', aliases: ['pc'], type: 'pc', platform: 'endpoint',
    interfaces: ['FastEthernet0'], modular: [/^wireless0$/], modules: 'Wireless0 con un módulo inalámbrico', strict: true, vty: '',
    notes: ['Configuración IP en Desktop > IP Configuration. Prompt de comandos en Desktop > Command Prompt.'],
  },
  {
    model: 'Laptop-PT', aliases: ['laptop'], type: 'laptop', platform: 'endpoint',
    interfaces: ['FastEthernet0'], modular: [/^wireless0$/], modules: 'Wireless0 con WPC300N', strict: true, vty: '',
    notes: ['Para Wi-Fi: apagar, quitar el módulo Ethernet y poner WPC300N (aparece Wireless0).'],
  },
  {
    model: 'Server-PT', aliases: ['server'], type: 'server', platform: 'endpoint',
    interfaces: ['FastEthernet0'], strict: true, vty: '',
    notes: ['Servicios por GUI (Services): DHCP, DNS, HTTP/HTTPS, FTP, TFTP, EMAIL, NTP, SYSLOG, AAA.'],
  },
  {
    model: 'Printer-PT', aliases: ['printer'], type: 'printer', platform: 'endpoint',
    interfaces: ['FastEthernet0'], strict: true, vty: '', notes: [],
  },
  {
    model: 'AccessPoint-PT', aliases: ['accesspoint', 'ap-pt'], type: 'ap', platform: 'other',
    interfaces: ['Port 0', 'Port 1'], strict: false, vty: '',
    notes: ['Port 0 = Ethernet, Port 1 = radio. SSID y seguridad por GUI (Config > Port 1).'],
  },
  {
    model: 'WRT300N', aliases: ['linksys'], type: 'wireless-router', platform: 'other',
    interfaces: ['Internet', 'Ethernet 1-4', 'Wireless'], strict: false, vty: '',
    notes: ['Router SOHO configurado por GUI (GUI tab): Internet, DHCP, Wireless.'],
  },
  {
    model: 'Cloud-PT', aliases: ['cloud'], type: 'cloud', platform: 'other',
    interfaces: [], strict: false, vty: '', notes: ['Nube de PT para simular WAN/ISP (DSL, cable, Frame Relay).'],
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

/** ¿Existe la interfaz en el modelo? null = no se puede saber. */
export function interfaceExists(e: CatalogEntry, nombre: string): boolean | null {
  const base = nombre.split('.')[0] // subinterfaces heredan de la física
  const k = ifKey(base)
  if (/^(vlan|loopback|port-channel|tunnel)\d+/.test(k)) return true
  if (catalogInterfaces(e).some((i) => ifKey(i) === k)) return true
  if (e.modular?.some((r) => r.test(k))) return true
  return e.strict ? false : null
}

/** Avisos de hardware que deben resolverse físicamente en PT (módulos, fuente de poder). */
export function hardwareNotes(model: string | undefined, ifaceNames: string[]): string[] {
  const e = lookupModel(model)
  if (!e) return []
  const notas: string[] = []
  const fijas = catalogInterfaces(e).map(ifKey)
  const usaModulo = ifaceNames.some((n) => {
    const k = ifKey(n.split('.')[0])
    return !fijas.includes(k) && !!e.modular?.some((r) => r.test(k))
  })
  if (usaModulo && e.modules) notas.push(`Instalar módulo con el equipo apagado: ${e.modules}`)
  if (e.model === '3650-24PS') notas.push('Instalar fuente AC-POWER-SUPPLY')
  return notas
}
