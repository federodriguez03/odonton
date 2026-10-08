# Auditoría final — Estructura de datos Odonton

## 1. Resumen ejecutivo

Auditoría estrictamente estática y de lectura realizada sobre:

1. `database/schema_actual.sql` como representación canónica del esquema instalado;
2. migraciones `database/2026-*.sql` que explican cambios posteriores del modelo;
3. consultas SQL y referencias reales de `backend/src`.

No se consultó ni modificó PostgreSQL, no se ejecutaron migraciones y no se usó documentación histórica como fuente de verdad.

Los valores esperados se confirmaron por recuento directo: **22 tablas**, **197 columnas**, **22 PK**, **16 FK físicas**, **14 tablas activas relevantes**, **7 tablas técnicas activas** y **1 tabla legacy sin consumidor runtime confirmado** (`archivos_clinicos`).

La estructura es funcionalmente consistente con el modelo actual, pero la documentación académica debe reflejar cuatro matices:

- existen relaciones lógicas utilizadas por el runtime que PostgreSQL no protege con FK;
- `pacientes.dni` tiene tres mecanismos físicos de unicidad redundantes;
- hay columnas legacy confirmadas en `auditoria`, `prestaciones` y `turnos`;
- `historias_clinicas` se consulta, pero no se encontró un escritor runtime vigente.

**Veredicto: COHERENTE CON AJUSTES.**

## 2. Conteos recalculados

| Métrica | Esperado | Recalculado | Resultado |
|---|---:|---:|---|
| Tablas | 22 | 22 | Coincide |
| Columnas | 197 | 197 | Coincide |
| Tablas activas relevantes | 14 | 14 | Coincide |
| Tablas técnicas activas | 7 | 7 | Coincide |
| Tablas legacy/históricas | 1 | 1 | Coincide |
| PK físicas | No indicado | 22 | Una por tabla |
| FK físicas | 16 | 16 | Coincide |
| CHECK | No indicado | 8 | Recalculado |
| Objetos UNIQUE no PK | No indicado | 9 | 8 constraints + 1 índice; 3 redundantes sobre `pacientes.dni` |

### Columnas por tabla

| Tabla | Columnas |
|---|---:|
| `archivos_clinicos` | 6 |
| `auditoria` | 12 |
| `cargos` | 10 |
| `configuracion_consultorio` | 7 |
| `configuracion_horarios_atencion` | 7 |
| `configuracion_mensajes_automaticos` | 6 |
| `documentos_paciente` | 7 |
| `historias_clinicas` | 5 |
| `odontograma` | 6 |
| `odontograma_meta` | 6 |
| `pacientes` | 15 |
| `pagos` | 12 |
| `prestaciones` | 7 |
| `profesionales_horarios_atencion` | 8 |
| `protesis_fijas` | 6 |
| `protesis_removibles` | 6 |
| `tratamientos` | 6 |
| `turno_solicitudes` | 13 |
| `turnos` | 24 |
| `usuarios` | 6 |
| `whatsapp_conversations` | 12 |
| `whatsapp_reminders` | 10 |
| **Total** | **197** |

## 3. Inventario de tablas

| Tabla | Categoría | Uso runtime confirmado | Evidencia principal |
|---|---|---|---|
| `archivos_clinicos` | Legacy/histórica | No | Sin coincidencias en `backend/src` |
| `auditoria` | Técnica activa | Sí | `auditoriaService.js`, middleware y services WhatsApp/turnos |
| `cargos` | Activa relevante | Sí | `cargosService.js`, `pagosService.js`, `reportesService.js` |
| `configuracion_consultorio` | Técnica activa | Sí | `configuracionService.js`, `pagosService.js` |
| `configuracion_horarios_atencion` | Técnica activa | Sí | `configuracionService.js`, `turnosService.js` |
| `configuracion_mensajes_automaticos` | Técnica activa | Sí | `configuracionService.js` |
| `documentos_paciente` | Activa relevante | Sí | `documentosService.js` |
| `historias_clinicas` | Activa relevante, solo lectura confirmada | Sí, lectura | `pacientesService.js`; escritor actual no encontrado |
| `odontograma` | Activa relevante | Sí | `odontogramaService.js` |
| `odontograma_meta` | Activa relevante | Sí | `odontogramaService.js` |
| `pacientes` | Activa relevante | Sí | services de pacientes, turnos, documentos, cargos y WhatsApp |
| `pagos` | Activa relevante | Sí | `pagosService.js`, `cargosService.js`, `reportesService.js` |
| `prestaciones` | Activa relevante | Sí | `prestacionesService.js`, turnos/cargos/WhatsApp/reportes |
| `profesionales_horarios_atencion` | Técnica activa | Sí | `turnosService.js` |
| `protesis_fijas` | Activa relevante en backend | Sí | route/service propios |
| `protesis_removibles` | Activa relevante en backend | Sí | route/service propios |
| `tratamientos` | Activa relevante en backend | Sí | route/controller/service propios |
| `turno_solicitudes` | Activa relevante | Sí | `turnoSolicitudesService.js`, `turnosService.js` |
| `turnos` | Activa relevante | Sí | services de turnos, pacientes, WhatsApp, reportes y cargos |
| `usuarios` | Activa relevante | Sí | `authService.js`, `turnosService.js`, reminder service |
| `whatsapp_conversations` | Técnica activa | Sí | `whatsappAutogestion.service.js`, reminder service |
| `whatsapp_reminders` | Técnica activa | Sí | `whatsappReminder.service.js` |

