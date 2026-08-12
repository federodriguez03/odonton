# Diagnóstico de la base de datos actual de Odonton

Fecha del diagnóstico: 11/08/2026  
Origen: volcado de solo esquema de la base local `odonton_db`, generado con PostgreSQL `pg_dump 16.3`.  
Archivo fuente: `database/schema_actual.sql`.

Este diagnóstico no ejecutó migraciones ni operaciones de escritura sobre PostgreSQL. El volcado se creó con `--schema-only --no-owner --no-privileges` y no contiene sentencias `INSERT` ni `COPY`.

## 1. Resumen de la base actual

- Host configurado: `localhost`.
- Puerto configurado: `5432`.
- Base configurada: `odonton_db`.
- Usuario: configurado, omitido del informe.
- Contraseña: configurada, omitida del informe.
- Conexión de la aplicación: `pg.Pool` en `backend/src/config/db.js`.
- Tablas encontradas: 25.
- Esquema consolidado anterior: `database/schema.sql` está vacío.
- El esquema real combina tablas base, migraciones fechadas y cambios creados por servicios durante la ejecución.

La base funciona como una acumulación histórica. Hay objetos coherentes con el código actual, pero también modelos duplicados y columnas de generaciones anteriores.

## 2. Inventario de tablas

| Tabla | Finalidad | PK | FK reales | Columnas importantes | Módulo | Observaciones |
|---|---|---|---|---|---|---|
| `usuarios` | Usuarios autenticables y profesionales | `id` | Ninguna declarada | `nombre`, `email`, `password_hash`, `activo`, `created_at` | Autenticación/turnos | `email` es UNIQUE. No existe columna de rol. |
| `pacientes` | Datos personales y clínicos básicos | `id` | Ninguna | `dni`, `nombre`, `apellido`, `telefono`, `email`, `alergias`, `condiciones`, `estado_tratamiento` | Pacientes/ficha | `dni` tiene dos mecanismos de unicidad: constraint e índice UNIQUE. |
| `turnos` | Agenda y estados de atención/solicitud | `id` | `paciente_id → pacientes` RESTRICT; `prestacion_id → prestaciones` RESTRICT | fechas, `estado`, `origen`, `profesional_id`, recordatorios y solicitud | Turnos/WhatsApp | No hay FK real para `profesional_id`. Fechas y prestación admiten NULL. |
| `prestaciones` | Catálogo de prestaciones y precios | `id` | Ninguna | `nombre`, `duracion_minutos`, `precio_base`, `activa`, `activo` | Prestaciones/turnos/pagos | Conviven `activa` y `activo`, señal de evolución incompleta. |
| `pagos` | Movimientos de cobro por paciente y turno opcional | `id` | `paciente_id → pacientes` RESTRICT; `turno_id → turnos` SET NULL | `monto`, `metodo_pago`, `metodo`, `estado`, `fecha_pago` | Pagos | Conviven dos columnas de método. No hay FK directa a prestación. |
| `turno_solicitudes` | Solicitudes pendientes recibidas por WhatsApp | `id` | Ninguna declarada | tipo, estado, paciente, DNI, teléfono, turno y preferencia | Turnos/WhatsApp | `paciente_id` y `turno_id` parecen referencias lógicas, no FKs reales. |
| `whatsapp_reminders` | Registro de recordatorios y respuestas | `id` | Ninguna declarada | `appointment_id`, `patient_id`, teléfono, estado, envío/respuesta | WhatsApp | IDs relacionados no tienen FK. Estados y timestamps están en inglés. |
| `whatsapp_conversations` | Estado de conversaciones de autogestión | `id` | Ninguna declarada | `phone`, `status`, `step`, IDs lógicos, `data`, expiración | WhatsApp | Paciente, prestación, profesional y turno no tienen FK. |
| `autogestion_tokens` | Tokens del flujo de autogestión por enlaces | `id` | Ninguna declarada | `token`, teléfono, estado, flujo, turno, paciente, expiración | Autogestión anterior | `token` es UNIQUE. Tiene varias referencias lógicas sin FK. |
| `tokens_autogestion` | Tokens antiguos ligados a turno | `id` | `turno_id → turnos` CASCADE | `token`, `expira_en`, `usado` | Autogestión legacy | Modelo anterior separado de `autogestion_tokens`. |
| `odontograma` | Estado actual por diente y cara | `id` | `paciente_id → pacientes` CASCADE | `diente`, `cara`, `estado`, `fecha` | Odontograma actual | UNIQUE por paciente/diente/cara. |
| `odontograma_meta` | Datos generales del odontograma | `id` | `paciente_id → pacientes` CASCADE | `sarro`, `periodontal`, `observaciones` | Odontograma actual | Un registro por paciente mediante UNIQUE. |
| `odontograma_piezas` | Modelo anterior por pieza y JSON de caras | `id` | `paciente_id → pacientes` CASCADE | `pieza_numero`, `estado_pieza`, `caras`, observaciones | Odontograma anterior | UNIQUE por paciente/pieza. |
| `odontograma_cambios` | Historial del odontograma anterior | `id` | `paciente_id → pacientes` CASCADE | pieza, acción, estado, caras, usuario | Odontograma anterior | `usuario_id` no tiene FK. |
| `tratamientos` | Tratamientos por paciente y diente | `id` | `paciente_id → pacientes` CASCADE | diente, tipo, observaciones, fecha | Ficha clínica | Activa en servicios. |
| `protesis_fijas` | Prótesis fijas por paciente | `id` | `paciente_id → pacientes` CASCADE | tipo, dientes, descripción, fecha | Ficha clínica | Usa arreglo `smallint[]` para dientes. |
| `protesis_removibles` | Prótesis removibles por arcada | `id` | `paciente_id → pacientes` CASCADE | tipo, arcada, descripción, fecha | Ficha clínica | No hay CHECK para arcada. |
| `documentos_paciente` | Metadatos de documentos subidos | `id` | `paciente_id → pacientes` CASCADE | nombre, ruta, MIME/descripción, fecha | Documentos | Activa. El archivo físico está fuera de PostgreSQL. |
| `historias_clinicas` | Entradas clínicas históricas | `id` | paciente RESTRICT; turno SET NULL | descripción, fecha | Ficha clínica antigua | Es consultada por `pacientesService.js`; no tiene migración disponible. |
| `archivos_clinicos` | Archivos asociados a historia clínica | `id` | `historia_id → historias_clinicas` CASCADE | nombre, ruta, tipo, fecha | Documentos antiguo | No se encontró consumidor en los servicios actuales. |
| `auditoria` | Registro de acciones | `id` | Ninguna declarada | columnas antiguas de entidad y nuevas de recurso/metadata | Auditoría | Une dos diseños en una tabla. `id` es integer aunque servicios proponen BIGSERIAL. |
| `configuracion_consultorio` | Datos y palabras clave del consultorio | `id` | Ninguna | nombre, WhatsApp, timezone, keywords | Configuración | Activa. |
| `configuracion_horarios_atencion` | Horario general por día | `id` | Ninguna | día, activo, desde/hasta | Configuración/turnos | UNIQUE por día. |
| `configuracion_mensajes_automaticos` | Plantillas de mensajes | `id` | Ninguna | tipo, contenido, activo | Configuración/WhatsApp | `tipo` es UNIQUE. |
| `profesionales_horarios_atencion` | Horarios por profesional | `id` | Ninguna declarada | `profesional_id`, día, desde/hasta | Turnos | UNIQUE por profesional/día, pero sin FK a `usuarios`. |

