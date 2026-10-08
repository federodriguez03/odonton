# Revisión de tablas legacy de autogestión

Fecha de revisión: 2026-08-12

## Estado posterior: retiro controlado

El 2026-08-12 se retiraron `public.autogestion_tokens` y `public.tokens_autogestion` mediante la migración controlada `database/2026-08-12_remove_legacy_autogestion_tokens.sql`.

Antes de ejecutarla se confirmó nuevamente que ambas tablas tenían 0 filas y ningún consumidor ejecutable en `backend/src` o `frontend/src`. También se validó el backup completo privado `odonton_db_2026-08-12.backup` mediante `pg_restore --list`.

La comprobación posterior confirmó que ambas tablas dejaron de existir y que las tablas activas del sistema permanecieron disponibles.

## Alcance y seguridad

Esta revisión se realizó exclusivamente mediante consultas `SELECT` dentro de una transacción PostgreSQL configurada como `READ ONLY`.

No se consultaron ni documentaron tokens, teléfonos, JWT ni datos personales. Los resultados incluidos son únicamente conteos agregados y metadatos de fechas.

Durante la inspección documentada en las secciones siguientes no se ejecutaron operaciones de escritura. El retiro posterior se realizó exclusivamente mediante la migración indicada arriba.

## Conexión

- Conexión PostgreSQL: correcta.
- Esquema inspeccionado: `public`.
- Estado confirmado de la transacción: `transaction_read_only = on`.
- Tablas encontradas: `autogestion_tokens` y `tokens_autogestion`.

## Tabla `autogestion_tokens`

### Contenido agregado

| Métrica | Resultado |
|---|---:|
| Total de filas | 0 |
| Fecha mínima de `created_at` | No aplica |
| Fecha máxima de `created_at` | No aplica |
| Filas con `paciente_id` informado | 0 |
| Filas con `turno_id` informado | 0 |
| Filas con `usado_en_turno_id` informado | 0 |
| Filas con `used_at` informado | 0 |
| Filas expiradas | 0 |
| Filas no expiradas | 0 |

No existen estados ni tipos de flujo para agrupar porque la tabla no contiene filas.

### Integridad referencial agregada

| Referencia | Cantidad huérfana |
|---|---:|
| `paciente_id` sin paciente existente | 0 |
| `turno_id` sin turno existente | 0 |
| `usado_en_turno_id` sin turno existente | 0 |

### Uso actual

La búsqueda en `backend/src` y `frontend/src` no encontró consumidores ejecutables de `autogestion_tokens`.

Referencias históricas o documentales conservadas:

- `database/2026-05-05_recordatorios_whatsapp.sql`
- `database/schema_actual.sql`
- `database/2026-08-12_remove_legacy_autogestion_tokens.sql`

### Conclusión

- TABLA: `autogestion_tokens`
- FILAS: 0
- DATOS RECIENTES: No existen datos.
- CONSUMIDORES DE CÓDIGO: Ninguno encontrado.
- REFERENCIAS HUÉRFANAS: 0.
- RIESGO DE RETIRO: **BAJO**.
- RESULTADO: **ELIMINADA MEDIANTE MIGRACIÓN CONTROLADA**.

## Tabla `tokens_autogestion`

### Contenido agregado

| Métrica | Resultado |
|---|---:|
| Total de filas | 0 |
| Fecha mínima de `created_at` | No aplica |
| Fecha máxima de `created_at` | No aplica |
| Filas con `usado = true` | 0 |
| Filas con `usado = false` | 0 |
| Filas con `usado` sin informar | 0 |
| Filas expiradas | 0 |
| Filas no expiradas | 0 |
| Cantidad de `turno_id` distintos | 0 |

### Integridad referencial agregada

| Referencia | Cantidad huérfana |
|---|---:|
| Filas cuyo `turno_id` no existe | 0 |
| `turno_id` huérfanos distintos | 0 |

### Uso actual

La búsqueda en `backend/src` y `frontend/src` no encontró consumidores ejecutables de `tokens_autogestion`.

Referencias históricas o documentales conservadas:

- `database/schema_actual.sql`
- `database/2026-08-12_remove_legacy_autogestion_tokens.sql`

### Conclusión

- TABLA: `tokens_autogestion`
- FILAS: 0
- DATOS RECIENTES: No existen datos.
- CONSUMIDORES DE CÓDIGO: Ninguno encontrado.
- REFERENCIAS HUÉRFANAS: 0.
- RIESGO DE RETIRO: **BAJO**.
- RESULTADO: **ELIMINADA MEDIANTE MIGRACIÓN CONTROLADA**.

## Conclusión general

Las dos tablas estaban vacías, no poseían consumidores en el código actual y no tenían referencias huérfanas. Después de validar el backup completo previo, fueron retiradas mediante una migración explícita y acotada.
