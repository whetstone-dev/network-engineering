# Documentación de infraestructura

## Contenido
- [Qué se genera automáticamente](#qué-se-genera-automáticamente)
- [Qué debe redactar Claude](#qué-debe-redactar-claude)
- [Resumen ejecutivo](#resumen-ejecutivo)
- [Procedimientos operativos](#procedimientos-operativos)
- [Mantener la documentación viva](#mantener-la-documentación-viva)

## Qué se genera automáticamente

`node scripts/netlab.ts docs red.net.json` (o `build`) produce un Markdown con:

| Sección | Contenido |
|---|---|
| Resumen ejecutivo | Plataforma, conteo por tipo, VLAN, protocolos, servicios, resultado de validación y pruebas |
| Inventario | Dispositivo, tipo, modelo, plataforma, rol, zona |
| VLAN | ID, nombre, red, gateway, rango útil, hosts, uso, equipos que la transportan |
| Direccionamiento | Dispositivo, interfaz, IP, máscara, gateway, VLAN (incluye IP DHCP simulada) |
| Conexiones | Matriz origen ↔ destino con puerto, medio, tipo (trunk/access/routed), VLAN, subred |
| Puertos de switch | Rango, modo, VLAN, seguridad (port-security, portfast, bpduguard, EtherChannel), conectado a |
| Routing | Tablas simuladas por equipo L3 |
| Validación y pruebas | Hallazgos y pings con camino de ida y vuelta |
| Configuraciones | CLI por equipo e instrucciones GUI |
| Verificación | Comandos `show` por equipo según sus funciones |

Las tablas se pueden insertar tal cual en otros documentos. No las reescriba a mano: regenere desde el modelo.

## Qué debe redactar Claude

Complemente (no duplique) lo generado:
- **Decisiones de diseño** y su justificación (topología elegida, esquema de direccionamiento, por qué OSPF y no estático, por qué VLAN nativa sin uso).
- **Supuestos** y datos pendientes (marcados).
- **Riesgos** y puntos únicos de falla; recomendaciones de evolución.
- **Diferencias laboratorio vs producción** si aplica.

## Resumen ejecutivo

Para lectores no técnicos, 5-8 líneas: propósito de la red, alcance (sedes, usuarios), segmentación (cuántas VLAN y para qué), conectividad externa, seguridad principal, estado de validación y siguientes pasos. Sin comandos.

## Procedimientos operativos

Cuando se pidan, documente en formato numerado y verificable:
- Alta de un usuario/puerto (VLAN, port-security, documentar en el modelo).
- Agregar una VLAN (crear en todos los switches del camino, permitir en trunks, SVI/subinterfaz, pool DHCP, ACL, actualizar modelo).
- Respaldo de configuración (`copy running-config tftp:` / `write memory`), restauración.
- Cambio de contraseñas / rotación de claves SSH.
- Troubleshooting de primer nivel (enlazar a la tabla síntoma → causa de `references/troubleshooting.md`).

## Mantener la documentación viva

- El archivo `*.net.json` es la documentación canónica; versionarlo (git) junto a los `.md`/`.html` generados.
- Tras cualquier cambio: editar el modelo → `validate` → `build` → revisar diferencias.
- Si el usuario entrega `show running-config` actualizados, reconcilie el modelo con ellos (ver `references/analysis.md`).
