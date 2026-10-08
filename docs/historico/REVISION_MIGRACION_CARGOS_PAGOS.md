# Revisión de la migración Cargos / Pagos

Fecha: 2026-08-27

Migración preparada: `database/2026-08-27_create_cargos_rebuild_pagos.sql`.

Este informe documenta una revisión estática. La migración y las consultas de verificación **no fueron ejecutadas**.

## ESQUEMA ANTERIOR

La estructura que será reemplazada es `public.pagos`, definida actualmente en `database/schema_actual.sql`.

### Columnas

| Columna | Tipo actual | Nulabilidad/default | Situación |
|---|---|---|---|
| `id` | `INTEGER` | PK; default mediante `pagos_id_seq` | Identificador reutilizado conceptualmente. |
| `paciente_id` | `INTEGER` | NOT NULL | Se elimina de Pagos; el paciente se obtiene desde Cargo. |
| `turno_id` | `INTEGER` | nullable | Se mueve conceptualmente a Cargo. |
| `monto` | `NUMERIC(10,2)` | NOT NULL; mayor que cero | Se reemplaza por `pagos.importe NUMERIC(12,2)`. |
| `metodo_pago` | `VARCHAR(50)` | nullable | Columna desconectada; el nuevo modelo reutiliza el nombre con contrato estricto. |
| `estado` | `VARCHAR(30)` | default `pagado`; nullable | Semántica legacy; se reemplaza por `activo`/`anulado`. |
| `created_at` | `TIMESTAMPTZ` | default `NOW()`; nullable | Se recrea como NOT NULL. |
| `fecha_pago` | `TIMESTAMPTZ` | nullable | Se recrea como `DATE NOT NULL`. |
| `updated_at` | `TIMESTAMPTZ` | nullable | Se recrea como NOT NULL. |
| `metodo` | `TEXT` | nullable | Columna usada por el backend anterior; se elimina. |
| `observaciones` | `TEXT` | nullable | Se conserva conceptualmente. |

### Objetos dependientes actuales

- PK: `pagos_pkey (id)`.
- Secuencia: `public.pagos_id_seq`, propiedad de `pagos.id`.
- CHECK: `pagos_monto_check (monto > 0)`.
- FK: `fk_pago_paciente`, hacia `pacientes(id) ON DELETE RESTRICT`.
- FK: `fk_pago_turno`, hacia `turnos(id) ON DELETE SET NULL`.
- Índice: `idx_pagos_paciente (paciente_id)`.
- Índice: `idx_pagos_paciente_fecha (paciente_id, fecha_pago DESC)`.

Al ejecutar en el futuro `DROP TABLE public.pagos`, PostgreSQL retirará con la tabla sus constraints, índices y secuencia `SERIAL` dependiente. No se usa `CASCADE`.

La búsqueda sobre el esquema actual no encontró FKs externas que referencien `public.pagos`.

## ESQUEMA NUEVO

### `public.cargos`

Representa la obligación económica y conserva el snapshot histórico.

Columnas: `id`, `paciente_id`, `turno_id`, `prestacion_id`, `concepto`, `importe_total`, `fecha_cargo`, `observaciones`, `created_at`, `updated_at`.

Decisiones aplicadas:

- importe `NUMERIC(12,2)` positivo;
- concepto obligatorio y no vacío después de `BTRIM`;
- paciente obligatorio con borrado restringido;
- turno y prestación opcionales con `ON DELETE SET NULL`;
- fecha administrativa `DATE`;
- timestamps técnicos obligatorios;
- no almacena saldo, total abonado ni estado de cobro.

### `public.pagos`

Representa exclusivamente dinero recibido sobre un cargo.

Columnas: `id`, `cargo_id`, `importe`, `metodo_pago`, `fecha_pago`, `observaciones`, `estado`, `fecha_anulacion`, `motivo_anulacion`, `anulado_por_usuario_id`, `created_at`, `updated_at`.

Decisiones aplicadas:

- cada pago pertenece obligatoriamente a un cargo;
- importe `NUMERIC(12,2)` positivo;
- métodos limitados a `efectivo`, `tarjeta`, `transferencia`;
- estados limitados a `activo`, `anulado`;
- un pago activo no posee metadatos de anulación;
- un pago anulado exige fecha, motivo no vacío y usuario;
- no incluye `paciente_id`, `turno_id`, `monto`, `metodo`, saldo, total abonado ni estado de cobro;
- no se crean triggers para reglas agregadas.

