// Normalización de nombres de interfaz (abreviaturas IOS → nombre completo) y rangos.

const PREFIJOS: [RegExp, string, string][] = [
  // [patrón de abreviatura, nombre completo, nombre corto]
  [/^(te|ten|tengig|tengigabitethernet)$/i, 'TenGigabitEthernet', 'Te'],
  [/^(gi|g|gig|gigabit|gigabitethernet)$/i, 'GigabitEthernet', 'Gi'],
  [/^(fa|f|fas|fast|fastethernet)$/i, 'FastEthernet', 'Fa'],
  [/^(e|eth|ethernet)$/i, 'Ethernet', 'Eth'],
  [/^(s|se|ser|serial)$/i, 'Serial', 'Se'],
  [/^(lo|loop|loopback)$/i, 'Loopback', 'Lo'],
  [/^(vl|vlan)$/i, 'Vlan', 'Vlan'],
  [/^(po|port-channel|portchannel)$/i, 'Port-channel', 'Po'],
  [/^(tu|tunnel)$/i, 'Tunnel', 'Tu'],
]

/** Devuelve el nombre IOS completo: "gi0/0" → "GigabitEthernet0/0". Nombres desconocidos se conservan. */
export function normalizeIfName(nombre: string): string {
  const t = nombre.trim()
  const m = t.match(/^([A-Za-z-]+)\s*(\d[\d/.:]*)$/)
  if (!m) return t
  for (const [patron, completo] of PREFIJOS) {
    if (patron.test(m[1])) return `${completo}${m[2]}`
  }
  return t
}

/** Clave de comparación insensible a mayúsculas, espacios y abreviaturas. */
export function ifKey(nombre: string): string {
  return normalizeIfName(nombre).toLowerCase().replace(/\s+/g, '')
}

export function shortIfName(nombre: string): string {
  const completo = normalizeIfName(nombre)
  const m = completo.match(/^([A-Za-z-]+)(\d[\d/.:]*)$/)
  if (!m) return completo
  for (const [, largo, corto] of PREFIJOS) {
    if (largo === m[1]) return `${corto}${m[2]}`
  }
  return completo
}

/** Expande "FastEthernet0/1-24" → [FastEthernet0/1, ..., FastEthernet0/24]. Sin rango devuelve [nombre]. */
export function expandRange(nombre: string): string[] {
  const m = nombre.trim().match(/^(.*?)(\d+)\s*-\s*(\d+)$/)
  if (!m || !/[/\s]$|[A-Za-z]$/.test(m[1])) return [nombre.trim()]
  const desde = Number(m[2])
  const hasta = Number(m[3])
  if (hasta < desde || hasta - desde > 512) return [nombre.trim()]
  const lista: string[] = []
  for (let i = desde; i <= hasta; i++) lista.push(`${m[1]}${i}`)
  return lista
}

export function isRange(nombre: string): boolean {
  return expandRange(nombre).length > 1
}

/** Parte "R1:GigabitEthernet0/0" en dispositivo e interfaz (la interfaz puede faltar). */
export function splitEndpoint(ref: string): { device: string; iface?: string } {
  const i = ref.indexOf(':')
  if (i < 0) return { device: ref.trim() }
  return { device: ref.slice(0, i).trim(), iface: ref.slice(i + 1).trim() }
}

/** Ordenamiento natural ("Fa0/2" < "Fa0/10"). */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
