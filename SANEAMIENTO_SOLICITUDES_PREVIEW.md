# FASE 2B.4C.3 — Preview de saneamiento de solicitudes históricas

Fecha del análisis: 16/08/2026.

## Precondiciones

**BACKUP CONFIRMADO:** SÍ  
**RUTA:** `C:\Users\Usuario\Desktop\Backups Odonton\odonton_db_2026-08-16_223722.backup`  
**FECHA/HORA:** 16/08/2026 22:37:23 (America/Buenos_Aires)  
**FORMATO:** PostgreSQL custom, backup completo con esquema y datos  
**TAMAÑO:** 122.642 bytes  
**VALIDACIÓN:** `pg_restore --list` correcto; contiene `pacientes`, `turnos`, `pagos` y `prestaciones`.

**BACKEND DETENIDO AL INICIAR Y DURANTE LA SIMULACIÓN:** SÍ  
La inspección inmediatamente anterior a la transacción encontró únicamente el servidor Vite del frontend. No se detectó `src/server.js`, nodemon ni otro proceso Node del backend Odonton.

**ESTADO EN LA VALIDACIÓN FINAL:** BACKEND ACTIVO  
Después de completarse el rollback y crearse este informe apareció un proceso `node src/server.js` (PID 9824, iniciado el 16/08/2026 a las 22:39:38). Desde su detección no se realizó ninguna nueva consulta ni operación sobre PostgreSQL. Antes de una futura ejecución real del script deberá detenerse nuevamente el backend.

## Fotografía actual anterior a la simulación

Total de solicitudes con `estado = 'pendiente'`: **10**.

| Categoría | Descripción | Cantidad |
|---|---|---:|
| A | Turno cancelado | 9 |
| B | Turno realizado | 1 |
| C | Turno rechazado | 0 |
| D | `nuevo_turno`/`primera_consulta` con turno ya aceptado | 0 |
| E | `reprogramacion` con turno ya atendido | 0 |
| F | Solicitudes coherentemente pendientes | 0 |
| G | Casos ambiguos no contemplados | 0 |

Desglose agregado de las diez inconsistencias:

| Tipo de solicitud | Estado del turno | Cantidad |
|---|---|---:|
| `cancelacion` | `cancelado` | 4 |
| `nuevo_turno` | `cancelado` | 3 |
| `nuevo_turno` | `realizado` | 1 |
| `primera_consulta` | `cancelado` | 1 |
| `reprogramacion` | `cancelado` | 1 |

IDs técnicos afectados por la regla inequívoca de resolución: **3, 4, 5, 6, 7, 8, 9, 10, 11 y 12**. No se consultaron ni documentaron nombres, DNI o teléfonos.

## Simulación transaccional

La simulación ejecutó los `UPDATE` acotados dentro de `BEGIN` y finalizó obligatoriamente con `ROLLBACK`.

**PASARÍAN A RESUELTA:** 10  
**PASARÍAN A RECHAZADA:** 0  
**PERMANECERÍAN PENDIENTES:** 0  
**CASOS AMBIGUOS:** 0

### Controles dentro de la transacción

| Control | Cantidad |
|---|---:|
| Pendiente + turno cancelado | 0 |
| Pendiente + turno realizado | 0 |
| Pendiente + turno rechazado | 0 |
| `nuevo_turno`/`primera_consulta` pendiente + confirmado | 0 |
| `reprogramacion` pendiente + reprogramado | 0 |

Las solicitudes históricas detectadas cumplen reglas inequívocas. No aparecieron combinaciones ambiguas ni se tomó ninguna decisión por aproximación.

## Rollback y fotografía posterior

**ROLLBACK EJECUTADO:** SÍ

Después del rollback se compararon nuevamente todas las solicitudes mediante sus campos técnicos `id`, `estado`, `updated_at` y `turno_id`.

**FOTOGRAFÍA DESPUÉS DEL ROLLBACK:** coincide exactamente con la fotografía anterior.  
**PENDIENTES DESPUÉS DEL ROLLBACK:** 10.  
**DISTRIBUCIÓN DESPUÉS DEL ROLLBACK:** A = 9, B = 1, C = 0, D = 0, E = 0, F = 0, G = 0.

## Script reproducible

**SCRIPT CREADO:** `database/sanear_solicitudes_historicas.sql`

El script contiene una transacción explícita, dos actualizaciones acotadas, consultas agregadas de control y `COMMIT`. Durante esta fase el archivo fue creado, pero **no fue ejecutado**.

## Confirmaciones finales

**UPDATE REAL EJECUTADO:** NO  
**COMMIT REAL EJECUTADO:** NO  
**SOLICITUDES REALES MODIFICADAS:** NO  
**TURNOS MODIFICADOS:** NO  
**ESTRUCTURA BD MODIFICADA:** NO  
**MIGRACIONES:** NINGUNA  
**WHATSAPP:** NO  
**CÓDIGO FUNCIONAL MODIFICADO:** NO  
**FRONTEND MODIFICADO:** NO  
**COMMIT GIT:** NO
