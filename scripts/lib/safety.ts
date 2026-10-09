// Safety boundaries shared by validation, generators and shareable artifacts.
import type { Device, Diagnostic, NetworkModel } from './model.ts'

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const HOSTNAME = /^[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/
const RESERVED = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype'].map((s) => s.toLowerCase()))
const DOS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const CONTROL = /[\x00-\x1f\x7f-\x9f\u2028\u2029]/
const PROSE = new Set(['description', 'notes', 'label', 'banner'])

export function checkCommandInputs(value: unknown, diags: Diagnostic[], path = '$', key = ''): void {
  if (typeof value === 'string') {
    // Prose is displayed as text or stripped to printable ASCII in CLI descriptions/banners.
    const text = PROSE.has(key) ? value.replace(/[\r\n\t]/g, '') : value
    if (CONTROL.test(text)) diags.push({ severity: 'error', code: 'CLI-CONTROL-CHAR', message: `${path}: control characters are not allowed in command values.` })
  } else if (Array.isArray(value)) value.forEach((v, i) => checkCommandInputs(v, diags, `${path}[${i}]`, key))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) checkCommandInputs(v, diags, `${path}.${k}`, k)
}

export function checkDeviceIdentity(dev: Device, diags: Diagnostic[]): void {
  if (typeof dev.id !== 'string' || !ID.test(dev.id) || DOS_NAME.test(dev.id) || RESERVED.has(dev.id.toLowerCase())) {
    diags.push({ severity: 'error', code: 'DEVICE-ID-UNSAFE', message: 'Device identifier must be 1-64 letters, digits, underscores or hyphens, start with a letter or digit, and avoid reserved names.' })
  }
  if (dev.hostname !== undefined || ['router', 'switch', 'l3switch', 'firewall', 'internet'].includes(dev.type)) {
    if (typeof (dev.hostname ?? dev.id) !== 'string' || !HOSTNAME.test(dev.hostname ?? dev.id)) {
      diags.push({ severity: 'error', code: 'DEVICE-HOSTNAME', message: `${dev.id}: hostname must start with a letter, end with a letter or digit, and contain at most 63 letters, digits or hyphens. Use hostname separately from id when needed.` })
    }
  }
}

export function checkInputSafety(model: unknown, diags: Diagnostic[]): void {
  checkCommandInputs(model, diags)
  const devices = (model as NetworkModel | null)?.devices
  if (!Array.isArray(devices)) return
  const seen = new Set<string>()
  for (const dev of devices) {
    if (!dev || typeof dev !== 'object') continue
    checkDeviceIdentity(dev, diags)
    if (typeof dev.id !== 'string') continue
    const name = dev.id.toLowerCase()
    if (seen.has(name)) diags.push({ severity: 'error', code: 'DEVICE-ID-COLLISION', message: `${dev.id}: identifiers must be unique without regard to case to avoid output filename collisions.` })
    seen.add(name)
  }
}

export function assertGenerationInputs(model: NetworkModel, dev: Device): void {
  const issues: Diagnostic[] = []
  checkInputSafety(model, issues)
  checkCommandInputs(dev, issues, 'device')
  checkDeviceIdentity(dev, issues)
  if (issues.length) throw new Error(issues[0].message)
}

/** Known structured secrets. Free-form prose still needs review before external sharing. */
export function secretValues(...models: (NetworkModel | undefined)[]): string[] {
  const values = new Set<string>()
  for (const model of models) for (const d of Array.isArray(model?.devices) ? model.devices : []) {
    if (!d) continue
    for (const s of [d.security?.enableSecret, d.security?.consolePassword, d.security?.vtyPassword, d.security?.ssh?.password, d.services?.snmp?.community, ...(Array.isArray(d.vpn?.siteToSite) ? d.vpn.siteToSite : []).map((t) => t?.psk)]) {
      if (typeof s === 'string' && s && !/^<[^>]+>$/.test(s) && !/^\$\{[^}]+\}$/.test(s)) values.add(s)
    }
  }
  return [...values].sort((a, b) => b.length - a.length)
}

export function redactText(text: string, values: string[]): string {
  if (!values.length) return text
  const pattern = values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return text.replace(new RegExp(pattern, 'g'), '<SECRET>')
}

export function redactData<T>(value: T, ...models: (NetworkModel | undefined)[]): T {
  const secrets = secretValues(...models)
  // Public identity/routing fields may legitimately equal a weak password. Preserve
  // their meaning and linkage. Config strings have already had credential slots redacted.
  const structural = new Set(['id', 'device', 'deviceId', 'from', 'to', 'subject', 'path', 'name', 'hostname', 'iface', 'interface', 'short', 'peer', 'in', 'out', 'a', 'b', 'members', 'switches', 'root', 'gateways', 'gateway', 'prefix', 'ip', 'ipv6', 'type', 'mode', 'kind', 'status', 'expect', 'evidence', 'severity', 'code', 'platform', 'vendor', 'model', 'role', 'zone', 'target', 'via', 'config'])
  function clean(v: unknown, key = ''): unknown {
    if (typeof v === 'string') return structural.has(key) ? v : redactText(v, secrets)
    if (Array.isArray(v)) return v.map((x) => clean(x, key))
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const path = typeof obj.path === 'string' ? obj.path : ''
      return Object.fromEntries(Object.entries(obj).map(([k, x]) => {
        if (k === 'extraConfig' || ((k === 'before' || k === 'after') && /(?:^|\.)extraConfig(?:\[|$)/.test(path))) return [k, '[QUARANTINED] unsupported configuration omitted']
        if ((k === 'before' || k === 'after') && /(?:^|\.)(?:enableSecret|consolePassword|vtyPassword|password|psk|community)$/.test(path)) return [k, '<SECRET>']
        return [k, clean(x, (k === 'before' || k === 'after') && path ? path.split('.').at(-1)! : k)]
      }))
    }
    return v
  }
  return clean(value) as T
}

export function previewDevice(dev: Device): Device {
  const d = structuredClone(dev)
  if (d.security) {
    for (const k of ['enableSecret', 'consolePassword', 'vtyPassword'] as const) if (d.security[k] !== undefined) d.security[k] = '<SECRET>'
    if (d.security.ssh) d.security.ssh.password = '<SECRET>'
  }
  if (d.services?.snmp) d.services.snmp.community = '<COMMUNITY>'
  for (const t of d.vpn?.siteToSite ?? []) t.psk = '<SECRET>'
  delete d.extraConfig
  return d
}