## 3. Relaciones principales

```text
pacientes
├── turnos (ON DELETE RESTRICT)
│   ├── pagos.turno_id (ON DELETE SET NULL)
│   ├── historias_clinicas.turno_id (ON DELETE SET NULL)
│   └── tokens_autogestion.turno_id (ON DELETE CASCADE)
├── pagos (ON DELETE RESTRICT)
├── documentos_paciente (ON DELETE CASCADE)
├── historias_clinicas (ON DELETE RESTRICT)
├── odontograma / odontograma_meta (ON DELETE CASCADE)
├── odontograma_piezas / odontograma_cambios (ON DELETE CASCADE)
├── tratamientos (ON DELETE CASCADE)
└── protesis_fijas / protesis_removibles (ON DELETE CASCADE)

prestaciones
└── turnos (ON DELETE RESTRICT)
```

`turno_solicitudes`, `whatsapp_reminders`, `whatsapp_conversations` y `autogestion_tokens` contienen IDs relacionados pero no tienen foreign keys declaradas. Esto permite registros huérfanos.

## 4. Problemas estructurales

1. `database/schema.sql` no representa la base.
2. No hay migración inicial para tablas centrales: `usuarios`, `pacientes`, `prestaciones` y base de `turnos`.
3. Los servicios crean y alteran tablas durante peticiones normales.
4. Existen dos modelos de odontograma.
5. Existen dos tablas de tokens de autogestión.
6. `prestaciones` tiene `activa` y `activo`.
7. `pagos` tiene `metodo_pago` y `metodo`.
8. `auditoria` contiene columnas de dos implementaciones.
9. Hay índices duplicados funcionalmente sobre `pacientes.dni` y `turnos.paciente_id`.
10. Numerosas relaciones lógicas no tienen FK.
11. Los estados se guardan como texto sin CHECK en turnos, pagos, solicitudes y WhatsApp.
12. Los tipos de fecha no son uniformes: se mezclan `timestamp with time zone` y `timestamp without time zone`.