Ambos IDs se definen con `SERIAL`, consistente con las tablas vigentes del proyecto. Cada uno crea una secuencia propia asociada a la columna.

## PRECONDICIÓN pagos=0

La primera operación sustantiva dentro de `BEGIN` es un bloque de protección que:

1. comprueba que `public.pagos` exista;
2. obtiene `LOCK TABLE public.pagos IN ACCESS EXCLUSIVE MODE NOWAIT`;
3. ejecuta `SELECT COUNT(*) FROM public.pagos` con el lock ya adquirido;
4. exige que el resultado sea exactamente 0;
5. lanza una excepción si la tabla falta o contiene filas.

El lock se conserva hasta que finaliza la transacción e impide que otra sesión inserte o modifique pagos entre el conteo y el `DROP`. `NOWAIT` hace que una operación incompatible activa aborte inmediatamente la migración en vez de dejarla esperando.

Cualquier excepción deja la transacción abortada antes de crear `cargos` o ejecutar `DROP TABLE`. Si el conteo no es 0 debe abandonarse esta estrategia y prepararse una migración de datos que preserve cada movimiento existente.

No se confía en el conteo histórico del diagnóstico. La precondición se evaluará nuevamente en el momento real de ejecución.

Este bloqueo es una defensa adicional y no reemplaza la obligación operativa de ejecutar la migración con el backend Odonton detenido.

## TABLAS AFECTADAS

Cambios de estructura previstos:

- `public.cargos`: creación.
- `public.pagos`: eliminación controlada de la tabla vacía y recreación.
- secuencias, constraints e índices propios de esas dos tablas.

Tablas únicamente referenciadas por FKs, sin ALTER ni cambios de datos:

- `public.pacientes`;
- `public.turnos`;
- `public.prestaciones`;
- `public.usuarios`.

La migración no contiene operaciones contra solicitudes, WhatsApp, documentos, odontograma ni ninguna otra tabla.

## CONSTRAINTS

### Cargos

| Nombre | Regla |
|---|---|
| `cargos_pkey` | PK `id`. |
| `cargos_concepto_no_vacio_check` | `BTRIM(concepto) <> ''`. |
| `cargos_importe_total_positivo_check` | `importe_total > 0`. |
| `fk_cargo_paciente` | Paciente, `ON DELETE RESTRICT`. |
| `fk_cargo_turno` | Turno opcional, `ON DELETE SET NULL`. |
| `fk_cargo_prestacion` | Prestación opcional, `ON DELETE SET NULL`. |

### Pagos

| Nombre | Regla |
|---|---|
| `pagos_pkey` | PK `id`. |
| `pagos_importe_positivo_check` | `importe > 0`. |
| `pagos_metodo_pago_check` | Método entre los tres aprobados. |
| `pagos_estado_check` | Estado `activo` o `anulado`. |
| `pagos_anulacion_coherente_check` | Coherencia completa entre estado y metadatos de anulación. |
| `fk_pago_cargo` | Cargo obligatorio, `ON DELETE RESTRICT`. |
| `fk_pago_anulado_por_usuario` | Usuario anulador, `ON DELETE RESTRICT`. |

Las reglas entre tablas o agregadas —coherencia turno/paciente, fechas cargo/pago, inmutabilidad, suma activa y sobrepago— quedan para el service transaccional de 4C.2.

## ÍNDICES

### Cargos

| Índice | Definición/uso |
|---|---|
| `idx_cargos_paciente_fecha` | `(paciente_id, fecha_cargo DESC)` para historial. |
| `idx_cargos_turno` | Parcial sobre `turno_id IS NOT NULL`. |
| `idx_cargos_prestacion` | Parcial sobre `prestacion_id IS NOT NULL`. |

### Pagos

| Índice | Definición/uso |
|---|---|
| `idx_pagos_cargo` | Todos los movimientos del cargo. |
| `idx_pagos_cargo_activos` | Parcial sobre `cargo_id` cuando `estado = 'activo'`. |
| `idx_pagos_fecha_estado` | `(fecha_pago DESC, estado)` para historial/reportes. |

