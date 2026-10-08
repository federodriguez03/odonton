# FASE 2B.4C.3 — Ejecución real del saneamiento histórico

Fecha de ejecución: 16/08/2026.

## Precondiciones

**BACKEND DETENIDO:** SÍ  
Se verificó inmediatamente antes de la fotografía fresca y nuevamente dentro del mismo comando que inició la transacción. No existían procesos `node src/server.js` ni `nodemon src/server.js`. Solo permanecía activo Vite del frontend.

**BACKUP NUEVO:** SÍ  
**RUTA:** `C:\Users\Usuario\Desktop\Backups Odonton\odonton_db_2026-08-16_224426.backup`  
**FECHA/HORA:** 16/08/2026 22:44:26 (America/Buenos_Aires)  
**FORMATO:** PostgreSQL custom, esquema y datos  
**TAMAÑO:** 122.642 bytes  
**VALIDACIÓN:** `pg_restore --list` correcto. El listado contiene `pacientes`, `turnos`, `pagos`, `prestaciones` y `turno_solicitudes`.

## Fotografía fresca anterior

**PENDIENTES ANTES:** 10  
**INCONSISTENTES:** 10  
**VÁLIDAS:** 0  
**AMBIGUAS:** 0

Desglose agregado, sin datos personales:

| Tipo de solicitud | Estado del turno | Cantidad |
|---|---|---:|
| `cancelacion` | `cancelado` | 4 |
| `nuevo_turno` | `cancelado` | 3 |
| `nuevo_turno` | `realizado` | 1 |
| `primera_consulta` | `cancelado` | 1 |
| `reprogramacion` | `cancelado` | 1 |

No aparecieron combinaciones ambiguas, por lo que se habilitó la ejecución real.

## Ejecución

Se ejecutó el cuerpo de `database/sanear_solicitudes_historicas.sql` dentro de una única transacción. Los controles fueron evaluados antes de autorizar el `COMMIT`.

**PASARON A RESUELTA:** 10  
**IDs TÉCNICOS MODIFICADOS:** 3, 4, 5, 6, 7, 8, 9, 10, 11 y 12  
**PASARON A RECHAZADA:** 0  
**IDs TÉCNICOS RECHAZADOS:** ninguno  
**SOLICITUDES VÁLIDAS QUE PERMANECIERON PENDIENTES:** 0

Todos los controles previos al commit devolvieron cero:

| Control | Cantidad |
|---|---:|
| Pendiente + turno cancelado | 0 |
| Pendiente + turno realizado | 0 |
| Pendiente + turno rechazado | 0 |
| `nuevo_turno`/`primera_consulta` pendiente + turno programado/confirmado/reprogramado | 0 |
| `reprogramacion` pendiente + turno reprogramado/confirmado | 0 |

**COMMIT EJECUTADO:** SÍ  
**ROLLBACK EJECUTADO:** NO

## Control posterior al commit

Los controles fueron repetidos fuera de la transacción.

**PENDIENTES DESPUÉS:** 0  
**INCONSISTENTES DESPUÉS:** 0  
**SOLICITUDES TOTALES ANTES:** 18  
**SOLICITUDES TOTALES DESPUÉS:** 18  
**HISTORIAL CONSERVADO:** SÍ

Distribución final:

| Estado | Cantidad |
|---|---:|
| `resuelta` | 15 |
| `rechazada` | 3 |

Se comparó la fotografía técnica completa de `turnos` antes y después del saneamiento. No cambió ninguna fila ni columna de esa tabla.

## Confirmaciones finales

**TURNOS MODIFICADOS:** NO  
**SOLICITUDES ELIMINADAS:** NO  
**ESTRUCTURA BD MODIFICADA:** NO  
**MIGRACIONES:** NINGUNA  
**WHATSAPP REAL:** NO  
**FRONTEND MODIFICADO:** NO  
**CÓDIGO FUNCIONAL MODIFICADO:** NO  
**COMMIT GIT:** NO

## Archivos

**ARCHIVO MODIFICADO:** `database/sanear_solicitudes_historicas.sql`  
**ARCHIVO CREADO:** `SANEAMIENTO_SOLICITUDES_EJECUCION.md`
