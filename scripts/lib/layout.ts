// Layout determinista del diagrama.
// - hierarchical: filas por función de red (Internet → borde → core → distribución → acceso → hosts),
//   calculadas con BFS 0-1 (pares del mismo nivel quedan en la misma fila) y árbol de subárboles centrados.
// - circular: infraestructura en círculo y hosts hacia afuera (anillo, malla).
// - manual: usa layout.positions y completa lo faltante con hierarchical.

import type { Device, NetworkModel, Role } from './model.ts'
import { HOST_TYPES } from './model.ts'
import type { ResolvedLink } from './l2.ts'
import { naturalCompare } from './names.ts'

export interface Pos { x: number; y: number }
export interface LayoutResult { positions: Record<string, Pos>; width: number; height: number }

const ROW = 215
const COL_INFRA = 170
const COL_HOST = 120
const MARGIN = 110

const RANK_ROLE: Record<Role, number> = { internet: 0, edge: 1, core: 2, distribution: 3, access: 4, wireless: 5, server: 5, endpoint: 6 }

export function baseRank(d: Device): number {
  if (d.role) return RANK_ROLE[d.role]
  switch (d.type) {
    case 'internet': case 'cloud': case 'modem': return 0
    case 'firewall': case 'router': case 'wireless-router': return 1
    case 'l3switch': case 'wlc': return 2
    case 'switch': return 3
    case 'hub': case 'ap': return 4
    default: return HOST_TYPES.has(d.type) ? 6 : 4
  }
}

const PEER_TYPES = new Set(['internet', 'cloud', 'router', 'firewall', 'l3switch', 'wlc', 'modem'])

function adjacency(model: NetworkModel, links: ResolvedLink[]): Map<string, string[]> {
  const adj = new Map<string, string[]>(model.devices.map((d) => [d.id, []]))
  for (const l of links) {
    if (l.a.dev.id === l.b.dev.id) continue
    adj.get(l.a.dev.id)?.push(l.b.dev.id)
    adj.get(l.b.dev.id)?.push(l.a.dev.id)
  }
  for (const [k, v] of adj) adj.set(k, [...new Set(v)].sort(naturalCompare))
  return adj
}

function hierarchical(model: NetworkModel, links: ResolvedLink[]): LayoutResult {
  const devs = new Map(model.devices.map((d) => [d.id, d]))
  const adj = adjacency(model, links)
  const tier = new Map<string, number>()
  const padre = new Map<string, string>()
  const orden: string[] = []
  const visit = new Set<string>()

  // Componentes conectados en orden de rango (los de mayor jerarquía primero)
  const porRango = [...model.devices].sort((a, b) => baseRank(a) - baseRank(b) || naturalCompare(a.id, b.id))
  for (const inicio of porRango) {
    if (visit.has(inicio.id)) continue
    // recolectar componente
    const comp: string[] = []
    const pila = [inicio.id]
    const enComp = new Set([inicio.id])
    while (pila.length) {
      const u = pila.pop()!
      comp.push(u)
      for (const v of adj.get(u) ?? []) if (!enComp.has(v)) { enComp.add(v); pila.push(v) }
    }
    const minimo = Math.min(...comp.map((id) => baseRank(devs.get(id)!)))
    const raices = comp.filter((id) => baseRank(devs.get(id)!) === minimo).sort(naturalCompare)
    // BFS 0-1
    const dq: string[] = []
    for (const r of raices) { tier.set(r, 0); dq.push(r) }
    const dist = new Map<string, number>(raices.map((r) => [r, 0]))
    while (dq.length) {
      const u = dq.shift()!
      if (visit.has(u)) continue
      visit.add(u)
      orden.push(u)
      const du = devs.get(u)!
      for (const v of adj.get(u) ?? []) {
        const dv = devs.get(v)!
        const peso = baseRank(du) === baseRank(dv) && PEER_TYPES.has(du.type) && PEER_TYPES.has(dv.type) ? 0 : 1
        const nd = dist.get(u)! + peso
        if (!dist.has(v) || nd < dist.get(v)!) {
          dist.set(v, nd)
          tier.set(v, nd)
          if (peso === 1) padre.set(v, u); else padre.delete(v)
          if (peso === 0) dq.unshift(v); else dq.push(v)
        }
      }
    }
  }
  // tiers forzados y compactación
  for (const d of model.devices) if (typeof d.tier === 'number') tier.set(d.id, d.tier)
  const usados = [...new Set(tier.values())].sort((a, b) => a - b)
  for (const [k, v] of tier) tier.set(k, usados.indexOf(v))

  // hijos ordenados: infraestructura primero, luego hosts
  const hijos = new Map<string, string[]>()
  for (const [h, p] of padre) {
    if (tier.get(h)! <= tier.get(p)!) continue
    if (!hijos.has(p)) hijos.set(p, [])
    hijos.get(p)!.push(h)
  }
  const esHost = (id: string): boolean => HOST_TYPES.has(devs.get(id)!.type)
  for (const lista of hijos.values()) lista.sort((a, b) => Number(esHost(a)) - Number(esHost(b)) || naturalCompare(a, b))
  const tieneParent = (id: string): boolean => padre.has(id) && (hijos.get(padre.get(id)!) ?? []).includes(id)
  const raices = orden.filter((id) => !tieneParent(id))

  const ancho = new Map<string, number>()
  const medir = (id: string): number => {
    const propio = esHost(id) ? COL_HOST : COL_INFRA
    const hs = hijos.get(id) ?? []
    const suma = hs.reduce((acc, h) => acc + medir(h), 0)
    const w = Math.max(propio, suma)
    ancho.set(id, w)
    return w
  }
  const pos: Record<string, Pos> = {}
  const colocar = (id: string, x0: number): void => {
    const w = ancho.get(id)!
    const hs = hijos.get(id) ?? []
    const suma = hs.reduce((acc, h) => acc + ancho.get(h)!, 0)
    let cursor = x0 + (w - suma) / 2
    for (const h of hs) { colocar(h, cursor); cursor += ancho.get(h)! }
    pos[id] = { x: x0 + w / 2, y: MARGIN + tier.get(id)! * ROW }
  }
  let x = MARGIN
  for (const r of raices) { medir(r); colocar(r, x); x += ancho.get(r)! + 30 }
  return finalizar(pos)
}