## 4. Inventario de columnas por tabla

Convenciones: `NN` = `NOT NULL`; `NULL` = admite nulo; `—` = restricción/default ausente. Los defaults `nextval(...)` provienen de los `ALTER COLUMN id SET DEFAULT` del dump, no de la sentencia `CREATE TABLE`.

### 4.1 `archivos_clinicos` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('archivos_clinicos_id_seq')` |
| `historia_id` | `integer` | NN | — | `historias_clinicas(id)` | — | — | — |
| `nombre_archivo` | `character varying(255)` | NULL | — | — | — | — | — |
| `ruta_archivo` | `text` | NN | — | — | — | — | — |
| `tipo` | `character varying(50)` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |

### 4.2 `auditoria` — 12 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('auditoria_id_seq')` |
| `entidad` | `character varying(50)` | NULL | — | — | — | — | — |
| `entidad_id` | `integer` | NULL | — | — | — | — | — |
| `accion` | `character varying(50)` | NULL | — | — | — | — | — |
| `descripcion` | `text` | NULL | — | — | — | — | — |
| `fecha` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |
| `usuario_id` | `integer` | NULL | — | — | — | — | — |
| `recurso` | `text` | NULL | — | — | — | — | — |
| `recurso_id` | `text` | NULL | — | — | — | — | — |
| `status_code` | `integer` | NULL | — | — | — | — | — |
| `metadata` | `jsonb` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |

### 4.3 `cargos` — 10 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('cargos_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | — | — | — |
| `turno_id` | `integer` | NULL | — | `turnos(id)` | — | — | — |
| `prestacion_id` | `integer` | NULL | — | `prestaciones(id)` | — | — | — |
| `concepto` | `text` | NN | — | — | — | No vacío tras `btrim` | — |
| `importe_total` | `numeric(12,2)` | NN | — | — | — | `> 0` | — |
| `fecha_cargo` | `date` | NN | — | — | — | — | `CURRENT_DATE` |
| `observaciones` | `text` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.4 `configuracion_consultorio` — 7 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('configuracion_consultorio_id_seq')` |
| `nombre_consultorio` | `character varying(150)` | NN | — | — | — | — | `'Odonton'` |
| `whatsapp_numero` | `character varying(30)` | NULL | — | — | — | — | — |
| `timezone` | `character varying(80)` | NN | — | — | — | — | `'America/Argentina/Buenos_Aires'` |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `autogestion_keywords` | `text` | NN | — | — | — | — | `'turno, turnito, cita, consulta, odontologo, odontóloga, odontologia, odontología'` |

### 4.5 `configuracion_horarios_atencion` — 7 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('configuracion_horarios_atencion_id_seq')` |
| `dia_semana` | `integer` | NN | — | — | Sí | — | — |
| `activo` | `boolean` | NN | — | — | — | — | `false` |
| `hora_desde` | `time without time zone` | NULL | — | — | — | — | — |
| `hora_hasta` | `time without time zone` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.6 `configuracion_mensajes_automaticos` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('configuracion_mensajes_automaticos_id_seq')` |
| `tipo` | `character varying(60)` | NN | — | — | Sí | — | — |
| `contenido` | `text` | NN | — | — | — | — | — |
| `activo` | `boolean` | NN | — | — | — | — | `true` |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.7 `documentos_paciente` — 7 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('documentos_paciente_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | — | — | — |
| `nombre_archivo` | `text` | NN | — | — | — | — | — |
| `ruta_archivo` | `text` | NN | — | — | — | — | — |
| `tipo_archivo` | `character varying(100)` | NN | — | — | — | — | — |
| `descripcion` | `text` | NULL | — | — | — | — | — |
| `fecha_subida` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.8 `historias_clinicas` — 5 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('historias_clinicas_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | — | — | — |
| `turno_id` | `integer` | NULL | — | `turnos(id)` | — | — | — |
| `descripcion` | `text` | NN | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |

### 4.9 `odontograma` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('odontograma_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | Compuesta | — | — |
| `diente` | `smallint` | NN | — | — | Compuesta | — | — |
| `cara` | `character varying(20)` | NN | — | — | Compuesta | — | — |
| `estado` | `character varying(50)` | NN | — | — | — | — | — |
| `fecha` | `timestamp without time zone` | NULL | — | — | — | — | `CURRENT_TIMESTAMP` |

UQ compuesta: (`paciente_id`, `diente`, `cara`).

### 4.10 `odontograma_meta` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('odontograma_meta_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | Sí | — | — |
| `sarro` | `boolean` | NN | — | — | — | — | `false` |
| `periodontal` | `boolean` | NN | — | — | — | — | `false` |
| `updated_at` | `timestamp without time zone` | NULL | — | — | — | — | `CURRENT_TIMESTAMP` |
| `observaciones` | `text` | NULL | — | — | — | — | — |

### 4.11 `pacientes` — 15 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('pacientes_id_seq')` |
| `nombre` | `character varying(100)` | NN | — | — | — | — | — |
| `apellido` | `character varying(100)` | NN | — | — | — | — | — |
| `dni` | `character varying(20)` | NN | — | — | Sí, redundante | — | — |
| `nacionalidad` | `character varying(50)` | NULL | — | — | — | — | — |
| `domicilio` | `character varying(255)` | NULL | — | — | — | — | — |
| `telefono` | `character varying(30)` | NULL | — | — | — | — | — |
| `email` | `character varying(150)` | NULL | — | — | — | — | — |
| `fecha_nacimiento` | `date` | NULL | — | — | — | — | — |
| `observaciones` | `text` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |
| `alergias` | `text` | NULL | — | — | — | — | — |
| `condiciones` | `text` | NULL | — | — | — | — | — |
| `estado_tratamiento` | `text` | NULL | — | — | — | — | — |