No se duplican los índices creados automáticamente por las PK. No se añaden índices ajenos al diseño aprobado.

## DDL RUNTIME A RETIRAR EN 4C.2

`backend/src/services/pagosService.js` contiene `pagosTableReady` y `asegurarTablaPagos()`. Todos los métodos públicos actuales llaman a esa función.

Debe retirarse en 4C.2 la función completa, su flag y sus invocaciones. El DDL/DML exacto que hoy ejecuta es:

- `CREATE TABLE IF NOT EXISTS pagos` con el modelo antiguo;
- ocho `ALTER TABLE pagos ADD COLUMN IF NOT EXISTS` para `turno_id`, `monto`, `metodo`, `estado`, `fecha_pago`, `observaciones`, `created_at`, `updated_at`;
- un `UPDATE` que rellena `fecha_pago`;
- un `UPDATE` que normaliza estado a `pagado`;
- `CREATE INDEX IF NOT EXISTS idx_pagos_paciente_fecha` usando `paciente_id`.

El backend antiguo **no puede iniciarse después de esta migración**:

1. agregaría de nuevo columnas legacy a la nueva tabla;
2. cada sentencia se ejecuta separadamente y podría dejar cambios parciales antes de fallar;
3. intentaría crear un índice sobre `paciente_id`, columna que ya no existe;
4. sus SELECT esperan paciente/turno/monto/método antiguos;
5. su INSERT omite `cargo_id`, obligatorio en el modelo nuevo;
6. intenta guardar estados `pendiente`, `parcial` o `pagado`, rechazados por el nuevo CHECK.

Migración y backend 4C.2 deben activarse en una misma ventana, con el backend detenido durante el cambio.

## RIESGOS

- Que `pagos` reciba una fila antes de ejecutar: la precondición abortará correctamente y exigirá migración de datos.
- Que otra sesión tenga una operación incompatible activa: `NOWAIT` abortará antes del conteo y de cualquier DDL.
- Ejecutar con el backend antiguo activo: puede reintroducir columnas legacy y fallar después de cambios parciales.
- Aplicar la migración sin tener listo 4C.2: el módulo actual de pagos quedará incompatible hasta desplegar el nuevo backend.
- No usar `ON_ERROR_STOP` en la herramienta cliente: dificulta distinguir el primer error, aunque PostgreSQL mantendrá abortada la transacción.
- Ejecutar más de una migración del directorio por error: debe seleccionarse únicamente el nuevo archivo.
- Omitir backup o validación posterior: complica recuperación y trazabilidad.
- Considerar `schema_actual.sql` actualizado antes de ejecutar: por ahora debe conservar el esquema real anterior.
- Intentar reejecutar el archivo: no es idempotente; una migración aplicada debe registrarse y no repetirse.

Riesgo del SQL preparado: **MEDIO**, principalmente por la incompatibilidad deliberada con el backend anterior. El riesgo de pérdida de pagos es **BAJO solo si la precondición confirma 0 filas**.

## PASOS PARA EJECUCIÓN CONTROLADA

Estos pasos corresponden a una fase posterior:

1. terminar y validar el backend 4C.2 sin conectarlo todavía al esquema nuevo;
2. confirmar que no exista un backend Odonton activo;
3. crear un backup completo nuevo fuera del repositorio y validar `pg_restore --list`;
4. buscar nuevamente consumidores legacy y revisar el diff de 4C.2;
5. ejecutar por separado `SELECT COUNT(*) FROM public.pagos` y detenerse si no devuelve 0;
6. ejecutar únicamente `database/2026-08-27_create_cargos_rebuild_pagos.sql`, con detención ante el primer error; la migración vuelve a comprobar existencia, obtiene el lock `NOWAIT` y repite el conteo definitivo;
7. si hay error, comprobar rollback y no corregir manualmente dentro de la misma ventana;
8. ejecutar las consultas read-only de la sección siguiente;
9. desplegar el backend compatible antes de volver a iniciar la aplicación;
10. probar cargos, pagos, anulaciones, rollback y concurrencia;
11. regenerar `database/schema_actual.sql` mediante `pg_dump --schema-only --no-owner --no-privileges`;
12. ejecutar regresión completa, build y checklist manual;
13. no hacer commit automático.

