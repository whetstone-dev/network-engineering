// Cálculo de direccionamiento IPv4/IPv6 sin dependencias.
// Las direcciones IPv4 se manejan como enteros sin signo de 32 bits; IPv6 como bigint.

export interface Cidr4 { ip: number; prefix: number }

export function parseIpv4(texto: string): number | null {
  const partes = texto.trim().split('.')
  if (partes.length !== 4) return null
  let valor = 0
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p)) return null
    const octeto = Number(p)
    if (octeto > 255) return null
    valor = valor * 256 + octeto
  }
  return valor >>> 0
}

export function formatIpv4(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export function maskFromPrefix(prefix: number): number {
  if (prefix <= 0) return 0
  if (prefix >= 32) return 0xffffffff
  return (0xffffffff << (32 - prefix)) >>> 0
}

export function prefixToMask(prefix: number): string {
  return formatIpv4(maskFromPrefix(prefix))
}

export function prefixToWildcard(prefix: number): string {
  return formatIpv4(~maskFromPrefix(prefix) >>> 0)
}

/** Convierte una máscara punteada a prefijo; null si la máscara no es contigua. */
export function maskToPrefix(mascara: string): number | null {
  const n = parseIpv4(mascara)
  if (n === null) return null
  let prefijo = 0
  while (prefijo < 32 && (n & (0x80000000 >>> prefijo)) !== 0) prefijo++
  return maskFromPrefix(prefijo) === n ? prefijo : null
}

/** Acepta "a.b.c.d/nn" o "a.b.c.d mascara". */
export function parseCidr4(texto: string): Cidr4 | null {
  const t = texto.trim()
  const conBarra = t.match(/^(\S+)\/(\d{1,2})$/)
  if (conBarra) {
    const ip = parseIpv4(conBarra[1])
    const prefix = Number(conBarra[2])
    if (ip === null || prefix > 32) return null
    return { ip, prefix }
  }
  const conMascara = t.match(/^(\S+)\s+(\S+)$/)
  if (conMascara) {
    const ip = parseIpv4(conMascara[1])
    const prefix = maskToPrefix(conMascara[2])
    if (ip === null || prefix === null) return null
    return { ip, prefix }
  }
  return null
}

export function networkOf(ip: number, prefix: number): number {
  return (ip & maskFromPrefix(prefix)) >>> 0
}

export function broadcastOf(ip: number, prefix: number): number {
  return (networkOf(ip, prefix) | (~maskFromPrefix(prefix) >>> 0)) >>> 0
}

export function containsIp(net: Cidr4, ip: number): boolean {
  return networkOf(ip, net.prefix) === networkOf(net.ip, net.prefix)
}

export function overlaps(a: Cidr4, b: Cidr4): boolean {
  const menor = Math.min(a.prefix, b.prefix)
  return networkOf(a.ip, menor) === networkOf(b.ip, menor)
}

export function cidrKey(c: Cidr4): string {
  return `${formatIpv4(networkOf(c.ip, c.prefix))}/${c.prefix}`
}

/** Hosts utilizables según el prefijo (/31 = 2 por RFC 3021, /32 = 1). */
export function usableHosts(prefix: number): number {
  if (prefix === 32) return 1
  if (prefix === 31) return 2
  return 2 ** (32 - prefix) - 2
}

export interface SubnetInfo {
  cidr: string
  network: string
  broadcast: string
  mask: string
  wildcard: string
  prefix: number
  firstHost: string
  lastHost: string
  usableHosts: number
  totalAddresses: number
  ipClass: string
  isPrivate: boolean
}

export function subnetInfo(texto: string): SubnetInfo {
  const c = parseCidr4(texto)
  if (!c) throw new Error(`CIDR IPv4 inválido: "${texto}" (use 192.168.1.0/24 o "192.168.1.0 255.255.255.0")`)
  const red = networkOf(c.ip, c.prefix)
  const bc = broadcastOf(c.ip, c.prefix)
  const puntoAPunto = c.prefix >= 31
  return {
    cidr: `${formatIpv4(red)}/${c.prefix}`,
    network: formatIpv4(red),
    broadcast: c.prefix === 32 ? formatIpv4(red) : formatIpv4(bc),
    mask: prefixToMask(c.prefix),
    wildcard: prefixToWildcard(c.prefix),
    prefix: c.prefix,
    firstHost: formatIpv4(puntoAPunto ? red : red + 1),
    lastHost: formatIpv4(puntoAPunto ? bc : bc - 1),
    usableHosts: usableHosts(c.prefix),
    totalAddresses: 2 ** (32 - c.prefix),
    ipClass: classOf(c.ip),
    isPrivate: isPrivate(c.ip),
  }
}

export function classOf(ip: number): string {
  const primero = ip >>> 24
  if (primero < 128) return 'A'
  if (primero < 192) return 'B'
  if (primero < 224) return 'C'
  if (primero < 240) return 'D (multicast)'
  return 'E (experimental)'
}

/** Red con clase (classful) que contiene la IP; útil para 'network' de RIP. */
export function classfulNetwork(ip: number): Cidr4 {
  const primero = ip >>> 24
  const prefix = primero < 128 ? 8 : primero < 192 ? 16 : 24
  return { ip: networkOf(ip, prefix), prefix }
}

export function isPrivate(ip: number): boolean {
  const priv: Cidr4[] = [
    { ip: parseIpv4('10.0.0.0')!, prefix: 8 },
    { ip: parseIpv4('172.16.0.0')!, prefix: 12 },
    { ip: parseIpv4('192.168.0.0')!, prefix: 16 },
  ]
  return priv.some((p) => containsIp(p, ip))
}

/** Interpreta un comodín de ACL: "any", "host X", "X" (host), "X/len" o "X wildcard". */
export function parseAclAddress(texto: string | undefined): { ip: number; wildcard: number } | null {
  const t = (texto ?? 'any').trim().toLowerCase()
  if (t === 'any') return { ip: 0, wildcard: 0xffffffff }
  const host = t.match(/^host\s+(\S+)$/)
  if (host) {
    const ip = parseIpv4(host[1])
    return ip === null ? null : { ip, wildcard: 0 }
  }
  if (t.includes('/')) {
    const c = parseCidr4(t)
    return c ? { ip: networkOf(c.ip, c.prefix), wildcard: ~maskFromPrefix(c.prefix) >>> 0 } : null
  }
  const dos = t.split(/\s+/)
  if (dos.length === 2) {
    const ip = parseIpv4(dos[0])
    const wc = parseIpv4(dos[1])
    return ip === null || wc === null ? null : { ip, wildcard: wc }
  }
  const solo = parseIpv4(t)
  return solo === null ? null : { ip: solo, wildcard: 0 }
}

export function aclMatches(addr: { ip: number; wildcard: number }, ip: number): boolean {
  const cuidar = ~addr.wildcard >>> 0
  return ((addr.ip & cuidar) >>> 0) === ((ip & cuidar) >>> 0)
}

// ---------------- VLSM ----------------

export interface VlsmRequest { name: string; hosts: number }
export interface VlsmAllocation extends SubnetInfo { name: string; requestedHosts: number }

/** Asigna subredes de mayor a menor dentro del bloque base. Lanza error si no caben. */
export function vlsm(base: string, solicitudes: VlsmRequest[]): VlsmAllocation[] {
  const b = parseCidr4(base)
  if (!b) throw new Error(`Bloque base inválido: "${base}"`)
  const inicio = networkOf(b.ip, b.prefix)
  const fin = broadcastOf(b.ip, b.prefix)
  const ordenadas = [...solicitudes].sort((x, y) => y.hosts - x.hosts)
  const resultado: VlsmAllocation[] = []
  let cursor = inicio
  for (const s of ordenadas) {
    if (!Number.isInteger(s.hosts) || s.hosts < 1) throw new Error(`Cantidad de hosts inválida para "${s.name}": ${s.hosts}`)
    let prefijo = 32
    while (prefijo > 0 && usableHosts(prefijo) < s.hosts) prefijo--
    // /31 y /32 solo tienen sentido para enlaces P2P o loopbacks; VLSM clásico usa /30 como mínimo
    if (prefijo > 30) prefijo = 30
    const tam = 2 ** (32 - prefijo)
    cursor = Math.ceil(cursor / tam) * tam
    if (cursor + tam - 1 > fin) {
      throw new Error(`No hay espacio en ${base} para "${s.name}" (${s.hosts} hosts, /${prefijo}).`)
    }
    resultado.push({ ...subnetInfo(`${formatIpv4(cursor)}/${prefijo}`), name: s.name, requestedHosts: s.hosts })
    cursor += tam
  }
  return resultado
}

// ---------------- IPv6 ----------------

export interface Cidr6 { ip: bigint; prefix: number }

export function parseIpv6(texto: string): bigint | null {
  let t = texto.trim().toLowerCase()
  if (t.includes('%')) t = t.split('%')[0]
  // Sufijo IPv4 embebido (p.ej. ::ffff:192.0.2.1)
  const v4 = t.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const n = parseIpv4(v4[2])
    if (n === null) return null
    t = `${v4[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`
  }
  const dobles = t.split('::')
  if (dobles.length > 2) return null
  const izq = dobles[0] ? dobles[0].split(':') : []
  const der = dobles.length === 2 && dobles[1] ? dobles[1].split(':') : []
  const faltan = 8 - izq.length - der.length
  if (dobles.length === 1 && faltan !== 0) return null
  if (dobles.length === 2 && faltan < 1) return null
  const grupos = [...izq, ...Array(dobles.length === 2 ? faltan : 0).fill('0'), ...der]
  let valor = 0n
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    valor = (valor << 16n) | BigInt(parseInt(g, 16))
  }
  return valor
}