La unicidad de `dni` está declarada por `pacientes_dni_key`, `uq_pacientes_dni` y el índice único `idx_pacientes_dni_unique`.

### 4.12 `pagos` — 12 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('pagos_id_seq')` |
| `cargo_id` | `integer` | NN | — | `cargos(id)` | — | — | — |
| `importe` | `numeric(12,2)` | NN | — | — | — | `> 0` | — |
| `metodo_pago` | `character varying(30)` | NN | — | — | — | efectivo/tarjeta/transferencia | — |
| `fecha_pago` | `date` | NN | — | — | — | — | `CURRENT_DATE` |
| `observaciones` | `text` | NULL | — | — | — | — | — |
| `estado` | `character varying(10)` | NN | — | — | — | activo/anulado + coherencia de anulación | `'activo'` |
| `fecha_anulacion` | `timestamp with time zone` | NULL | — | — | — | Coherencia de anulación | — |
| `motivo_anulacion` | `text` | NULL | — | — | — | Coherencia de anulación; no vacío al anular | — |
| `anulado_por_usuario_id` | `integer` | NULL | — | `usuarios(id)` | — | Coherencia de anulación | — |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.13 `prestaciones` — 7 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('prestaciones_id_seq')` |
| `nombre` | `character varying(100)` | NN | — | — | — | — | — |
| `duracion_minutos` | `integer` | NN | — | — | — | `> 0` | — |
| `precio_base` | `numeric(10,2)` | NULL | — | — | — | — | — |
| `activa` | `boolean` | NULL | — | — | — | — | `true` |
| `activo` | `boolean` | NULL | — | — | — | — | `true` |
| `updated_at` | `timestamp with time zone` | NULL | — | — | — | — | — |

### 4.14 `profesionales_horarios_atencion` — 8 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('profesionales_horarios_atencion_id_seq')` |
| `profesional_id` | `integer` | NN | — | — | Compuesta | — | — |
| `dia_semana` | `integer` | NN | — | — | Compuesta | — | — |
| `activo` | `boolean` | NN | — | — | — | — | `false` |
| `hora_desde` | `time without time zone` | NULL | — | — | — | — | — |
| `hora_hasta` | `time without time zone` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

UQ compuesta: (`profesional_id`, `dia_semana`). `profesional_id` es relación lógica, no FK física.

