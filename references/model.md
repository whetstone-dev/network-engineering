# Modelo de red (`*.net.json`) — fuente única de verdad

## Contenido
- [Principio](#principio)
- [Estructura raíz](#estructura-raíz)
- [meta](#meta)
- [vlans](#vlans)
- [devices](#devices)
- [interfaces](#interfaces)
- [routing](#routing)
- [services](#services)
- [acls, security, stp](#acls-security-stp)
- [links](#links)
- [zones, layout, tests](#zones-layout-tests)
- [Redundancia, IPv6, firewall y VPN](#redundancia-ipv6-firewall-y-vpn)
- [Schema, importación y versiones](#schema-importación-y-versiones)
- [Convenciones y atajos](#convenciones-y-atajos)
- [Errores frecuentes al escribir el modelo](#errores-frecuentes-al-escribir-el-modelo)

## Principio

La red existe **primero** como JSON. Diagrama, configuraciones, documentación, tablas, validación y pruebas se **derivan** de él con `scripts/netlab.ts`. Nunca escriba una configuración o un diagrama "a mano" que no salga del modelo: si algo cambia, cambie el modelo y regenere.

Se eligió JSON (y no YAML) porque Node lo parsea sin dependencias, no tiene ambigüedades de tipos (`010`, `no`, `on`) y los tipos están definidos en `scripts/lib/model.ts` (la definición canónica; este documento la explica).

Plantilla mínima: `templates/model-skeleton.net.json`. Ejemplos completos en `examples/`.

## Estructura raíz

```json
{
  "modelVersion": 1,
  "meta": { "name": "...", "target": "packet-tracer" },
  "vlans": [],
  "devices": [],
  "links": [],
  "zones": [],
  "layout": { "algorithm": "hierarchical" },
  "tests": []
}
```

Obligatorios: `modelVersion` (= 1), `meta.name`, `devices`, `links`. `$schema` es opcional y activa el autocompletado en VS Code (ver [Schema](#schema-importación-y-versiones)).

## meta

| Campo | Valores | Uso |
|---|---|---|
| `name` | texto | Título del diagrama y del documento |
| `description` | texto | Subtítulo / resumen |
| `target` | `packet-tracer` · `ios` · `iosxe` · `generic` | Ajusta la sintaxis y las advertencias. `ios`/`iosxe` = producción: se avisan contraseñas débiles |
| `level` | `beginner` · `intermediate` · `advanced` | Laboratorios |
| `language` | `es`, `en`… | Idioma de la documentación |

## vlans

```json
{ "id": 10, "name": "VENTAS", "subnet": "192.168.10.0/24", "gateway": "192.168.10.1", "purpose": "data" }
```
`purpose`: `data`, `voice`, `management`, `native`, `blackhole`, `guest`, `servers`. `color` (hex) y `description` opcionales. El validador compara `subnet`/`gateway` con las SVI/subinterfaces reales.

**Misma VLAN en varias sedes** (VLAN 10 = 10.1.10.0/24 en SEDE-A y 10.2.10.0/24 en SEDE-B): declare la VLAN una sola vez **sin** `subnet`/`gateway`; el direccionamiento queda en las interfaces de cada sede. Si prefiere tablas por VLAN con su red, use IDs distintos por sede (110, 210).

## devices

| Campo | Descripción |
|---|---|
| `id` | Único; se usa como hostname. Sin espacios. |
| `label`, `vendor` | Texto mostrado en el diagrama · fabricante (`cisco`) |
| `type` | `router`, `switch`, `l3switch`, `firewall`, `wlc`, `ap`, `wireless-router`, `pc`, `laptop`, `server`, `printer`, `phone`, `tablet`, `smartphone`, `iot`, `cloud`, `internet`, `modem`, `hub`, `other` |
| `model` | Modelo PT/Cisco (`2911`, `ISR4331`, `2960-24TT`, `3560-24PS`, `3650-24PS`, `PC-PT`, `Server-PT`…). Si está en el catálogo (`netlab catalog`) se validan los nombres de interfaz. |
| `platform` | `ios`, `iosxe`, `asa`, `nxos`, `endpoint`, `other` (si falta, se toma del catálogo) |
| `role` | `internet`, `edge`, `core`, `distribution`, `access`, `server`, `endpoint`, `wireless` — fila en el diagrama |
| `tier` | Fuerza la fila del diagrama (0 = arriba) |
| `zone` | Etiqueta lógica (las cajas visuales se definen en `zones`) |
| `status` | `up`, `down`, `warning`, `error`, `unknown` (estado observado; por defecto "según diseño") |
| `confidence` | `confirmed`, `inferred`, `unknown` (análisis de capturas) |
| `gateway`, `dns` | Hosts y switches L2 (`ip default-gateway`) |
| `vlans` | VLAN a crear en un switch (por defecto: las que usan sus puertos) |
| `vtpMode` | `server`, `client`, `transparent`, `off` |
| `extraConfig` | Líneas IOS no modeladas. Se emiten al final y se marcan como **no verificadas**. |
| `mac` | MAC base del switch (desempate del root de STP; si falta se usa el id y se avisa) |
| `vpn` | Túneles IPsec site-to-site (ver [VPN](#redundancia-ipv6-firewall-y-vpn)) |
| `firewall` | ASA: `{ "inspectIcmp": true, "sameSecurityPermit": false }` |
| `notes` | Texto libre |
| `interfaces`, `routing`, `services`, `acls`, `security`, `stp` | **Por dispositivo** (dentro de cada objeto de `devices`), descritos en las secciones siguientes |

Esqueleto de un dispositivo:
```json
{ "id": "R1", "type": "router", "vendor": "cisco", "model": "2911", "role": "edge",
  "interfaces": [], "routing": {}, "services": {}, "acls": [], "security": {}, "stp": {} }
```

**Módulos de hardware**: no se declaran; basta con usar el nombre de interfaz que crea el módulo (p. ej. `Serial0/0/0` en un 2911 = HWIC-2T en el slot 0). `netlab catalog <modelo>` muestra integradas y modulares; la documentación generada lista en "Hardware" qué módulo instalar.

## interfaces

```json
{ "name": "GigabitEthernet0/0.10", "vlan": 10, "ip": "192.168.10.1/24", "description": "Gateway VENTAS" }
```

| Campo | Aplica a | Descripción |
|---|---|---|
| `name` | todas | Nombre IOS completo (se aceptan abreviaturas `gi0/0`). Rangos: `"FastEthernet0/1-10"` → `interface range`. |
| `mode` | todas | `routed`, `access`, `trunk`, `host`, `svi`, `subinterface`, `loopback`. **Se infiere**: `VlanX`→svi, `LoopbackX`→loopback, nombre con `.`→subinterface, hosts→host, switch→access, router→routed, l3switch con IP→routed |
| `ip` | L3 | `"a.b.c.d/nn"` |
| `ipv6`, `linkLocal` | L3 | `["2001:db8:acad:10::1/64"]`, `"fe80::1"` |
| `dhcp` | hosts / router | Cliente DHCP (`ip address dhcp` en routers) |
| `vlan` | access, subinterfaz, SVI | VLAN de acceso / `encapsulation dot1Q N` |
| `native` | subinterfaz | `encapsulation dot1Q N native` |
| `nativeVlan`, `allowedVlans` | trunk | Nativa (defecto 1) y lista permitida (defecto todas) |
| `voiceVlan` | access | `switchport voice vlan` |
| `shutdown`, `status` | todas | Apagada administrativamente / estado observado |
| `helper` | L3 | `ip helper-address` (relay DHCP) |
| `nat` | L3 | `inside` / `outside` |
| `acl` | L3 | `{ "in": "NOMBRE", "out": "NOMBRE" }` |
| `portSecurity` | access | `{ "maximum": 2, "sticky": true, "violation": "restrict", "macs": [] }` |
| `portfast`, `bpduguard` | access | STP edge |
| `channelGroup` | físicas | `{ "id": 1, "mode": "active" }`; declare también `Port-channel1` con la misma config L2 |
| `ospf` | L3 | `{ "area": 0, "cost": 10, "passive": true }` (alternativa a `routing.ospf.networks`) |
| `clockRate`, `bandwidth`, `speed`, `duplex` | físicas | Serial DCE: `clockRate: 64000`. `bandwidth` (kbps) cambia el costo OSPF y la métrica EIGRP |
| `ospfv3` | L3 IPv6 | `{ "area": 0, "cost": 10, "passive": false }` → `ipv6 ospf <pid> area <a>` |
| `hsrp` | SVI / L3 | `{ "group": 10, "ip": "10.1.10.1", "priority": 110, "preempt": true, "version": 2 }` |
| `nameif`, `securityLevel` | ASA | `"outside"`/`0`, `"inside"`/`100`, `"dmz"`/`50` |
| `stp` | puertos de switch | `{ "cost": 19, "portPriority": 128 }` (opcional; por defecto según velocidad) |

## routing

```json
"routing": {
  "ipRouting": true,
  "static": [{ "prefix": "0.0.0.0/0", "nextHop": "203.0.113.1" }],
  "ospf": { "processId": 1, "routerId": "1.1.1.1", "networks": [{ "prefix": "10.0.0.0/30", "area": 0 }],
            "passiveInterfaces": ["Vlan10"], "defaultOriginate": true },
  "eigrp": { "as": 100, "networks": ["10.0.0.0/30"], "passiveInterfaces": [] },
  "rip": { "version": 2, "networks": ["10.0.0.0"], "defaultOriginate": false },
  "bgp": { "as": 65001, "neighbors": [{ "ip": "203.0.113.1", "remoteAs": 65000 }], "networks": ["198.51.100.0/24"] }
}
```
- `static[].nextHop` y/o `exitInterface`; `ad` para ruta flotante.
- OSPF: `networks` explícitas **o** `interfaces[].ospf.area`. Las redes se emiten con wildcard (`network 10.0.0.0 0.0.0.3 area 0`).
- EIGRP/RIP sin `networks`: se anuncian todas las interfaces con IP excepto las `nat: outside`.
- `ipv6Static`: `[{ "prefix": "::/0", "nextHop": "2001:db8::1" }]`.

## services

```json
"services": {
  "dhcp": { "excluded": [{ "from": "192.168.10.1", "to": "192.168.10.10" }],
            "pools": [{ "name": "VENTAS", "network": "192.168.10.0/24", "defaultRouter": "192.168.10.1", "dns": ["8.8.8.8"] }] },
  "dns": { "records": [{ "name": "www.empresa.local", "type": "A", "value": "10.10.100.20" }] },
  "nat": { "insideSources": ["10.10.0.0/16"], "overloadInterface": "GigabitEthernet0/0/0",
           "static": [{ "inside": "10.10.100.20", "outside": "203.0.113.5" }] },
  "http": true, "https": true, "ftp": true, "tftp": true, "ntp": true,
  "ntpServer": "10.10.100.10", "syslogServer": "10.10.100.10", "snmp": { "community": "<COMUNIDAD>", "mode": "ro" }
}
```
- DHCP en **router** → CLI IOS. DHCP en **server** (Server-PT) → instrucciones de GUI (pool por red, Start IP calculado con `excluded`).
- NAT: `pool: { "name", "start", "end", "prefix", "overload" }` para NAT dinámica; `aclName` (defecto `"1"`).

## acls, security, stp

```json
"acls": [{ "name": "INVITADOS-IN", "type": "extended", "entries": [
  { "action": "remark", "text": "Solo Internet" },
  { "action": "permit", "protocol": "udp", "src": "any", "dst": "any", "dstPort": "eq bootps" },
  { "action": "deny", "protocol": "ip", "src": "10.10.50.0/24", "dst": "10.0.0.0/8" },
  { "action": "permit", "protocol": "ip", "src": "10.10.50.0/24", "dst": "any" } ] }],
"security": { "enableSecret": "class", "consolePassword": "cisco", "vtyPassword": "cisco", "servicePasswordEncryption": true,
              "banner": "Acceso restringido", "vtyAcl": "GESTION-VTY", "minPasswordLength": 8,
              "ssh": { "domain": "empresa.local", "username": "admin", "password": "<SECRETO>", "modulus": 2048 } },
"stp": { "mode": "rapid-pvst", "rootPrimary": [10, 20], "rootSecondary": [], "priorities": [{ "vlans": [30], "priority": 4096 }] }
```
- Direcciones de ACL: `any`, `host X`, `X` (host), `X/len`, `X wildcard`. Nombre numérico → ACL numerada clásica (`access-list 10 ...`).
- Contraseñas: valores de laboratorio solo con `target: packet-tracer`. En producción use marcadores (`<SECRETO>`) y que el usuario los reemplace.

## links

```json
{ "a": "R1:GigabitEthernet0/0", "b": "SW1:GigabitEthernet0/1", "medium": "copper-straight", "status": "up" }
```
- Extremo `"PC1"` sin interfaz: válido si el equipo tiene una sola interfaz física.
- `medium`: `copper-straight`, `copper-cross`, `fiber`, `serial`, `wireless`, `console`, `coaxial`, `phone`, `auto`.
- `dce`: `"a"`/`"b"` en seriales (el extremo DCE necesita `clockRate`).
- `id` opcional (por defecto `L1`, `L2`…), `label`, `speed`, `confidence`, `notes`.
- Una interfaz solo puede estar en un enlace. Las SVI, loopbacks y subinterfaces no se cablean.

## zones, layout, tests

```json
"zones": [{ "id": "dmz", "label": "DMZ", "kind": "security", "devices": ["SRV-WEB"] }],
"layout": { "algorithm": "hierarchical", "positions": { "R1": { "x": 400, "y": 110 } } },
"tests": [{ "from": "PC1", "to": "PC3", "expect": "success", "description": "Misma VLAN entre switches" }]
```
- `zones[].kind`: `site`, `building`, `security`, `cloud`, `other` (informativo); `color` opcional.
- `layout.algorithm`: `hierarchical` (defecto), `circular` (anillo/malla), `manual`. `positions` se obtiene con el botón **Layout** del diagrama tras reubicar equipos.
- `tests`: ping simulado ida y vuelta (`to` = id de equipo o IP). `expect: "fail"` para verificar aislamientos (ACL, VLAN).

## Redundancia, IPv6, firewall y VPN

**HSRP** (dos gateways para la misma VLAN): misma `hsrp.group` e `hsrp.ip` (VIP) en las SVI/subinterfaces de ambos equipos; los hosts usan la VIP como `gateway`. Gana el de mayor `priority` (empate: mayor IP). Alinee el activo HSRP con el root de STP de esa VLAN (`stp.rootPrimary`); el validador avisa si no coinciden (`STP-HSRP-MISALIGNED`).

**IPv6 / OSPFv3**: `ipv6` y `linkLocal` en interfaces; hosts con `ipv6Gateway` (normalmente la link-local fija del router, p. ej. `fe80::1`). OSPFv3 se activa por interfaz con `ospfv3.area` y se ajusta con `routing.ospfv3` (`routerId` obligatorio si el equipo no tiene IPv4).

**ASA** (`type: "firewall"`, `platform: "asa"`, `model: "ASA5506-X"` o `"ASA5505"`): cada interfaz L3 con `nameif` y `securityLevel`. En la 5505 los puertos `Ethernet0/x` son L2 (`"vlan": N`) y las `VlanN` llevan nameif/IP. NAT con `services.nat` (`insideSources` + `overloadInterface` → `nat (inside,outside) dynamic interface`; `static` → `nat (dmz,outside) static`). ACL igual que en IOS (el generador convierte a máscaras); se aplican con `interfaces[].acl.in` → `access-group`. Sin `firewall.inspectIcmp`, los ping hacia afuera no tienen respuesta.

**VPN IPsec site-to-site** (IOS crypto map), en cada extremo:
```json
"vpn": { "siteToSite": [{ "name": "HQ-BR", "peer": "198.51.100.2", "localInterface": "GigabitEthernet0/0", "psk": "<SECRETO>",
  "localNetworks": ["192.168.10.0/24"], "remoteNetworks": ["192.168.30.0/24"],
  "ike": { "encryption": "aes 256", "hash": "sha", "group": 14, "lifetime": 86400 }, "transform": "esp-aes 256 esp-sha-hmac" }] }
```
El otro extremo debe ser espejo (redes invertidas, misma PSK/IKE/transform). Si el router también hace PAT, el generador crea la ACL de NAT con la **exención** del tráfico de la VPN. `ike.group` por defecto: 5 en Packet Tracer, 14 en producción.

## Schema, importación y versiones

- **JSON Schema**: `schemas/network-model.schema.json`. Con `"$schema": "<ruta relativa al schema>"` VS Code autocompleta y marca errores mientras se escribe. `netlab init red.net.json` crea un modelo ya enlazado. `validate` usa el mismo schema y avisa de campos desconocidos con sugerencia (`allowedVlan` → `allowedVlans`).
- **Importar** una red existente: `netlab import <archivos|carpeta> -o red.net.json` con `show running-config` de cada equipo y, para el cableado, `show cdp neighbors detail` (incluyendo el prompt `R1#show cdp neighbors detail` para saber de qué equipo es). Sin CDP, solo se infieren los enlaces punto a punto (/30, /31). Contraseñas, claves y comunidades se reemplazan por `<SECRETO>`; lo no reconocido queda en `extraConfig`.
- **Comparar versiones**: `netlab diff viejo.net.json nuevo.net.json -o cambios.html` lista cambios por campo, problemas nuevos/resueltos y pruebas que cambian, y genera el diagrama con lo agregado (verde), modificado (ámbar) y eliminado (rojo punteado).

## Convenciones y atajos

- IDs en MAYÚSCULAS cortas (`R1`, `SW-ACC1`, `PC-V1`); se usan como hostname.
- Gateway = primera IP útil de cada subred salvo que el usuario indique otra cosa.
- VLAN nativa sin hosts (p. ej. 999) y VLAN de gestión separada: buena práctica, también en labs intermedios.
- Puertos de acceso en rangos (`FastEthernet0/1-10`) para mantener el modelo compacto; los enlaces apuntan a un puerto concreto del rango.
- Para hosts con DHCP, el análisis **simula** la IP que recibirían (marcada como simulada).

## Errores frecuentes al escribir el modelo

| Síntoma en `validate` | Causa típica en el JSON |
|---|---|
| `LINK-IF-NOT-FOUND` | El enlace usa una interfaz no declarada en `interfaces` |
| `LINK-IF-AMBIGUOUS` | Extremo sin interfaz en un equipo con varias |
| `IF-NOT-IN-MODEL` | Nombre que no existe en ese modelo (`Gi0/0/0` en un 2911, `Fa0/1` en un 3650) |
| `ROAS-ACCESS-PORT` | Puerto del switch hacia el router sin `"mode": "trunk"` |
| `ETHERCHANNEL-MEMBER-MISMATCH` | Miembros con config L2 distinta del `Port-channel` |
| `DHCP-NO-SERVER` | Falta `helper` en la SVI/subinterfaz o el pool no cubre la red |