/** Formato canónico RFC 5952 (minúsculas, compresión del tramo de ceros más largo). */
export function formatIpv6(valor: bigint): string {
  const grupos: number[] = []
  for (let i = 7; i >= 0; i--) grupos.push(Number((valor >> BigInt(i * 16)) & 0xffffn))
  let mejorInicio = -1
  let mejorLargo = 0
  for (let i = 0; i < 8;) {
    if (grupos[i] !== 0) { i++; continue }
    let j = i
    while (j < 8 && grupos[j] === 0) j++
    if (j - i > mejorLargo && j - i >= 2) { mejorInicio = i; mejorLargo = j - i }
    i = j
  }
  const hex = grupos.map((g) => g.toString(16))
  if (mejorInicio < 0) return hex.join(':')
  const izq = hex.slice(0, mejorInicio).join(':')
  const der = hex.slice(mejorInicio + mejorLargo).join(':')
  return `${izq}::${der}`
}

export function parseCidr6(texto: string): Cidr6 | null {
  const m = texto.trim().match(/^(.+)\/(\d{1,3})$/)
  if (!m) return null
  const ip = parseIpv6(m[1])
  const prefix = Number(m[2])
  if (ip === null || prefix > 128) return null
  return { ip, prefix }
}

function mask6(prefix: number): bigint {
  if (prefix <= 0) return 0n
  const todos = (1n << 128n) - 1n
  return (todos << BigInt(128 - prefix)) & todos
}