### 4.15 `protesis_fijas` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('protesis_fijas_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | — | — | — |
| `tipo` | `character varying(50)` | NN | — | — | — | — | — |
| `dientes` | `smallint[]` | NN | — | — | — | — | — |
| `descripcion` | `text` | NULL | — | — | — | — | — |
| `fecha` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.16 `protesis_removibles` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('protesis_removibles_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | — | — | — |
| `tipo` | `character varying(50)` | NN | — | — | — | — | — |
| `arcada` | `character varying(20)` | NN | — | — | — | — | — |
| `descripcion` | `text` | NULL | — | — | — | — | — |
| `fecha` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.17 `tratamientos` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('tratamientos_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | — | — | — |
| `diente` | `smallint` | NN | — | — | — | — | — |
| `tipo` | `character varying(50)` | NN | — | — | — | — | — |
| `observaciones` | `text` | NULL | — | — | — | — | — |
| `fecha` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

### 4.18 `turno_solicitudes` — 13 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `bigint` | NN | Sí | — | — | — | `nextval('turno_solicitudes_id_seq')` |
| `tipo_solicitud` | `character varying(40)` | NN | — | — | — | — | — |
| `estado` | `character varying(30)` | NN | — | — | — | — | `'pendiente'` |
| `paciente_id` | `integer` | NULL | — | — | — | — | — |
| `nombre_apellido` | `text` | NULL | — | — | — | — | — |
| `dni` | `character varying(20)` | NN | — | — | — | — | — |
| `telefono` | `character varying(30)` | NN | — | — | — | — | — |
| `motivo` | `text` | NULL | — | — | — | — | — |
| `preferencia_horaria` | `text` | NULL | — | — | — | — | — |
| `turno_id` | `integer` | NULL | — | — | — | — | — |
| `observaciones` | `text` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

`paciente_id` y `turno_id` son relaciones lógicas usadas por joins runtime, pero no FK físicas.

### 4.19 `turnos` — 24 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('turnos_id_seq')` |
| `paciente_id` | `integer` | NN | — | `pacientes(id)` | — | — | — |
| `prestacion_id` | `integer` | NULL | — | `prestaciones(id)` | — | — | — |
| `fecha_hora_inicio` | `timestamp with time zone` | NULL | — | — | — | `fecha_hora_fin > fecha_hora_inicio` | — |
| `fecha_hora_fin` | `timestamp with time zone` | NULL | — | — | — | `fecha_hora_fin > fecha_hora_inicio` | — |
| `estado` | `character varying(30)` | NN | — | — | — | — | `'programado'` |
| `origen` | `character varying(30)` | NN | — | — | — | — | `'interno'` |
| `observaciones` | `text` | NULL | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `fecha_cancelacion` | `timestamp with time zone` | NULL | — | — | — | — | — |
| `recordatorio_procesado_at` | `timestamp with time zone` | NULL | — | — | — | — | — |
| `recordatorio_enviado_at` | `timestamp with time zone` | NULL | — | — | — | — | — |
| `recordatorio_estado` | `text` | NULL | — | — | — | — | — |
| `recordatorio_error` | `text` | NULL | — | — | — | — | — |
| `respuesta_paciente` | `text` | NULL | — | — | — | — | — |
| `respuesta_paciente_at` | `timestamp with time zone` | NULL | — | — | — | — | — |
| `reprogramacion_token` | `text` | NULL | — | — | — | — | — |
| `reprogramacion_token_expira_at` | `timestamp with time zone` | NULL | — | — | — | — | — |
| `profesional_id` | `integer` | NULL | — | — | — | — | — |
| `solicitud_preferencia` | `text` | NULL | — | — | — | — | — |
| `solicitud_confirmada_at` | `timestamp with time zone` | NULL | — | — | — | — | — |
| `solicitud_rechazada_at` | `timestamp with time zone` | NULL | — | — | — | — | — |
| `recordatorio_habilitado` | `boolean` | NN | — | — | — | — | `true` |

`profesional_id` se usa como relación lógica con `usuarios(id)`, sin FK física. PostgreSQL no declara CHECK de estados de turno.

### 4.20 `usuarios` — 6 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('usuarios_id_seq')` |
| `nombre` | `character varying(100)` | NN | — | — | — | — | — |
| `email` | `character varying(150)` | NN | — | — | Sí | — | — |
| `password_hash` | `text` | NN | — | — | — | — | — |
| `activo` | `boolean` | NULL | — | — | — | — | `true` |
| `created_at` | `timestamp with time zone` | NULL | — | — | — | — | `now()` |

### 4.21 `whatsapp_conversations` — 12 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `bigint` | NN | Sí | — | — | — | `nextval('whatsapp_conversations_id_seq')` |
| `phone` | `character varying(30)` | NN | — | — | — | — | — |
| `status` | `character varying(30)` | NN | — | — | — | — | `'active'` |
| `step` | `character varying(80)` | NN | — | — | — | — | — |
| `paciente_id` | `integer` | NULL | — | — | — | — | — |
| `prestacion_id` | `integer` | NULL | — | — | — | — | — |
| `profesional_id` | `integer` | NULL | — | — | — | — | — |
| `turno_id` | `integer` | NULL | — | — | — | — | — |
| `data` | `jsonb` | NN | — | — | — | — | `'{}'::jsonb` |
| `expires_at` | `timestamp with time zone` | NN | — | — | — | — | — |
| `created_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |
| `updated_at` | `timestamp with time zone` | NN | — | — | — | — | `now()` |

Los cuatro campos `*_id` son relaciones lógicas activas; no hay FK declaradas.

### 4.22 `whatsapp_reminders` — 10 columnas

| Columna | Tipo PostgreSQL | Nulabilidad | PK | FK | UQ | CHECK | DEFAULT |
|---|---|---|---|---|---|---|---|
| `id` | `integer` | NN | Sí | — | — | — | `nextval('whatsapp_reminders_id_seq')` |
| `appointment_id` | `integer` | NN | — | — | — | — | — |
| `patient_id` | `integer` | NULL | — | — | — | — | — |
| `phone` | `character varying(30)` | NN | — | — | — | — | — |
| `status` | `character varying(50)` | NN | — | — | — | — | `'pending_response'` |
| `sent_at` | `timestamp without time zone` | NULL | — | — | — | — | `CURRENT_TIMESTAMP` |
| `responded_at` | `timestamp without time zone` | NULL | — | — | — | — | — |
| `response_text` | `text` | NULL | — | — | — | — | — |
| `channel` | `character varying(30)` | NN | — | — | — | — | `'whatsapp'` |
| `created_at` | `timestamp without time zone` | NULL | — | — | — | — | `CURRENT_TIMESTAMP` |

`appointment_id` y `patient_id` son relaciones lógicas; no hay FK declaradas.

## 5. PK / FK / UQ / CHECK / defaults

### Claves primarias

Las 22 tablas declaran una PK simple sobre `id`. Todos los `id` son `integer`, excepto `turno_solicitudes.id` y `whatsapp_conversations.id`, que son `bigint`. Cada `id` tiene default de secuencia `nextval(...)` en el dump.

### Restricciones UNIQUE no PK

| Objeto | Tabla | Columnas | Observación |
|---|---|---|---|
| `configuracion_horarios_atencion_dia_semana_key` | `configuracion_horarios_atencion` | `dia_semana` | Un horario general por día |
| `configuracion_mensajes_automaticos_tipo_key` | `configuracion_mensajes_automaticos` | `tipo` | Una plantilla por tipo |
| `odontograma_meta_paciente_id_key` | `odontograma_meta` | `paciente_id` | Un registro meta por paciente |
| `odontograma_paciente_id_diente_cara_key` | `odontograma` | `paciente_id,diente,cara` | Una fila por cara dental |
| `pacientes_dni_key` | `pacientes` | `dni` | Redundante |
| `uq_pacientes_dni` | `pacientes` | `dni` | Redundante |
| `idx_pacientes_dni_unique` | `pacientes` | `dni` | Índice único redundante |
| `profesionales_horarios_atencion_profesional_id_dia_semana_key` | `profesionales_horarios_atencion` | `profesional_id,dia_semana` | Un horario por profesional/día |
| `usuarios_email_key` | `usuarios` | `email` | Email de acceso único |

Semánticamente hay siete reglas de unicidad distintas; físicamente existen nueve objetos porque `pacientes.dni` está cubierto tres veces.

### Restricciones CHECK

| Nombre | Tabla | Regla exacta resumida |
|---|---|---|
| `cargos_concepto_no_vacio_check` | `cargos` | `btrim(concepto) <> ''` |
| `cargos_importe_total_positivo_check` | `cargos` | `importe_total > 0` |
| `pagos_anulacion_coherente_check` | `pagos` | Activo sin datos de anulación, o anulado con fecha/motivo/usuario completos |
| `pagos_estado_check` | `pagos` | `estado` en activo/anulado |
| `pagos_importe_positivo_check` | `pagos` | `importe > 0` |
| `pagos_metodo_pago_check` | `pagos` | efectivo/tarjeta/transferencia |
| `prestaciones_duracion_minutos_check` | `prestaciones` | `duracion_minutos > 0` |
| `chk_fechas_turno` | `turnos` | `fecha_hora_fin > fecha_hora_inicio` |

No existen CHECK físicos para estados de turnos, solicitudes, conversaciones o recordatorios; esas reglas permanecen en runtime.

### Defaults

Los defaults exactos de cada columna están consignados en la sección 4. En conjunto incluyen:

- secuencia para los 22 `id`;
- `now()`/`CURRENT_TIMESTAMP` para fechas de alta/actualización cuando el esquema lo declara;
- `CURRENT_DATE` para cargos y pagos;
- booleanos activos/inactivos y habilitación de recordatorio;
- estados iniciales `programado`, `pendiente`, `activo`, `active` y `pending_response` según tabla;
- valores de configuración del consultorio, zona horaria, palabras clave, JSON vacío y canal WhatsApp.

## 6. Relaciones físicas

Se recalcularon **16 FK físicas**. No se contabilizó ninguna relación lógica como FK.

| # | Constraint | Origen | Destino | ON DELETE | Cardinalidad física |
|---:|---|---|---|---|---|
| 1 | `documentos_paciente_paciente_id_fkey` | `documentos_paciente.paciente_id` | `pacientes.id` | CASCADE | Paciente 1 → 0..N documentos |
| 2 | `fk_archivo_historia` | `archivos_clinicos.historia_id` | `historias_clinicas.id` | CASCADE | Historia 1 → 0..N archivos legacy |
| 3 | `fk_cargo_paciente` | `cargos.paciente_id` | `pacientes.id` | RESTRICT | Paciente 1 → 0..N cargos; cargo exige paciente |
| 4 | `fk_cargo_prestacion` | `cargos.prestacion_id` | `prestaciones.id` | SET NULL | Prestación 1 → 0..N cargos; cargo 0..1 prestación |
| 5 | `fk_cargo_turno` | `cargos.turno_id` | `turnos.id` | SET NULL | Turno 1 → 0..N cargos; cargo 0..1 turno |
| 6 | `fk_historia_paciente` | `historias_clinicas.paciente_id` | `pacientes.id` | RESTRICT | Paciente 1 → 0..N historias |
| 7 | `fk_historia_turno` | `historias_clinicas.turno_id` | `turnos.id` | SET NULL | Turno 1 → 0..N historias; historia 0..1 turno |
| 8 | `fk_pago_anulado_por_usuario` | `pagos.anulado_por_usuario_id` | `usuarios.id` | RESTRICT | Usuario 1 → 0..N anulaciones; pago activo 0, anulado 1 usuario por CHECK |
| 9 | `fk_pago_cargo` | `pagos.cargo_id` | `cargos.id` | RESTRICT | Cargo 1 → 0..N pagos; pago exige cargo |
| 10 | `fk_turno_paciente` | `turnos.paciente_id` | `pacientes.id` | RESTRICT | Paciente 1 → 0..N turnos; turno exige paciente |
| 11 | `fk_turno_prestacion` | `turnos.prestacion_id` | `prestaciones.id` | RESTRICT | Prestación 1 → 0..N turnos; turno 0..1 prestación |
| 12 | `odontograma_meta_paciente_id_fkey` | `odontograma_meta.paciente_id` | `pacientes.id` | CASCADE | Paciente 1 → 0..1 meta por UQ |
| 13 | `odontograma_paciente_id_fkey` | `odontograma.paciente_id` | `pacientes.id` | CASCADE | Paciente 1 → 0..N caras |
| 14 | `protesis_fijas_paciente_id_fkey` | `protesis_fijas.paciente_id` | `pacientes.id` | CASCADE | Paciente 1 → 0..N prótesis fijas |
| 15 | `protesis_removibles_paciente_id_fkey` | `protesis_removibles.paciente_id` | `pacientes.id` | CASCADE | Paciente 1 → 0..N prótesis removibles |
| 16 | `tratamientos_paciente_id_fkey` | `tratamientos.paciente_id` | `pacientes.id` | CASCADE | Paciente 1 → 0..N tratamientos |

### Verificación de relaciones solicitadas

| Relación | Resultado |
|---|---|
| Paciente → Turno | Física: `turnos.paciente_id` |
| Prestación → Turno | Física y opcional: `turnos.prestacion_id` |
| Paciente → DocumentoPaciente | Física: `documentos_paciente.paciente_id` |
| Paciente → Odontograma | Física: `odontograma.paciente_id` |
| Paciente → OdontogramaMeta | Física + UQ: `odontograma_meta.paciente_id` |
| Paciente → HistoriaClinica | Física: `historias_clinicas.paciente_id` |
| Paciente → Cargo | Física: `cargos.paciente_id` |
| Turno → Cargo | Física y opcional: `cargos.turno_id` |
| Prestación → Cargo | Física y opcional: `cargos.prestacion_id` |
| Cargo → Pago | Física: `pagos.cargo_id` |
| Usuario → Pago por anulación | Física y condicional: `pagos.anulado_por_usuario_id` |
| Turno ↔ turno_solicitudes | Lógica, no FK: `turno_solicitudes.turno_id` |

## 7. Relaciones lógicas sin FK

| Columna lógica | Destino usado/esperado | Evidencia runtime | Riesgo documental |
|---|---|---|---|
| `turnos.profesional_id` | `usuarios.id` | joins `usuarios u ON u.id = t.profesional_id` en `turnosService.js` y reminder service | Debe dibujarse como relación lógica, no FK |
| `profesionales_horarios_atencion.profesional_id` | `usuarios.id` | consulta por profesional en `turnosService.js` | Igual |
| `turno_solicitudes.paciente_id` | `pacientes.id` | joins en `turnoSolicitudesService.js` | Igual |
| `turno_solicitudes.turno_id` | `turnos.id` | joins y actualizaciones coordinadas en `turnoSolicitudesService.js`/`turnosService.js` | Igual |
| `whatsapp_conversations.paciente_id` | `pacientes.id` | sesiones actualizadas y búsqueda de conversaciones por paciente | Igual |
| `whatsapp_conversations.prestacion_id` | `prestaciones.id` | estado de sesión leído/escrito por autogestión | Igual |
| `whatsapp_conversations.profesional_id` | `usuarios.id` | estado de sesión leído/escrito por autogestión | Igual |
| `whatsapp_conversations.turno_id` | `turnos.id` | sesión, búsqueda y continuidad del flujo | Igual; no garantiza integridad física |
| `whatsapp_reminders.appointment_id` | `turnos.id` | join explícito `wr.appointment_id = t.id` | Igual |
| `whatsapp_reminders.patient_id` | `pacientes.id` | se inserta desde `turno.paciente_id` | Igual |
| `auditoria.usuario_id` | `usuarios.id` | inserciones de auditoría con usuario autenticado | Igual |

`auditoria.recurso_id` es deliberadamente polimórfico/textual y no representa una FK única. El DNI/teléfono de una solicitud son datos de identificación, no claves foráneas.

## 8. Tablas activas / técnicas / legacy

### Activas relevantes — 14

`usuarios`, `pacientes`, `prestaciones`, `turnos`, `turno_solicitudes`, `documentos_paciente`, `historias_clinicas`, `odontograma`, `odontograma_meta`, `tratamientos`, `protesis_fijas`, `protesis_removibles`, `cargos`, `pagos`.

Notas:

- tratamientos y prótesis tienen rutas/services backend reales, aunque esta auditoría no evalúa accesibilidad frontend;
- `historias_clinicas` tiene lectura runtime confirmada, pero no escritor vigente confirmado;
- una tabla se clasifica por consumo runtime, no solo por existir en el esquema.

### Técnicas activas — 7

`auditoria`, `configuracion_consultorio`, `configuracion_horarios_atencion`, `configuracion_mensajes_automaticos`, `profesionales_horarios_atencion`, `whatsapp_conversations`, `whatsapp_reminders`.

### Legacy/histórica — 1

`archivos_clinicos`: existe y conserva FK a `historias_clinicas`, pero la búsqueda literal y de consultas SQL en `backend/src` dio cero consumidores. Su funcionalidad actual es **NO CONFIRMADA**; debe marcarse como legacy, no como módulo activo.

### Correspondencia con migraciones vigentes

- Odontograma actual: `2026-03-09_odontograma_v2.sql` y migraciones 2026-03-10 de meta/observaciones; el modelo anterior se retiró con `2026-08-12_remove_legacy_odontograma.sql`.
- Tratamientos/prótesis: `2026-03-10_tratamientos_protesis.sql`.
- Documentos: `2026-03-11_documentos_paciente.sql`.
- Campos clínicos de pacientes: `2026-03-11_pacientes_campos_clinicos.sql`.
- Disponibilidad profesional: `2026-04-28_turnos_disponibilidad_profesional.sql`.
- Recordatorios/configuración/autogestión: migraciones de 2026-05-05 a 2026-05-11.
- Solicitudes: `2026-05-22_turnos_solicitudes.sql` y `2026-05-26_turno_solicitudes_whatsapp.sql`.
- Google Calendar fue retirado por `2026-05-19_remove_google_calendar_turnos.sql`; sus columnas no están en el esquema final.
- Tokens legacy fueron retirados por `2026-08-12_remove_legacy_autogestion_tokens.sql`; sus tablas no están en el esquema final.
- Flag individual de recordatorio: `2026-08-16_add_recordatorio_habilitado_turnos.sql`.
- Modelo final cargos/pagos: `2026-08-27_create_cargos_rebuild_pagos.sql`, coincidente con constraints/FK del dump.

Las tablas base anteriores a esta serie de migraciones se verifican por `schema_actual.sql`; no se atribuyó un origen no comprobado.

## 9. Columnas legacy o dudosas

| Archivo | Tabla/columna | Evidencia | Clasificación | Impacto documental | Corrección recomendada |
|---|---|---|---|---|---|
| `database/schema_actual.sql:117-121` | `auditoria.entidad`, `entidad_id`, `descripcion`, `fecha` | Los INSERT actuales usan `usuario_id, accion, recurso, recurso_id, status_code, metadata`; no hay consumo de esos cuatro campos en el servicio/middleware actual | Legacy confirmado por búsqueda estática | Un diccionario puede presentar dos modelos de auditoría como uno solo | Marcar como campos heredados; documentar como activos `accion/recurso/.../created_at` |
| `database/schema_actual.sql:527` | `prestaciones.activa` | Runtime consulta/escribe `activo`; no se encontró referencia SQL a la columna `activa` | Legacy/duplicada confirmada | Puede inducir a usar el flag equivocado | Marcar `activa` como heredada y `activo` como vigente |
| `database/schema_actual.sql:754-755` | `turnos.reprogramacion_token`, `reprogramacion_token_expira_at` | Se originaron en `2026-05-05_recordatorios_whatsapp.sql`; no tienen consumidores en `backend/src` | Legacy confirmado | Podría sugerir autogestión por link/token, ya retirada | Marcar como legacy; no incluir en modelo conceptual núcleo |
| `database/schema_actual.sql:81-87` | Todas las columnas de `archivos_clinicos` | Cero consumidores runtime | Legacy de tabla | No presentarla como gestión documental actual | Separar del DER activo; la tabla vigente de documentos es `documentos_paciente` |
| `database/schema_actual.sql:334-340` | `historias_clinicas.*` | `pacientesService.js` realiza SELECT; no se encontró INSERT/UPDATE/DELETE runtime | Activa de solo lectura; origen de nuevas filas NO CONFIRMADO | No afirmar que la ficha crea evoluciones | Documentar lectura de registros existentes y ausencia de alta explícita actual |

No se clasifican como legacy `pacientes.alergias`, `condiciones` ni `estado_tratamiento`: el middleware/service las aceptan, persisten y devuelven. Tampoco son legacy `turnos.solicitud_*`, porque se escriben y leen en los services actuales.

## 10. Validación del modelo conceptual

| Entidad conceptual | Validación | Qué debe representar | Qué no debe mezclar |
|---|---|---|---|
| Paciente | Correcta | Identidad, contacto y datos clínicos generales | Índices/duplicación física de UQ |
| Turno | Correcta con ajuste | Agenda, estado, origen, recordatorio, paciente/prestación/profesional | Tokens legacy; duración como columna persistida |
| Prestación | Correcta con ajuste | Nombre, `duracion_minutos`, `precio_base`, vigencia por `activo` | Columna heredada `activa`; precio como ingreso real |
| SolicitudTurno | Correcta | Solicitud supervisada, estado, paciente/turno lógicos, preferencia | Presentar sus IDs como FK físicas |
| DocumentoPaciente | Correcta | Metadatos DB y archivo físico asociado a paciente | Confundir con `archivos_clinicos` |
| HistoriaClinica | Correcta con reserva | Evoluciones existentes asociadas a paciente y opcionalmente turno | Afirmar alta/edición runtime no confirmada |
| Odontograma | Correcta | Una fila por paciente/diente/cara/estado | Modelo agregado anterior |
| OdontogramaMeta | Correcta y necesaria | Sarro, periodontal y observación general, 0..1 por paciente | Fusionarla físicamente con `odontograma` |
| Cargo | Correcta | Deuda interna con importe/concepto históricos y referencias opcionales | Saldo/estado calculado como columnas persistidas |
| Pago | Correcta | Aplicación a cargo, método, estado activo/anulado y trazabilidad | Relación principal directa a paciente/prestación |
| Usuario | Correcta | Autenticación y autoría de anulación/profesional lógico | Atributo `rol` inexistente en DB |
| Auditoría | Correcta como concepto técnico | Acción, recurso, resultado, metadata y usuario lógico | Campos heredados como contrato actual; FK física inexistente |

El conjunto propuesto representa el dominio actual. Para defensa académica conviene mantenerlo conceptual y separar detalles de secuencias, índices, defaults y columnas heredadas en DER/diccionario.

## 11. Validación del DER núcleo funcional

El núcleo verificable debe contener, como mínimo:

- `pacientes` 1→N `turnos`, `documentos_paciente`, `historias_clinicas`, `odontograma`, `cargos`, `tratamientos`, `protesis_fijas` y `protesis_removibles` mediante FK físicas;
- `pacientes` 1→0..1 `odontograma_meta` mediante FK + UQ;
- `prestaciones` 1→0..N `turnos` y `cargos`, con referencia nullable en las tablas hijas;
- `turnos` 1→0..N `cargos` y `historias_clinicas`, ambas referencias opcionales;
- `cargos` 1→0..N `pagos`, con pago obligatoriamente asociado;
- `usuarios` 1→0..N pagos anulados, siendo la referencia nula en pago activo y obligatoria por CHECK cuando está anulado;
- `turno_solicitudes` vinculado por línea lógica discontinua a paciente/turno, no como FK.

**Resultado:** el modelo núcleo esperado es **COHERENTE CON AJUSTES** si diferencia relaciones físicas/lógicas y excluye tokens/columnas heredadas. No se suministró en esta fase un artefacto DER visual independiente para inspección; su fidelidad gráfica queda **NO CONFIRMADA**.

## 12. Validación del DER técnico

El DER técnico debe agregar:

- las tres tablas de configuración como entidades separadas, no una tabla genérica `configuracion`;
- `profesionales_horarios_atencion` con relación lógica a `usuarios`;
- `whatsapp_conversations` con cuatro relaciones lógicas y datos de estado/expiración;
- `whatsapp_reminders` con relaciones lógicas a turno y paciente;
- `auditoria` con relación lógica a usuario y `recurso_id` polimórfico;
- `archivos_clinicos` en bloque legacy, manteniendo su FK física a historias.

**Resultado:** estructura técnica del esquema **COHERENTE CON AJUSTES**. Un DER que dibuje esas relaciones lógicas como FK sería incorrecto. El artefacto visual final no fue aportado y queda **NO CONFIRMADO**.

## 13. Validación del diccionario de datos

La sección 4 de este informe constituye la referencia recalculada para las 22 tablas/197 columnas. Un diccionario académico es coherente solo si, para cada campo, reproduce tipo, nulabilidad, PK/FK/UQ/CHECK/default allí consignados.

Puntos obligatorios para evitar errores:

- incluir defaults de secuencia de los 22 `id`;
- no asignar FK a relaciones lógicas;
- mostrar precisión `numeric(12,2)` de cargos/pagos y `numeric(10,2)` de prestación;
- distinguir `timestamp with time zone` de `timestamp without time zone`;
- documentar las cuatro reglas CHECK de pagos y el check cruzado de anulación;
- registrar `concepto` de cargo como no vacío y `importe_total` positivo;
- no inventar `saldo` ni estados `PENDIENTE/PARCIAL/PAGADO` en `cargos`: son calculados;
- separar `odontograma` de `odontograma_meta`;
- identificar campos/tablas legacy de la sección 9.

No se adjuntó un diccionario académico externo para cotejar celda por celda. Por lo tanto, su versión externa se marca **NO CONFIRMADA**; el inventario normativo generado aquí sí es coherente con `schema_actual.sql`.

## 14. Diferencias respecto de los valores esperados

### Diferencias numéricas

**Ninguna.** Los seis valores esperados fueron recalculados y coinciden: 22 tablas, 197 columnas, clasificación 14/7/1 y 16 FK físicas.

### Ajustes estructurales/documentales detectados

| Archivo | Tabla/columna afectada | Evidencia | Impacto documental | Corrección recomendada |
|---|---|---|---|---|
| `database/schema_actual.sql:1167,1255,1357` | `pacientes.dni` | Dos constraints UNIQUE y un índice UNIQUE sobre la misma columna | Si se cuentan objetos, no debe afirmarse que existe una sola restricción física | Documentar una regla semántica de unicidad y anotar la redundancia técnica |
| `database/schema_actual.sql:1484-1604` | Conjunto de FK | El dump declara exactamente 16 `FOREIGN KEY` | Riesgo de inflar el conteo al sumar relaciones lógicas | Mantener “16 FK físicas” y representar las 11 lógicas de forma diferenciada |
| `database/schema_actual.sql` + `backend/src/services/turnosService.js` | `turnos.profesional_id`, horarios profesionales | Joins reales sin FK | Un DER podría mentir sobre integridad referencial | Línea lógica/discontinua y nota “sin constraint” |
| `database/schema_actual.sql` + services de solicitudes/WhatsApp/auditoría | IDs lógicos enumerados en sección 7 | Runtime los usa, PostgreSQL no declara FK | Mismo riesgo | No rotularlos como FK |
| `database/schema_actual.sql:117-121,527,754-755` | Auditoría, prestación y tokens de turno | Columnas presentes sin consumidor vigente o duplicadas | Contamina modelo conceptual final | Mantener en diccionario físico con marca legacy; excluir del modelo conceptual |
| `database/schema_actual.sql:81-87` | `archivos_clinicos` | Tabla y FK existen; backend no la consulta | Existencia no equivale a funcionalidad activa | Clasificar como única tabla legacy/histórica |
| `backend/src/services/pacientesService.js:324` | `historias_clinicas` | Solo SELECT confirmado | Puede sobredeclararse una función de evolución clínica | Indicar lectura activa; escritura actual NO CONFIRMADA |
| `backend/src/services/configuracionService.js` y otros services | Varias tablas/columnas | Existen `CREATE TABLE/ALTER TABLE` defensivos en runtime además de migraciones | Puede confundirse origen físico con arquitectura ideal | En documentación de datos usar `schema_actual.sql`; mencionar DDL runtime como implementación defensiva, no como FK/migración adicional |

## 15. Veredicto final

### Resultado

**COHERENTE CON AJUSTES**

Fundamento:

- los conteos finales esperados son exactos;
- el modelo Paciente → Turno/Documento/Odontograma/Historia/Cargo y Cargo → Pago está respaldado por FK físicas;
- Cargos/Pagos coincide con la migración final y no conserva el modelo antiguo en el esquema;
- las relaciones de solicitudes, profesionales, WhatsApp y auditoría son reales en runtime, pero solo lógicas en PostgreSQL;
- persisten elementos legacy que deben identificarse explícitamente;
- no puede certificarse la fidelidad visual de un DER o diccionario externo no suministrado en esta fase.

### Confirmaciones de alcance

- ARCHIVO CREADO: `AUDITORIA_ESTRUCTURA_DATOS_FINAL.md`
- OTROS ARCHIVOS MODIFICADOS: NINGUNO
- CÓDIGO MODIFICADO: NO
- SQL MODIFICADO: NO
- TESIS MODIFICADA: NO
- BASE DE DATOS MODIFICADA: NO
- MIGRACIONES EJECUTADAS: NINGUNA