## 5. DDL ejecutado desde services/middleware

No se encontró `DROP TABLE` en `backend/src`. Sí se encontraron los siguientes cambios automáticos:

| Archivo / función | DDL ejecutado | Tabla afectada | Riesgo |
|---|---|---|---|
| `middlewares/turnosMiddleware.js` / `asegurarTablaAuditoria` | CREATE TABLE y siete ADD COLUMN | `auditoria` | Alto: middleware altera esquema al auditar |
| `services/auditoriaService.js` / `asegurarTablaAuditoria` | CREATE TABLE y siete ADD COLUMN | `auditoria` | Alto: duplicado del middleware |
| `services/autogestionService.js` / `asegurarTablaAutogestionTokens` | CREATE TABLE y ADD `tipo_flujo` | `autogestion_tokens` | Medio |
| `services/configuracionService.js` / `asegurarConfiguracion` | CREATE tres tablas y ADD keywords | `configuracion_*` | Alto: además inserta valores iniciales |
| `services/documentosService.js` / `asegurarTabla` | CREATE TABLE y dos índices | `documentos_paciente` | Medio |
| `services/odontogramaService.js` / `asegurarTablas` | CREATE dos tablas y ADD observaciones | `odontograma`, `odontograma_meta` | Medio |
| `services/pacientesService.js` / `asegurarColumnasClinicasPacientes` | ADD tres columnas | `pacientes` | Medio |
| `services/pacientesService.js` / `asegurarTablasOdontograma` | CREATE dos tablas | `odontograma_piezas`, `odontograma_cambios` | Alto: mantiene modelo duplicado |
| `services/pagosService.js` / `asegurarTablaPagos` | CREATE, ocho ADD COLUMN e índice | `pagos` | Alto: definición difiere de la base real y también ejecuta UPDATE |
| `services/prestacionesService.js` / `asegurarColumnasPrestaciones` | ADD `activo` y `updated_at` | `prestaciones` | Medio: dejó coexistiendo `activa` y `activo` |
| `services/protesisFijasService.js` / `crearTabla` | CREATE TABLE | `protesis_fijas` | Medio |
| `services/protesisRemoviblesService.js` / `crearTabla` | CREATE TABLE | `protesis_removibles` | Medio |
| `services/tratamientosService.js` / inicialización | CREATE TABLE | `tratamientos` | Medio |
| `services/turnoSolicitudesService.js` / `asegurarTablaTurnoSolicitudes` | CREATE, múltiples ADD COLUMN, ALTER y tres índices | `turno_solicitudes` | Alto: además normaliza filas con UPDATE |
| `services/turnosService.js` / inicialización | ADD columnas, DROP CONSTRAINT, DROP NOT NULL y CREATE horarios | `turnos`, `profesionales_horarios_atencion` | Alto |
| `services/turnosService.js` / inicialización de recordatorios | ADD cinco columnas | `turnos` | Medio, duplicado |
| `services/whatsappAutogestion.service.js` / inicialización | CREATE TABLE y dos índices | `whatsapp_conversations` | Medio |
| `services/whatsappReminder.service.js` / inicialización | CREATE reminders y ocho ADD COLUMN | `whatsapp_reminders`, `turnos` | Alto, duplicado con migraciones y `turnosService` |

Aunque se usan `IF NOT EXISTS`, estos bloques no son inocuos: ocultan diferencias de tipos, constraints y FKs, y algunos ejecutan `UPDATE` de datos durante la inicialización.

## 6. Situación particular de Pagos

### Estructura real

