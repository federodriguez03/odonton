# Revisión de tablas legacy de autogestión

Fecha de revisión: 2026-08-12

## Alcance y seguridad

Esta revisión se realizó exclusivamente mediante consultas `SELECT` dentro de una transacción PostgreSQL configurada como `READ ONLY`.

No se consultaron ni documentaron tokens, teléfonos, JWT ni datos personales. Los resultados incluidos son únicamente conteos agregados y metadatos de fechas.

No se ejecutaron operaciones `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `TRUNCATE` ni migraciones.

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
- `database/DIAGNOSTICO_BD.md`
- `REVISION_LEGACY.md`

### Conclusión

- TABLA: `autogestion_tokens`
- FILAS: 0
- DATOS RECIENTES: No existen datos.
- CONSUMIDORES DE CÓDIGO: Ninguno encontrado.
- REFERENCIAS HUÉRFANAS: 0.
- RIESGO DE RETIRO: **BAJO**.
- RECOMENDACIÓN: **A. CANDIDATA A ELIMINACIÓN**.

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
- `database/DIAGNOSTICO_BD.md`
- `REVISION_LEGACY.md`

### Conclusión

- TABLA: `tokens_autogestion`
- FILAS: 0
- DATOS RECIENTES: No existen datos.
- CONSUMIDORES DE CÓDIGO: Ninguno encontrado.
- REFERENCIAS HUÉRFANAS: 0.
- RIESGO DE RETIRO: **BAJO**.
- RECOMENDACIÓN: **A. CANDIDATA A ELIMINACIÓN**.

## Conclusión general

Las dos tablas están vacías y no poseen consumidores en el código actual. Tampoco existen referencias huérfanas que requieran migración o reparación. Desde el punto de vista del contenido y del uso estático, ambas son candidatas a una eliminación posterior controlada.

Esta conclusión no elimina ni modifica las tablas. Cualquier retiro físico deberá realizarse en una fase distinta, con respaldo previo y una migración explícitamente autorizada.