## CONSULTAS DE VERIFICACIÓN

Estas consultas son exclusivamente `SELECT` y están preparadas para ejecutarse **después** de la migración futura. No fueron ejecutadas durante 4C.1.

### Existencia y tablas vacías

```sql
SELECT
  to_regclass('public.cargos') AS cargos,
  to_regclass('public.pagos') AS pagos;

SELECT 'cargos' AS tabla, COUNT(*) AS filas FROM public.cargos
UNION ALL
SELECT 'pagos' AS tabla, COUNT(*) AS filas FROM public.pagos;
```

Resultado esperado: ambas relaciones existen y ambos conteos son 0.

### Columnas y tipos

```sql
SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('cargos', 'pagos')
ORDER BY table_name, ordinal_position;
```

### Ausencia de columnas legacy

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pagos'
  AND column_name IN (
    'paciente_id',
    'turno_id',
    'monto',
    'metodo',
    'saldo',
    'total_abonado',
    'estado_cobro'
  )
ORDER BY column_name;
```

Resultado esperado: 0 filas. `metodo_pago` y `estado` sí deben existir con la nueva semántica.

### Constraints y FKs

```sql
SELECT
  conrelid::regclass AS tabla,
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN ('public.cargos'::regclass, 'public.pagos'::regclass)
ORDER BY tabla::text, constraint_name;
```

Se esperan las PK, cinco reglas/FKs de Cargos y seis reglas/FKs de Pagos documentadas arriba.

### Índices

```sql
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('cargos', 'pagos')
ORDER BY tablename, indexname;
```

Además de los índices explícitos deben aparecer `cargos_pkey` y `pagos_pkey`.

### Secuencias de IDs

```sql
SELECT
  pg_get_serial_sequence('public.cargos', 'id') AS cargos_id_sequence,
  pg_get_serial_sequence('public.pagos', 'id') AS pagos_id_sequence;
```

Ambos resultados deben ser no nulos.

### Tablas no modificadas

```sql
SELECT
  to_regclass('public.pacientes') AS pacientes,
  to_regclass('public.turnos') AS turnos,
  to_regclass('public.prestaciones') AS prestaciones,
  to_regclass('public.turno_solicitudes') AS turno_solicitudes,
  to_regclass('public.whatsapp_conversations') AS whatsapp_conversations,
  to_regclass('public.documentos_paciente') AS documentos_paciente,
  to_regclass('public.odontograma') AS odontograma;
```

Esta consulta confirma existencia, pero la comparación definitiva de estructuras debe hacerse contra un dump previo y el `schema_actual.sql` regenerado.

## VALIDACIÓN ESTÁTICA

Se comprobó sin conectarse a PostgreSQL:

- `BEGIN` al inicio y `COMMIT` al final;
- comprobación de existencia anterior al lock;
- `ACCESS EXCLUSIVE ... NOWAIT` anterior al `COUNT(*)` definitivo;
- precondición `COUNT(*)` anterior a cualquier DDL;
- únicos `CREATE TABLE`: `public.cargos` y `public.pagos`;
- único `DROP TABLE`: `public.pagos`;
- 13 constraints explícitos y 6 índices explícitos esperados;
- ausencia de `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `TRUNCATE`, triggers y `CASCADE`;
- existencia en `schema_actual.sql` de `pagos`, `pacientes`, `turnos`, `prestaciones` y `usuarios`;
- ausencia actual de `cargos` y de colisiones con los nuevos nombres de índices;
- ausencia de referencias externas hacia la tabla anterior `pagos`.

No están instalados `pgsanity`, `sqlfluff` ni `pg_format`. La sintaxis se revisó manualmente y mediante controles estructurales; no se usó PostgreSQL como parser porque esta fase prohíbe ejecutar DDL o modificar la base real.

## ARCHIVOS CREADOS

- `database/2026-08-27_create_cargos_rebuild_pagos.sql`.
- `REVISION_MIGRACION_CARGOS_PAGOS.md`.

## ARCHIVOS MODIFICADOS

Ninguno.

**CÓDIGO RUNTIME MODIFICADO: NO**

**BASE MODIFICADA: NO**

**MIGRACIÓN EJECUTADA: NO**

**COMMIT: NO**