function circular(model: NetworkModel, links: ResolvedLink[]): LayoutResult {
  const adj = adjacency(model, links)
  const infra = model.devices.filter((d) => !HOST_TYPES.has(d.type)).map((d) => d.id)
  const radio = Math.max(220, infra.length * 55)
  const pos: Record<string, Pos> = {}
  const cx = MARGIN + radio + 160
  const cy = MARGIN + radio + 160
  infra.forEach((id, k) => {
    const ang = (2 * Math.PI * k) / Math.max(1, infra.length) - Math.PI / 2
    pos[id] = { x: cx + radio * Math.cos(ang), y: cy + radio * Math.sin(ang) }
  })
  const hosts = model.devices.filter((d) => HOST_TYPES.has(d.type))
  const porPadre = new Map<string, string[]>()
  for (const h of hosts) {
    const p = (adj.get(h.id) ?? []).find((v) => pos[v]) ?? '__sin__'
    if (!porPadre.has(p)) porPadre.set(p, [])
    porPadre.get(p)!.push(h.id)
  }
  for (const [p, hs] of porPadre) {
    const base = pos[p] ?? { x: cx, y: cy }
    const ang0 = Math.atan2(base.y - cy, base.x - cx)
    hs.forEach((h, k) => {
      const ang = ang0 + (k - (hs.length - 1) / 2) * 0.32
      pos[h] = { x: base.x + 150 * Math.cos(ang), y: base.y + 150 * Math.sin(ang) }
    })
  }
  return finalizar(pos)
}

function finalizar(pos: Record<string, Pos>): LayoutResult {
  const xs = Object.values(pos).map((p) => p.x)
  const ys = Object.values(pos).map((p) => p.y)
  const minX = Math.min(...xs, MARGIN)
  const minY = Math.min(...ys, MARGIN)
  for (const p of Object.values(pos)) { p.x = Math.round(p.x - minX + MARGIN); p.y = Math.round(p.y - minY + MARGIN) }
  return {
    positions: pos,
    width: Math.round(Math.max(...Object.values(pos).map((p) => p.x), 0) + MARGIN),
    height: Math.round(Math.max(...Object.values(pos).map((p) => p.y), 0) + MARGIN + 40),
  }
}

export function computeLayout(model: NetworkModel, links: ResolvedLink[]): LayoutResult {
  const alg = model.layout?.algorithm ?? 'hierarchical'
  const base = alg === 'circular' ? circular(model, links) : hierarchical(model, links)
  const manual = model.layout?.positions ?? {}
  if (Object.keys(manual).length === 0) return base
  for (const [id, p] of Object.entries(manual)) if (base.positions[id]) base.positions[id] = { x: p.x, y: p.y }
  const xs = Object.values(base.positions).map((p) => p.x)
  const ys = Object.values(base.positions).map((p) => p.y)
  return { positions: base.positions, width: Math.max(...xs) + MARGIN, height: Math.max(...ys) + MARGIN + 40 }
}
