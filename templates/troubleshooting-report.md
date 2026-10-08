# Troubleshooting: {{síntoma en una línea}}

## 1. Problema
- Qué falla: {{...}}
- Desde / hacia: {{...}}
- Desde cuándo / qué cambió: {{...}}

## 2. Alcance
{{Un host, una VLAN, un sitio, un servicio...}}

## 3. Evidencias
| # | Comando / fuente | Observación | Interpretación |
|---|---|---|---|
| 1 | `show ip interface brief` (R1) | {{...}} | {{...}} |

## 4. Revisión por capas
| Capa | Estado | Nota |
|---|---|---|
| Física | {{OK / falla / sin verificar}} | |
| Interfaces | | |
| VLAN / trunks | | |
| Direccionamiento / gateway | | |
| Routing (ida y vuelta) | | |
| ACL / firewall / NAT | | |
| Servicios (DHCP, DNS) | | |

## 5. Hipótesis descartadas
- {{Hipótesis}} — descartada porque {{evidencia}}.

## 6. Causa raíz
{{Explicación de por qué esta causa produce exactamente el síntoma.}}

## 7. Corrección
```
{{comandos exactos, por equipo}}
```

## 8. Verificación
- {{Comando}} → {{resultado esperado}}
- Pruebas: {{pings ida y vuelta}}

## 9. Prevención
- {{Cambio de proceso, documentación o diseño; actualizar el modelo *.net.json}}