| Columna | Tipo | Nulabilidad/default |
|---|---|---|
| `id` | integer | NOT NULL, secuencia, PK |
| `paciente_id` | integer | NOT NULL, FK a pacientes RESTRICT |
| `turno_id` | integer | NULL, FK a turnos SET NULL |
| `monto` | numeric(10,2) | NOT NULL, CHECK monto > 0 |
| `metodo_pago` | varchar(50) | NULL, columna anterior |
| `estado` | varchar(30) | NULL, default `pagado` |
| `created_at` | timestamptz | NULL, default now() |
| `fecha_pago` | timestamptz | NULL |
| `updated_at` | timestamptz | NULL |
| `metodo` | text | NULL, columna usada por código actual |
| `observaciones` | text | NULL |

Índices: `idx_pagos_paciente` y `idx_pagos_paciente_fecha`. No hay UNIQUE adicional ni CHECK de estados/métodos. No existe relación directa con `prestaciones`; se llega a ella mediante `pagos.turno_id → turnos.prestacion_id`.

### Comparación con `pagosService.js`

**A. Columnas utilizadas que existen:** sí. El servicio actual utiliza `id`, `paciente_id`, `turno_id`, `monto`, `metodo`, `estado`, `fecha_pago`, `observaciones`, `created_at` y `updated_at`; todas existen.

**B. Columnas creadas que ya existen:** sí. `asegurarTablaPagos()` intenta agregar todas las columnas actuales con `IF NOT EXISTS` en cada primera utilización del proceso.

**C. Alteración durante ejecución:** sí. Ejecuta `CREATE TABLE`, ocho `ALTER TABLE`, dos `UPDATE` correctivos y un `CREATE INDEX`.

**D. Inconsistencias entre validación y BD:**

- El servicio limita estados a `pendiente`, `parcial` y `pagado`; la BD acepta cualquier texto o NULL.
- El servicio exige `metodo`; la BD permite NULL.
- La BD conserva `metodo_pago`, pero el servicio no lo consulta ni actualiza.
- El servicio propone `NUMERIC(12,2)` al crear/agregar; la columna real es `NUMERIC(10,2)`. `ADD COLUMN IF NOT EXISTS` no corrige el tipo.
- El servicio propone `monto NOT NULL`, `metodo NOT NULL`, `estado NOT NULL` y `fecha_pago NOT NULL` cuando crea desde cero; la base instalada permite NULL en varios de ellos.
- Al actualizar, el servicio usa `paciente_id: 1` como valor ficticio para reutilizar la validación.

**E. Suposiciones que no coinciden:**

- Si creara la tabla desde cero, definiría paciente con `ON DELETE CASCADE`; la base real usa `ON DELETE RESTRICT`.
- Calcula deuda con el precio actual de `prestaciones`, no con un importe histórico en pagos/cargos.
- No valida que el turno pertenezca al paciente recibido.
- No impide pagos superiores al saldo.
- El servicio supone que todos los registros modernos tienen `metodo`, pero pueden existir filas antiguas con solo `metodo_pago`.

## 7. Situación particular de Turnos

- `prestacion_id`, `fecha_hora_inicio` y `fecha_hora_fin` admiten NULL para representar solicitudes.
- `paciente_id` sigue siendo NOT NULL.
- El CHECK `chk_fechas_turno` exige fin posterior a inicio cuando ambas fechas existen.
- No hay CHECK de estados ni origen.
- `profesional_id` no tiene FK a `usuarios`.
- Existen columnas antiguas de token de reprogramación junto con el modelo nuevo de solicitudes.
- Una solicitud puede quedar representada simultáneamente en `turnos` y `turno_solicitudes`.
- Hay dos índices equivalentes sobre `turnos.paciente_id`.
- Recordatorios también están duplicados entre columnas de `turnos` y `whatsapp_reminders`.
- La migración que elimina columnas de Google Calendar fue aplicada al menos estructuralmente: `google_event_id`, `sync_estado` y `sync_error` no aparecen en el esquema actual.

## 8. Comparación con migraciones y tablas aparentemente legacy

### Objetos reales sin migración de creación disponible

- `usuarios`
- `pacientes` (solo hay migración para tres columnas clínicas)
- `prestaciones`
- estructura base de `turnos`
- `pagos`
- `historias_clinicas`
- `archivos_clinicos`
- `tokens_autogestion`
- definición original de `auditoria`