export function network6(c: Cidr6): bigint {
  return c.ip & mask6(c.prefix)
}

export function contains6(net: Cidr6, ip: bigint): boolean {
  return (ip & mask6(net.prefix)) === network6(net)
}

/** Divide un prefijo IPv6 en subredes de longitud nuevoPrefijo (máximo `cantidad`). */
export function splitIpv6(base: string, nuevoPrefijo: number, cantidad: number): string[] {
  const c = parseCidr6(base)
  if (!c) throw new Error(`Prefijo IPv6 inválido: "${base}"`)
  if (nuevoPrefijo < c.prefix || nuevoPrefijo > 128) {
    throw new Error(`El nuevo prefijo /${nuevoPrefijo} debe estar entre /${c.prefix} y /128`)
  }
  const disponibles = 1n << BigInt(nuevoPrefijo - c.prefix)
  const n = BigInt(cantidad) > disponibles ? Number(disponibles) : cantidad
  const paso = 1n << BigInt(128 - nuevoPrefijo)
  const resultado: string[] = []
  for (let i = 0; i < n; i++) resultado.push(`${formatIpv6(network6(c) + paso * BigInt(i))}/${nuevoPrefijo}`)
  return resultado
}

/** Identificador de interfaz EUI-64 a partir de una MAC (invierte el bit U/L). */
export function eui64(mac: string, prefijo64: string): string {
  const limpia = mac.toLowerCase().replace(/[^0-9a-f]/g, '')
  if (limpia.length !== 12) throw new Error(`MAC inválida: "${mac}"`)
  const bytes = limpia.match(/../g)!.map((h) => parseInt(h, 16))
  bytes[0] ^= 0x02
  const id = [...bytes.slice(0, 3), 0xff, 0xfe, ...bytes.slice(3)]
  const c = parseCidr6(prefijo64)
  if (!c || c.prefix !== 64) throw new Error(`Se esperaba un prefijo /64: "${prefijo64}"`)
  let iid = 0n
  for (const b of id) iid = (iid << 8n) | BigInt(b)
  return `${formatIpv6(network6(c) | iid)}/64`
}