Estas tablas pudieron haber sido creadas manualmente, por SQL no versionado o por una versión anterior del proyecto.

### Migraciones duplicadas o superpuestas

- Odontograma: `2026-03-09_odontograma.sql`, `2026-03-09_odontograma_v2.sql`, `2026-03-10_odontograma_all.sql`, meta y observaciones.
- Recordatorios: `2026-05-05_recordatorios_whatsapp.sql` y `2026-05-07_whatsapp_web_reminders.sql` repiten columnas y auditoría.
- Solicitudes: `2026-05-22_turnos_solicitudes.sql` modifica `turnos`; `2026-05-26_turno_solicitudes_whatsapp.sql` agrega una tabla paralela.
- Auditoría se define en migraciones, middleware y servicio.
- Muchas migraciones están además reproducidas dentro de funciones `asegurar*`.

### Columnas que parecen originadas solamente desde services o SQL no disponible

- `pagos.metodo`, `fecha_pago`, `observaciones`, `updated_at` no tienen migración versionada específica.
- `prestaciones.activo` y `updated_at` son aseguradas por servicio; `activa` corresponde al modelo anterior.
- Parte de las columnas nuevas de `auditoria` son aseguradas por código.
- Las tablas base y sus constraints iniciales no pueden reconstruirse con `database/*.sql` actual.

### Tablas aparentemente legacy

- `tokens_autogestion`: reemplazada aparentemente por `autogestion_tokens`.
- `archivos_clinicos`: sin consumidor actual encontrado.
- `odontograma_piezas` y `odontograma_cambios`: modelo anterior, aunque sus endpoints todavía están montados.
- `historias_clinicas`: todavía consultada por la ficha, por lo que no debe eliminarse sin migración.
- Columnas antiguas `pagos.metodo_pago`, `prestaciones.activa` y columnas `entidad*` de `auditoria`.

Nada de lo anterior debe eliminarse solo por apariencia: primero se requieren conteos, análisis de datos y prueba de consumidores.

## 9. Riesgos antes del refactor

1. Perder información al elegir un solo modelo de odontograma.
2. Dejar pagos antiguos sin método al retirar `metodo_pago`.
3. Cambiar la política ON DELETE de pagos/pacientes accidentalmente.
4. Romper solicitudes o recordatorios por relaciones lógicas no declaradas.
5. Ejecutar migraciones viejas sobre una base que ya contiene sus cambios.
6. Convertir tipos o restricciones con datos incompatibles existentes.
7. Retirar `historias_clinicas` aunque la ficha todavía la consulta.
8. Perder trazabilidad al simplificar la tabla híbrida `auditoria`.
9. Duplicar constraints o índices al construir un esquema consolidado.
10. Generar deuda histórica incorrecta mientras Pagos dependa del precio actual de prestaciones.

## 10. Recomendaciones por prioridad

1. **Alta:** conservar este dump y realizar también un backup completo privado antes de cualquier migración futura.
2. **Alta:** obtener conteos y valores distintos por columnas legacy antes de decidir eliminaciones.
3. **Alta:** crear posteriormente una migración base reproducible a partir del esquema revisado, no copiarlo ciegamente.
4. **Alta:** retirar gradualmente el DDL de runtime solo después de que las migraciones cubran todos los objetos.
5. **Alta:** definir una única representación de solicitudes de turno.
6. **Alta:** diseñar la migración de Pagos contemplando `metodo_pago → metodo`, tipos, NULL y política ON DELETE.
7. **Alta:** decidir cuál odontograma conserva los datos válidos y migrar antes de borrar tablas.
8. **Media:** agregar FKs donde los datos actuales permitan hacerlo, especialmente solicitudes y WhatsApp.
9. **Media:** eliminar índices duplicados después de verificar uso y nombres esperados.
10. **Media:** unificar timestamps, estados y checks con un catálogo sencillo y documentado.
11. **Media:** separar el reporte de ingresos estimados del reporte de cobros reales.
12. **Baja:** retirar tablas y columnas legacy únicamente después de respaldo, consulta de datos y pruebas de regresión.

## Validación de alcance

- Base de datos modificada: **NO**.
- Migraciones ejecutadas: **NINGUNA**.
- Datos incluidos en el dump: **NINGUNO**.
- Archivo original `database/schema.sql`: **NO MODIFICADO**.
- Archivos de código frontend/backend: **NO MODIFICADOS**.
