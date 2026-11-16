# Odonton — Documentación integral del sistema

Este archivo es la documentación canónica única de Odonton. Describe el sistema implementado, su operación, sus límites conocidos y el diccionario físico verificado de la base de demostración. Los scripts, migraciones y el esquema SQL siguen siendo artefactos ejecutables y prevalecen sobre cualquier descripción narrativa cuando exista una diferencia.

## 1. Propósito y alcance

Odonton es un sistema web de gestión interna para consultorios odontológicos. Centraliza pacientes, agenda, ficha clínica, declaraciones de salud, atenciones, odontogramas, documentos, prestaciones, solicitudes y recordatorios por WhatsApp, cargos, pagos y reportes.

La constancia de pago es interna y no fiscal. El sistema no integra actualmente ARCA, CAE, factura electrónica, obras sociales ni plataformas de cobro. La agenda vigente es interna; Google Calendar no forma parte del flujo actual.

## 2. Tecnologías y arquitectura

- Frontend: HTML, CSS, Bootstrap, JavaScript modular y Vite.
- Backend: Node.js, Express y CommonJS.
- Base de datos: PostgreSQL mediante `pg` y pool de conexiones.
- Autenticación: JWT y contraseñas verificadas con bcrypt.
- Archivos: Multer y almacenamiento local protegido por endpoints autenticados.
- WhatsApp: `whatsapp-web.js`, Chromium/Puppeteer y `LocalAuth`.

El recorrido principal es:

```text
Vista frontend
  -> frontend/src/js/api.js
  -> HTTP /api/*
  -> rutas y middlewares
  -> controladores
  -> servicios y dominio
  -> PostgreSQL / filesystem / WhatsApp
```

Las vistas presentan y capturan datos; `api.js` centraliza el cliente HTTP; las rutas encadenan autenticación, autorización, validación y auditoría; los controladores adaptan HTTP; los servicios coordinan consultas y transacciones; el dominio concentra reglas puras; los jobs ejecutan tareas periódicas.

## 3. Estructura del repositorio

```text
odonton/
|-- backend/
|   |-- scripts/              # pruebas, migración y utilidades controladas
|   |-- src/
|   |   |-- config/           # PostgreSQL y configuración
|   |   |-- controllers/      # adaptación HTTP
|   |   |-- domain/           # reglas puras
|   |   |-- jobs/             # scheduler
|   |   |-- middleware*/      # autenticación, permisos y validación
|   |   |-- routes/           # endpoints /api
|   |   |-- services/         # negocio e integraciones
|   |   `-- utils/            # utilidades compartidas
|   |-- uploads/              # almacenamiento local no público
|   `-- .env.example
|-- frontend/
|   |-- src/js/api.js
|   |-- src/js/main.js
|   |-- src/js/views/
|   |-- src/styles/ y src/css/
|   `-- .env.example
|-- database/
|   |-- schema_actual.sql
|   |-- migrations.json       # orden canónico de migraciones
|   `-- 2026-*.sql
|-- docs/
|   `-- ESQUEMA_ODONTON_DEMO_2026.sql
`-- README.md                 # este documento
```

Las carpetas `middleware/` y `middlewares/` tienen consumidores vigentes; no deben unificarse sin una revisión específica.

## 4. Módulos y reglas vigentes

### Identidad y permisos

Los roles canónicos son `dueno`, `odontologo` y `recepcion`. La autorización efectiva se resuelve en el backend; ocultar navegación no sustituye los controles de las rutas. Los identificadores de usuario y de perfil profesional son independientes y no deben equipararse por coincidencia numérica.

- Dueño: administración y operación general; el acceso clínico depende de la política concreta de cada ruta.
- Odontólogo: agenda propia y funciones clínicas autorizadas, vinculadas a un perfil profesional habilitado.
- Recepción: agenda general y funciones administrativas/financieras permitidas, sin exposición clínica.

Las cuentas inactivas y los cambios de rol se validan contra el estado vigente. La contraseña temporal obliga al cambio conforme al flujo de autenticación. No deben concederse permisos por defecto si falta configuración de identidad.

### Pacientes y clínica

El alta administrativa admite únicamente campos administrativos. La ficha integra datos, antecedentes, declaración de salud, atenciones, odontograma y documentos según los permisos efectivos. Las declaraciones son versionadas: cada guardado genera una versión y una respuesta vacía nunca equivale a “No”. Los antecedentes previos no se convierten automáticamente en respuestas declaradas.

Las atenciones reutilizan el registro clínico existente. Cuando están vinculadas a un turno válido, el alta y el cambio del turno a atendido se realizan transaccionalmente. Los snapshots conservan el odontograma histórico; modificar el odontograma actual no altera versiones anteriores.

### Odontograma y prótesis

El odontograma conserva estados por cara y por pieza, observaciones y referencias configurables. Una cara ausente en el registro actual se presenta como “Sin evaluar”; en snapshots antiguos se indica ausencia de información sin reinterpretar el pasado. Las referencias inactivas no se ofrecen para nuevas asignaciones, pero siguen visibles donde fueron usadas.

`corona_completa` tiene alcance de pieza. Su representación es una convención visual provisional que requiere validación odontológica. La marca histórica `corona` permanece sin reinterpretación. Las prótesis estructuradas se obtienen de sus colecciones propias; una marca heredada no se convierte automáticamente en una prótesis.

### Documentos

Se admiten PDF, JPEG y PNG dentro del límite configurado. El backend valida firma real, MIME, extensión y tamaño; genera nombres internos seguros y confina lectura, vista previa, descarga y borrado a la raíz configurada, rechazando rutas absolutas, `..` y enlaces fuera de ella. No existe acceso público directo a uploads. Todas las operaciones conservan autenticación, autorización clínica y pertenencia paciente-atención-archivo.

### Agenda

- Ocupan agenda únicamente `programado`, `confirmado` y `reprogramado`.
- Los intervalos son `[inicio, fin)`: un turno puede comenzar cuando termina el anterior.
- La exclusión se resuelve por perfil profesional y se protege atómicamente en PostgreSQL.
- Los IDs legacy de usuario sólo se relacionan mediante vínculos explícitos; nunca por igualdad numérica accidental.
- Los conflictos se traducen a HTTP 409.
- Los solapamientos históricos se conservan y reportan; no se cancelan ni reasignan automáticamente.
- Un confirmado cuyo fin ya pasó se presenta como “Pendiente de registrar atención”, pero no cambia automáticamente a atendido ni se cuenta como tal.
- Cancelados y ausentes no pasan a atendidos mediante el registro clínico.
- La zona horaria operativa prevista es `America/Buenos_Aires`.

### Prestaciones y aranceles

Las prestaciones activas aportan duración y precio operativo propio. Los turnos admiten múltiples prestaciones mediante su relación específica. Las versiones y referencias arancelarias conservan trazabilidad documental sin sobrescribir precios históricos. No debe asociarse información sólo por similitud de nombres.

### Cargos y pagos

El modelo es Paciente -> Cargo -> Pago(s). Concepto e importe son snapshots históricos. El saldo y el estado pendiente/parcial/pagado se calculan. Las operaciones que afectan saldo bloquean el cargo; no se permite sobrepago. La anulación es lógica, conserva el registro y exige trazabilidad. Sólo pagos activos forman ingresos. Las constancias existentes son internas y no fiscales.

### WhatsApp

El bot registra solicitudes; el consultorio confirma. Pedir cancelación o reprogramación no modifica el turno automáticamente. La activación conversacional se limita al comando completo `turno`; frases que simplemente lo contienen no inician el flujo. Un paciente nuevo sólo accede a Primera Consulta y no pueden coexistir solicitudes activas duplicadas según las reglas vigentes.

La conexión distingue desconectado, conectando, esperando QR, autenticando, conectado, reconectando y error. “Conectado” sólo corresponde al evento `ready`. Conectar o reintentar conserva `LocalAuth`; desvincular requiere confirmación del dueño y elimina la sesión. Las operaciones se serializan, hay timeout y reconexión limitada. Debe existir una única instancia responsable de WhatsApp y scheduler.

El estado general no expone QR, teléfonos completos, cuerpos ni credenciales. El QR sólo se obtiene por la ruta autenticada del dueño. El diagnóstico de chats está deshabilitado en producción y, fuera de producción, entrega únicamente agregados. Los datos operativos necesarios permanecen en PostgreSQL; la política de retención histórica requiere una decisión administrativa.

## 5. Instalación y ejecución local

### Requisitos

- Node.js 18 o superior y npm.
- PostgreSQL.
- Navegador moderno.
- Chromium disponible para la instancia que opere WhatsApp.

### Dependencias

```powershell
cd backend
npm ci

cd ..\frontend
npm ci
```

### Configuración

```powershell
cd backend
Copy-Item .env.example .env

cd ..\frontend
Copy-Item .env.example .env.local
```

Los archivos privados nunca deben versionarse. Variables esenciales del backend:

- PostgreSQL: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Aplicación: `NODE_ENV`, `PORT`, `JWT_SECRET`.
- HTTP: `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, límites de cuerpo y login documentados en `.env.example`.
- Persistencia: raíz de uploads y `WHATSAPP_AUTH_DATA_PATH`.
- WhatsApp: autoarranque, nombre de sesión, timeout, modo seguro/diagnóstico y controles de transporte.
- Recordatorios: habilitación, ventana, intervalo y tamaño de lote.

En desarrollo, el frontend puede usar la URL relativa y Vite redirige `/api` y `/health` al backend local.

### Inicio y compilación

```powershell
cd backend
npm run dev
# o: npm start

cd ..\frontend
npm run dev

# compilación de frontend
npm run build
```

Backend predeterminado: `http://localhost:3000`. Frontend predeterminado: `http://localhost:5173`.

### Salud y cierre

- `GET /health/live`: confirma que el proceso HTTP está vivo.
- `GET /health/ready`: comprueba PostgreSQL y acceso al almacenamiento con timeout; WhatsApp es opcional y no condiciona readiness.

`SIGTERM`/`SIGINT` dejan de aceptar solicitudes, detienen el scheduler, drenan HTTP, destruyen el cliente WhatsApp propio conservando `LocalAuth` y cierran el pool. `SHUTDOWN_TIMEOUT_MS` limita el cierre. Sólo deben liberarse recursos pertenecientes al proceso administrado.

## 6. Esquema, migraciones y recuperación

`database/migrations.json` es el manifiesto canónico. Una instalación vacía aplica `database/schema_actual.sql` como baseline y después las migraciones en el orden declarado. Una actualización existente debe superar el preflight y contener las tablas base requeridas.

```powershell
cd backend
$env:MIGRATION_TARGET_DATABASE = 'nombre_exacto'
$env:MIGRATION_CONFIRM_DATABASE = 'nombre_exacto'
$env:MIGRATION_OWNER_EMAIL = 'dueno-existente@dominio.local'
node scripts/migrate-canonical.js
```

El ejecutor registra nombre, SHA-256 y fecha en `schema_migrations`; una reejecución no duplica efectos y un archivo aplicado cuyo contenido cambió se rechaza. Las protecciones de destinos incluidas en el ejecutor no deben quitarse informalmente.

La aplicación no debe ejecutar DDL durante solicitudes. Si falta esquema, falla explícitamente con `SCHEMA_NOT_READY`/503. El usuario runtime necesita DML, secuencias y ejecución de funciones, no `CREATE`, `ALTER` ni `DROP`.

Antes de actualizar una base real:

1. detener escrituras;
2. respaldar base, uploads y sesión WhatsApp;
3. restaurar el conjunto en una instancia aislada;
4. ensayar preflight, migraciones y recorridos críticos;
5. recién después programar la ventana real.

No existe rollback automático. Volver al código anterior no revierte datos, columnas, constraints, triggers ni relaciones. La recuperación soportada es restaurar coordinadamente el backup completo. Conservar escrituras posteriores exige una migración inversa específica y ensayada.

## 7. Base de demostración

La base demo prevista es `odonton_demo_2026`, con datos sintéticos. Las cinco contraseñas se reciben sólo mediante las variables definidas en `backend/demo-2026.env.example`; no deben escribirse ni imprimirse.

```powershell
powershell -ExecutionPolicy Bypass -File backend/scripts/prepare-demo-2026.ps1
node backend/scripts/set-demo-2026-passwords.js
powershell -ExecutionPolicy Bypass -File backend/scripts/start-demo-local.ps1
node backend/scripts/verify-demo-local.js
```

Para recuperar la configuración local anterior, detener el backend demo y ejecutar `backend/scripts/start-previous-local.ps1`. Los scripts verifican el destino y no deben usarse contra una base real sin revisar sus guardas.

| Cuenta | Rol |
|---|---|
| `dueno.demo.2026@example.com` | Dueño |
| `recepcion.demo.2026@example.com` | Recepción |
| `odontologa1.demo.2026@example.com` | Odontólogo |
| `odontologo2.demo.2026@example.com` | Odontólogo |
| `odontologa3.demo.2026@example.com` | Odontólogo |

La demo contiene pacientes y archivos ficticios, agenda 2026, atenciones con snapshots, declaraciones versionadas, prótesis, cargos/pagos y solicitudes WhatsApp sin transporte. No genera consentimientos, firmas ni mensajes reales.

## 8. Seguridad y publicación

- Configurar secretos fuertes fuera de Git.
- Mantener PostgreSQL en red privada y TLS en el acceso público.
- Definir orígenes CORS exactos y la cantidad real de proxies confiables.
- Persistir uploads y `LocalAuth`; incluirlos en una política privada de backup.
- Ejecutar Node/PostgreSQL con privilegios mínimos.
- Escanear el historial Git por secretos, sesiones, backups y datos personales antes de publicar.
- No versionar uploads reales, archivos `.env`, sesiones WhatsApp ni dumps con datos.
- Verificar navegador desktop/móvil, matriz por rol, migraciones, restore, concurrencia, documentos y una conexión WhatsApp supervisada antes de producción.

La cadena de producción de `whatsapp-web.js` conserva vulnerabilidades transitivas publicadas en Puppeteer/Chromium, proxy y archivado sin actualización compatible conocida en la última revisión. El riesgo afecta principalmente disponibilidad y filesystem del usuario del proceso. Mitigaciones: instalación reproducible desde lock, imagen inmutable, rutas fijas, usuario sin privilegios, límites de memoria/reintentos y una única instancia administrada. Debe repetirse `npm audit --omit=dev` antes de publicar y evaluar una actualización compatible sin `--force` ni overrides arbitrarios.

No corresponde afirmar entrega exactamente una vez para WhatsApp: el transporte externo no permite esa garantía absoluta. Las pruebas simuladas no sustituyen QR, autenticación, `ready`, persistencia ni entrega reales en el entorno destino.

## 9. Pruebas y controles finales

Los scripts `backend/scripts/test-*.js` cubren validaciones, permisos, agenda/concurrencia, solicitudes, documentos, declaraciones, pagos/reportes y WhatsApp simulado. Las pruebas que escriben deben crear su propio backend en puerto libre y usar exclusivamente una base temporal aislada, verificando el nombre antes de operar y limpiando sólo fixtures propios.

Antes de una entrega:

1. ejecutar `npm ci` desde ambos locks en un entorno limpio;
2. compilar el frontend;
3. ejecutar regresiones específicas y la matriz HTTP Dueño/Recepción/Odontólogo;
4. comprobar ausencia de filtraciones clínicas y escrituras no autorizadas;
5. probar instalación vacía y actualización sobre una copia;
6. revisar consola, responsive, foco, modales y estados de error en navegador;
7. ensayar backup/restore, readiness y cierre coordinado;
8. realizar separadamente una conexión WhatsApp real y supervisada, sin confundirla con las pruebas simuladas.

## 10. Límites y decisiones pendientes

- Validar con un odontólogo los símbolos clínicos ambiguos, especialmente corona completa.
- Definir retención de auditorías y datos operativos de WhatsApp.
- Revisar periódicamente la cadena vulnerable de `whatsapp-web.js`.
- Completar pruebas visuales y de infraestructura en el destino real.
- Mantener una sola instancia de WhatsApp/scheduler o incorporar coordinación distribuida antes de escalar.
- Las automatizaciones futuras de aranceles no deben sobrescribir precios propios ni asociar prestaciones sólo por nombre.

## 11. Diccionario de datos verificado

- Base verificada: `odonton_demo_2026`.
- Extracción: transacción `READ ONLY`.
- Motor: PostgreSQL 16.3, compiled by Visual C++ build 1939, 64-bit.
- Alcance: esquema `public`; no se consultaron filas de negocio.

## Criterio de lectura

- **Relación física:** existe una restricción PostgreSQL verificada en el catálogo.
- **Relación lógica:** el código usa una columna como vínculo, pero PostgreSQL no declara una FK; requiere confirmación antes de tratarla como integridad garantizada.
- Las finalidades se basan en comentarios PostgreSQL cuando existen. Si no, se rotulan como interpretación contrastada con los servicios indicados.
- Los nombres `legacy`, `compatibilidad` o identificadores residuales se documentan como compatibilidad, no como modelo recomendado para nuevas altas.

## Tablas

### `arancel_auditoria`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('arancel_auditoria_id_seq'::regclass)` | — |
| `version_id` | `bigint` | No | — | — |
| `usuario_id` | `integer` | Sí | — | — |
| `accion` | `character varying(40)` | No | — | — |
| `detalle` | `jsonb` | No | `'{}'::jsonb` | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `arancel_auditoria_usuario_id_fkey`:** `usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `arancel_auditoria_version_id_fkey`:** `version_id` → `arancel_versiones`(`id`). Definición: `FOREIGN KEY (version_id) REFERENCES arancel_versiones(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `arancel_auditoria_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `arancel_auditoria_pkey`: `CREATE UNIQUE INDEX arancel_auditoria_pkey ON public.arancel_auditoria USING btree (id)`.

### `arancel_referencias`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('arancel_referencias_id_seq'::regclass)` | — |
| `version_id` | `bigint` | No | — | — |
| `fila_csv` | `integer` | No | — | — |
| `codigo` | `text` | No | — | — |
| `nombre` | `text` | No | — | — |
| `categoria` | `text` | No | — | — |
| `precio` | `numeric(14,2)` | Sí | — | — |
| `estado_precio` | `text` | No | — | — |
| `pagina_pdf` | `integer` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **CHECK `arancel_referencias_categoria_check`:** `categoria`. Definición: `CHECK (btrim(categoria) <> ''::text)`.
- **CHECK `arancel_referencias_codigo_check`:** `codigo`. Definición: `CHECK (btrim(codigo) <> ''::text)`.
- **CHECK `arancel_referencias_estado_precio_check`:** `estado_precio`. Definición: `CHECK (btrim(estado_precio) <> ''::text)`.
- **CHECK `arancel_referencias_fila_csv_check`:** `fila_csv`. Definición: `CHECK (fila_csv >= 2)`.
- **CHECK `arancel_referencias_nombre_check`:** `nombre`. Definición: `CHECK (btrim(nombre) <> ''::text)`.
- **CHECK `arancel_referencias_pagina_pdf_check`:** `pagina_pdf`. Definición: `CHECK (pagina_pdf > 0)`.
- **FOREIGN KEY `arancel_referencias_version_id_fkey`:** `version_id` → `arancel_versiones`(`id`). Definición: `FOREIGN KEY (version_id) REFERENCES arancel_versiones(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `arancel_referencias_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `arancel_referencias_version_id_codigo_key`:** `version_id, codigo`. Definición: `UNIQUE (version_id, codigo)`.
- **UNIQUE `arancel_referencias_version_id_fila_csv_key`:** `version_id, fila_csv`. Definición: `UNIQUE (version_id, fila_csv)`.

**Índices**

- `arancel_referencias_codigo_idx`: `CREATE INDEX arancel_referencias_codigo_idx ON public.arancel_referencias USING btree (codigo)`.
- `arancel_referencias_pkey`: `CREATE UNIQUE INDEX arancel_referencias_pkey ON public.arancel_referencias USING btree (id)`.
- `arancel_referencias_version_id_codigo_key`: `CREATE UNIQUE INDEX arancel_referencias_version_id_codigo_key ON public.arancel_referencias USING btree (version_id, codigo)`.
- `arancel_referencias_version_id_fila_csv_key`: `CREATE UNIQUE INDEX arancel_referencias_version_id_fila_csv_key ON public.arancel_referencias USING btree (version_id, fila_csv)`.

### `arancel_versiones`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('arancel_versiones_id_seq'::regclass)` | — |
| `fuente` | `text` | No | — | — |
| `version_documental` | `text` | No | — | — |
| `moneda` | `character varying(10)` | No | — | — |
| `vigencia` | `date` | No | — | — |
| `archivo_nombre` | `text` | No | — | — |
| `archivo_hash_sha256` | `character(64)` | No | — | — |
| `creado_por_usuario_id` | `integer` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **CHECK `arancel_versiones_fuente_check`:** `fuente`. Definición: `CHECK (btrim(fuente) <> ''::text)`.
- **CHECK `arancel_versiones_moneda_check`:** `moneda`. Definición: `CHECK (btrim(moneda::text) <> ''::text)`.
- **CHECK `arancel_versiones_version_documental_check`:** `version_documental`. Definición: `CHECK (btrim(version_documental) <> ''::text)`.
- **FOREIGN KEY `arancel_versiones_creado_por_usuario_id_fkey`:** `creado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `arancel_versiones_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `arancel_versiones_archivo_hash_sha256_key`:** `archivo_hash_sha256`. Definición: `UNIQUE (archivo_hash_sha256)`.

**Índices**

- `arancel_versiones_archivo_hash_sha256_key`: `CREATE UNIQUE INDEX arancel_versiones_archivo_hash_sha256_key ON public.arancel_versiones USING btree (archivo_hash_sha256)`.
- `arancel_versiones_fuente_vigencia_idx`: `CREATE INDEX arancel_versiones_fuente_vigencia_idx ON public.arancel_versiones USING btree (lower(fuente), vigencia DESC, id DESC)`.
- `arancel_versiones_pkey`: `CREATE UNIQUE INDEX arancel_versiones_pkey ON public.arancel_versiones USING btree (id)`.

### `archivos_clinicos`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('archivos_clinicos_id_seq'::regclass)` | — |
| `historia_id` | `integer` | No | — | — |
| `nombre_archivo` | `character varying(255)` | Sí | — | — |
| `ruta_archivo` | `text` | No | — | — |
| `tipo` | `character varying(50)` | Sí | — | — |
| `created_at` | `timestamp with time zone` | Sí | `now()` | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `fk_archivo_historia`:** `historia_id` → `historias_clinicas`(`id`). Definición: `FOREIGN KEY (historia_id) REFERENCES historias_clinicas(id) ON DELETE CASCADE`.
- **PRIMARY KEY `archivos_clinicos_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `archivos_clinicos_pkey`: `CREATE UNIQUE INDEX archivos_clinicos_pkey ON public.archivos_clinicos USING btree (id)`.

### `auditoria`

**Finalidad:** Auditoría de acciones del sistema — *interpretación basada en auditoriaService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('auditoria_id_seq'::regclass)` | — |
| `entidad` | `character varying(50)` | Sí | — | — |
| `entidad_id` | `integer` | Sí | — | — |
| `accion` | `character varying(50)` | Sí | — | — |
| `descripcion` | `text` | Sí | — | — |
| `fecha` | `timestamp with time zone` | Sí | `now()` | — |
| `usuario_id` | `integer` | Sí | — | — |
| `recurso` | `text` | Sí | — | — |
| `recurso_id` | `text` | Sí | — | — |
| `status_code` | `integer` | Sí | — | — |
| `metadata` | `jsonb` | Sí | — | — |
| `created_at` | `timestamp with time zone` | Sí | `now()` | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `auditoria_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `auditoria_pkey`: `CREATE UNIQUE INDEX auditoria_pkey ON public.auditoria USING btree (id)`.

### `cargos`

**Finalidad:** Cargos financieros por paciente — *interpretación basada en cargosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('cargos_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `turno_id` | `integer` | Sí | — | — |
| `prestacion_id` | `integer` | Sí | — | — |
| `concepto` | `text` | No | — | — |
| `importe_total` | `numeric(12,2)` | No | — | — |
| `fecha_cargo` | `date` | No | `CURRENT_DATE` | — |
| `observaciones` | `text` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **CHECK `cargos_concepto_no_vacio_check`:** `concepto`. Definición: `CHECK (btrim(concepto) <> ''::text)`.
- **CHECK `cargos_importe_total_positivo_check`:** `importe_total`. Definición: `CHECK (importe_total > 0::numeric)`.
- **FOREIGN KEY `fk_cargo_paciente`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `fk_cargo_prestacion`:** `prestacion_id` → `prestaciones`(`id`). Definición: `FOREIGN KEY (prestacion_id) REFERENCES prestaciones(id) ON DELETE SET NULL`.
- **FOREIGN KEY `fk_cargo_turno`:** `turno_id` → `turnos`(`id`). Definición: `FOREIGN KEY (turno_id) REFERENCES turnos(id) ON DELETE SET NULL`.
- **PRIMARY KEY `cargos_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `cargos_pkey`: `CREATE UNIQUE INDEX cargos_pkey ON public.cargos USING btree (id)`.
- `idx_cargos_paciente_fecha`: `CREATE INDEX idx_cargos_paciente_fecha ON public.cargos USING btree (paciente_id, fecha_cargo DESC)`.
- `idx_cargos_prestacion`: `CREATE INDEX idx_cargos_prestacion ON public.cargos USING btree (prestacion_id) WHERE (prestacion_id IS NOT NULL)` **(parcial)**.
- `idx_cargos_turno`: `CREATE INDEX idx_cargos_turno ON public.cargos USING btree (turno_id) WHERE (turno_id IS NOT NULL)` **(parcial)**.

### `configuracion_consultorio`

**Finalidad:** Configuración general del consultorio — *interpretación basada en configuracionService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('configuracion_consultorio_id_seq'::regclass)` | — |
| `nombre_consultorio` | `character varying(150)` | No | `'Odonton'::character varying` | — |
| `whatsapp_numero` | `character varying(30)` | Sí | — | — |
| `timezone` | `character varying(80)` | No | `'America/Argentina/Buenos_Aires'::character varying` | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |
| `autogestion_keywords` | `text` | No | `'turno, turnito, cita, consulta, odontologo, odont?loga, odontologia, odontolog?a'::text` | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `configuracion_consultorio_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `configuracion_consultorio_pkey`: `CREATE UNIQUE INDEX configuracion_consultorio_pkey ON public.configuracion_consultorio USING btree (id)`.

### `configuracion_horarios_atencion`

**Finalidad:** Horario global de respaldo — *interpretación basada en configuracionService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('configuracion_horarios_atencion_id_seq'::regclass)` | — |
| `dia_semana` | `integer` | No | — | — |
| `activo` | `boolean` | No | `false` | — |
| `hora_desde` | `time without time zone` | Sí | — | — |
| `hora_hasta` | `time without time zone` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `configuracion_horarios_atencion_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `configuracion_horarios_atencion_dia_semana_key`:** `dia_semana`. Definición: `UNIQUE (dia_semana)`.

**Índices**

- `configuracion_horarios_atencion_dia_semana_key`: `CREATE UNIQUE INDEX configuracion_horarios_atencion_dia_semana_key ON public.configuracion_horarios_atencion USING btree (dia_semana)`.
- `configuracion_horarios_atencion_pkey`: `CREATE UNIQUE INDEX configuracion_horarios_atencion_pkey ON public.configuracion_horarios_atencion USING btree (id)`.

### `configuracion_mensajes_automaticos`

**Finalidad:** Plantillas de mensajes automáticos — *interpretación basada en configuracionService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('configuracion_mensajes_automaticos_id_seq'::regclass)` | — |
| `tipo` | `character varying(60)` | No | — | — |
| `contenido` | `text` | No | — | — |
| `activo` | `boolean` | No | `true` | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `configuracion_mensajes_automaticos_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `configuracion_mensajes_automaticos_tipo_key`:** `tipo`. Definición: `UNIQUE (tipo)`.

**Índices**

- `configuracion_mensajes_automaticos_pkey`: `CREATE UNIQUE INDEX configuracion_mensajes_automaticos_pkey ON public.configuracion_mensajes_automaticos USING btree (id)`.
- `configuracion_mensajes_automaticos_tipo_key`: `CREATE UNIQUE INDEX configuracion_mensajes_automaticos_tipo_key ON public.configuracion_mensajes_automaticos USING btree (tipo)`.

### `declaraciones_salud`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('declaraciones_salud_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `numero_version` | `integer` | No | — | — |
| `cuestionario_version` | `character varying(40)` | No | — | — |
| `respondido_por` | `character varying(10)` | No | — | — |
| `nombre_tutor` | `character varying(160)` | Sí | — | — |
| `respuestas` | `jsonb` | No | `'{}'::jsonb` | — |
| `estado` | `character varying(12)` | No | — | — |
| `cargado_por_usuario_id` | `integer` | No | — | — |
| `reemplaza_declaracion_id` | `bigint` | Sí | — | — |
| `completada_at` | `timestamp with time zone` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **CHECK `declaraciones_salud_check`:** `respondido_por, nombre_tutor`. Definición: `CHECK (respondido_por::text = 'tutor'::text AND NULLIF(btrim(nombre_tutor::text), ''::text) IS NOT NULL OR respondido_por::text = 'paciente'::text AND nombre_tutor IS NULL)`.
- **CHECK `declaraciones_salud_check1`:** `estado, completada_at`. Definición: `CHECK (estado::text = 'completa'::text AND completada_at IS NOT NULL OR estado::text = 'incompleta'::text)`.
- **CHECK `declaraciones_salud_estado_check`:** `estado`. Definición: `CHECK (estado::text = ANY (ARRAY['incompleta'::character varying::text, 'completa'::character varying::text]))`.
- **CHECK `declaraciones_salud_respondido_por_check`:** `respondido_por`. Definición: `CHECK (respondido_por::text = ANY (ARRAY['paciente'::character varying::text, 'tutor'::character varying::text]))`.
- **FOREIGN KEY `declaraciones_salud_cargado_por_usuario_id_fkey`:** `cargado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (cargado_por_usuario_id) REFERENCES usuarios(id)`.
- **FOREIGN KEY `declaraciones_salud_paciente_id_fkey`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE`.
- **FOREIGN KEY `declaraciones_salud_reemplaza_declaracion_id_fkey`:** `reemplaza_declaracion_id` → `declaraciones_salud`(`id`). Definición: `FOREIGN KEY (reemplaza_declaracion_id) REFERENCES declaraciones_salud(id)`.
- **PRIMARY KEY `declaraciones_salud_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `declaraciones_salud_paciente_id_numero_version_key`:** `paciente_id, numero_version`. Definición: `UNIQUE (paciente_id, numero_version)`.

**Índices**

- `declaraciones_salud_paciente_id_numero_version_key`: `CREATE UNIQUE INDEX declaraciones_salud_paciente_id_numero_version_key ON public.declaraciones_salud USING btree (paciente_id, numero_version)`.
- `declaraciones_salud_pkey`: `CREATE UNIQUE INDEX declaraciones_salud_pkey ON public.declaraciones_salud USING btree (id)`.
- `idx_declaraciones_salud_paciente_fecha`: `CREATE INDEX idx_declaraciones_salud_paciente_fecha ON public.declaraciones_salud USING btree (paciente_id, created_at DESC, id DESC)`.

### `demo_generator_runs`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `generator_id` | `text` | No | — | — |
| `seed` | `integer` | No | — | — |
| `cutoff_date` | `date` | No | — | — |
| `status` | `text` | No | — | — |
| `summary` | `jsonb` | No | `'{}'::jsonb` | — |
| `signatures` | `jsonb` | No | `'{}'::jsonb` | — |
| `created_at` | `timestamp with time zone` | No | — | — |
| `completed_at` | `timestamp with time zone` | Sí | — | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `demo_generator_runs_pkey`:** `generator_id`. Definición: `PRIMARY KEY (generator_id)`.

**Índices**

- `demo_generator_runs_pkey`: `CREATE UNIQUE INDEX demo_generator_runs_pkey ON public.demo_generator_runs USING btree (generator_id)`.

### `documentos_paciente`

**Finalidad:** Metadatos y asociaciones de documentos clínicos — *interpretación basada en documentosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('documentos_paciente_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `nombre_archivo` | `text` | No | — | — |
| `ruta_archivo` | `text` | No | — | — |
| `tipo_archivo` | `character varying(100)` | No | — | — |
| `descripcion` | `text` | Sí | — | — |
| `fecha_subida` | `timestamp with time zone` | No | `now()` | — |
| `historia_clinica_id` | `integer` | Sí | — | — |
| `subido_por_usuario_id` | `integer` | Sí | — | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `documentos_paciente_historia_clinica_fk`:** `historia_clinica_id` → `historias_clinicas`(`id`). Definición: `FOREIGN KEY (historia_clinica_id) REFERENCES historias_clinicas(id) ON DELETE SET NULL`.
- **FOREIGN KEY `documentos_paciente_historia_fkey`:** `historia_clinica_id` → `historias_clinicas`(`id`). Definición: `FOREIGN KEY (historia_clinica_id) REFERENCES historias_clinicas(id) ON DELETE SET NULL`.
- **FOREIGN KEY `documentos_paciente_paciente_id_fkey`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE`.
- **FOREIGN KEY `documentos_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `documentos_subido_por_usuario_fkey`:** `subido_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (subido_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `documentos_paciente_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `documentos_paciente_pkey`: `CREATE UNIQUE INDEX documentos_paciente_pkey ON public.documentos_paciente USING btree (id)`.
- `idx_documentos_historia`: `CREATE INDEX idx_documentos_historia ON public.documentos_paciente USING btree (historia_clinica_id)`.
- `idx_documentos_paciente_fecha`: `CREATE INDEX idx_documentos_paciente_fecha ON public.documentos_paciente USING btree (fecha_subida DESC)`.
- `idx_documentos_paciente_historia_clinica`: `CREATE INDEX idx_documentos_paciente_historia_clinica ON public.documentos_paciente USING btree (historia_clinica_id, fecha_subida DESC)`.
- `idx_documentos_paciente_paciente_id`: `CREATE INDEX idx_documentos_paciente_paciente_id ON public.documentos_paciente USING btree (paciente_id)`.

### `historias_clinicas`

**Finalidad:** Atenciones clínicas del paciente — *interpretación basada en historiasClinicasService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('historias_clinicas_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `turno_id` | `integer` | Sí | — | — |
| `descripcion` | `text` | No | — | — |
| `created_at` | `timestamp with time zone` | Sí | `now()` | — |
| `fecha_atencion` | `timestamp with time zone` | Sí | — | — |
| `profesional_id` | `integer` | Sí | — | — |
| `motivo_consulta` | `text` | Sí | — | — |
| `diagnostico` | `text` | Sí | — | — |
| `tratamientos_realizados` | `text` | Sí | — | — |
| `plan_indicaciones` | `text` | Sí | — | — |
| `observaciones` | `text` | Sí | — | — |
| `odontograma_snapshot` | `jsonb` | Sí | — | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |
| `creado_por_usuario_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `fk_historia_paciente`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `fk_historia_turno`:** `turno_id` → `turnos`(`id`). Definición: `FOREIGN KEY (turno_id) REFERENCES turnos(id) ON DELETE SET NULL`.
- **FOREIGN KEY `historias_clinicas_profesional_fkey`:** `profesional_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (profesional_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `historias_creado_por_usuario_fkey`:** `creado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `historias_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `historias_clinicas_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `historias_clinicas_pkey`: `CREATE UNIQUE INDEX historias_clinicas_pkey ON public.historias_clinicas USING btree (id)`.
- `idx_historia_paciente`: `CREATE INDEX idx_historia_paciente ON public.historias_clinicas USING btree (paciente_id)`.
- `idx_historias_paciente_fecha`: `CREATE INDEX idx_historias_paciente_fecha ON public.historias_clinicas USING btree (paciente_id, fecha_atencion DESC, id DESC)`.
- `idx_historias_profesional_perfil_fecha`: `CREATE INDEX idx_historias_profesional_perfil_fecha ON public.historias_clinicas USING btree (profesional_perfil_id, fecha_atencion DESC, id DESC)`.
- `uq_historias_clinicas_turno`: `CREATE UNIQUE INDEX uq_historias_clinicas_turno ON public.historias_clinicas USING btree (turno_id) WHERE (turno_id IS NOT NULL)` **(parcial)**.

### `historias_clinicas_revisiones`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('historias_clinicas_revisiones_id_seq'::regclass)` | — |
| `historia_clinica_id` | `integer` | No | — | — |
| `actor_id` | `integer` | No | — | — |
| `corregido_at` | `timestamp with time zone` | No | `now()` | — |
| `antes` | `jsonb` | No | — | — |
| `despues` | `jsonb` | No | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `historias_clinicas_revisiones_actor_id_fkey`:** `actor_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (actor_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `historias_clinicas_revisiones_historia_clinica_id_fkey`:** `historia_clinica_id` → `historias_clinicas`(`id`). Definición: `FOREIGN KEY (historia_clinica_id) REFERENCES historias_clinicas(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `historias_clinicas_revisiones_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `historias_clinicas_revisiones_pkey`: `CREATE UNIQUE INDEX historias_clinicas_revisiones_pkey ON public.historias_clinicas_revisiones USING btree (id)`.
- `idx_historia_revisiones`: `CREATE INDEX idx_historia_revisiones ON public.historias_clinicas_revisiones USING btree (historia_clinica_id, corregido_at DESC, id DESC)`.

### `identidad_roles_historial`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('identidad_roles_historial_id_seq'::regclass)` | — |
| `usuario_id` | `integer` | No | — | — |
| `rol_anterior_id` | `smallint` | Sí | — | — |
| `rol_nuevo_id` | `smallint` | No | — | — |
| `actor_usuario_id` | `integer` | No | — | — |
| `accion` | `character varying(50)` | No | — | — |
| `motivo` | `text` | No | — | — |
| `detalle` | `jsonb` | No | `'{}'::jsonb` | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `identidad_roles_historial_actor_usuario_id_fkey`:** `actor_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (actor_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `identidad_roles_historial_rol_anterior_id_fkey`:** `rol_anterior_id` → `roles`(`id`). Definición: `FOREIGN KEY (rol_anterior_id) REFERENCES roles(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `identidad_roles_historial_rol_nuevo_id_fkey`:** `rol_nuevo_id` → `roles`(`id`). Definición: `FOREIGN KEY (rol_nuevo_id) REFERENCES roles(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `identidad_roles_historial_usuario_id_fkey`:** `usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `identidad_roles_historial_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `identidad_roles_historial_pkey`: `CREATE UNIQUE INDEX identidad_roles_historial_pkey ON public.identidad_roles_historial USING btree (id)`.

### `odontograma`

**Finalidad:** Marcas por pieza/cara del odontograma actual — *interpretación basada en odontogramaService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('odontograma_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `diente` | `smallint` | No | — | — |
| `cara` | `character varying(20)` | No | — | — |
| `estado` | `character varying(50)` | No | — | — |
| `fecha` | `timestamp without time zone` | Sí | `CURRENT_TIMESTAMP` | — |
| `actualizado_por_usuario_id` | `integer` | Sí | — | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `odontograma_actualizado_por_usuario_fkey`:** `actualizado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (actualizado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `odontograma_paciente_id_fkey`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE`.
- **FOREIGN KEY `odontograma_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `odontograma_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `odontograma_paciente_id_diente_cara_key`:** `paciente_id, diente, cara`. Definición: `UNIQUE (paciente_id, diente, cara)`.

**Índices**

- `odontograma_paciente_id_diente_cara_key`: `CREATE UNIQUE INDEX odontograma_paciente_id_diente_cara_key ON public.odontograma USING btree (paciente_id, diente, cara)`.
- `odontograma_pkey`: `CREATE UNIQUE INDEX odontograma_pkey ON public.odontograma USING btree (id)`.

### `odontograma_meta`

**Finalidad:** Observaciones generales del odontograma actual — *interpretación basada en odontogramaService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('odontograma_meta_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `sarro` | `boolean` | No | `false` | — |
| `periodontal` | `boolean` | No | `false` | — |
| `updated_at` | `timestamp without time zone` | Sí | `CURRENT_TIMESTAMP` | — |
| `observaciones` | `text` | Sí | — | — |
| `actualizado_por_usuario_id` | `integer` | Sí | — | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `odontograma_meta_actualizado_por_usuario_fkey`:** `actualizado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (actualizado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `odontograma_meta_paciente_id_fkey`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE`.
- **FOREIGN KEY `odontograma_meta_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `odontograma_meta_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `odontograma_meta_paciente_id_key`:** `paciente_id`. Definición: `UNIQUE (paciente_id)`.

**Índices**

- `odontograma_meta_paciente_id_key`: `CREATE UNIQUE INDEX odontograma_meta_paciente_id_key ON public.odontograma_meta USING btree (paciente_id)`.
- `odontograma_meta_pkey`: `CREATE UNIQUE INDEX odontograma_meta_pkey ON public.odontograma_meta USING btree (id)`.

### `odontograma_referencias`

**Finalidad:** Catálogo configurable de referencias del odontograma — *interpretación basada en odontogramaService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('odontograma_referencias_id_seq'::regclass)` | — |
| `codigo` | `character varying(50)` | No | — | — |
| `nombre` | `character varying(100)` | No | — | — |
| `descripcion` | `text` | Sí | — | — |
| `color` | `character varying(7)` | No | — | — |
| `activa` | `boolean` | No | `true` | — |
| `heredada` | `boolean` | No | `false` | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |
| `alcance` | `character varying(10)` | No | `'cara'::character varying` | — |
| `activo` | `boolean` | No | `true` | — |

**Claves y restricciones físicas**

- **CHECK `odontograma_referencias_alcance_check`:** `alcance`. Definición: `CHECK (alcance::text = ANY (ARRAY['cara'::character varying::text, 'pieza'::character varying::text]))`.
- **CHECK `odontograma_referencias_codigo_formato`:** `codigo`. Definición: `CHECK (codigo::text ~ '^[a-z0-9_]+$'::text)`.
- **CHECK `odontograma_referencias_color_formato`:** `color`. Definición: `CHECK (color::text ~ '^#[0-9A-Fa-f]{6}$'::text)`.
- **PRIMARY KEY `odontograma_referencias_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `odontograma_referencias_codigo_key`:** `codigo`. Definición: `UNIQUE (codigo)`.

**Índices**

- `odontograma_referencias_codigo_key`: `CREATE UNIQUE INDEX odontograma_referencias_codigo_key ON public.odontograma_referencias USING btree (codigo)`.
- `odontograma_referencias_nombre_unique`: `CREATE UNIQUE INDEX odontograma_referencias_nombre_unique ON public.odontograma_referencias USING btree (lower((nombre)::text))`.
- `odontograma_referencias_pkey`: `CREATE UNIQUE INDEX odontograma_referencias_pkey ON public.odontograma_referencias USING btree (id)`.
- `uq_odontograma_referencias_nombre`: `CREATE UNIQUE INDEX uq_odontograma_referencias_nombre ON public.odontograma_referencias USING btree (lower((nombre)::text))`.

### `pacientes`

**Finalidad:** Datos administrativos y antecedentes clínicos históricos del paciente — *interpretación basada en pacientesService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('pacientes_id_seq'::regclass)` | — |
| `nombre` | `character varying(100)` | No | — | — |
| `apellido` | `character varying(100)` | No | — | — |
| `dni` | `character varying(20)` | No | — | — |
| `nacionalidad` | `character varying(50)` | Sí | — | — |
| `domicilio` | `character varying(255)` | Sí | — | — |
| `telefono` | `character varying(30)` | Sí | — | — |
| `email` | `character varying(150)` | Sí | — | — |
| `fecha_nacimiento` | `date` | Sí | — | — |
| `observaciones` | `text` | Sí | — | — |
| `created_at` | `timestamp with time zone` | Sí | `now()` | — |
| `updated_at` | `timestamp with time zone` | Sí | `now()` | — |
| `alergias` | `text` | Sí | — | — |
| `condiciones` | `text` | Sí | — | — |
| `estado_tratamiento` | `text` | Sí | — | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `pacientes_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `pacientes_dni_key`:** `dni`. Definición: `UNIQUE (dni)`.
- **UNIQUE `uq_pacientes_dni`:** `dni`. Definición: `UNIQUE (dni)`.

**Índices**

- `idx_pacientes_apellido_nombre`: `CREATE INDEX idx_pacientes_apellido_nombre ON public.pacientes USING btree (apellido, nombre)`.
- `idx_pacientes_apellido_trgm`: `CREATE INDEX idx_pacientes_apellido_trgm ON public.pacientes USING gin (apellido gin_trgm_ops)`.
- `idx_pacientes_created_at`: `CREATE INDEX idx_pacientes_created_at ON public.pacientes USING btree (created_at)`.
- `idx_pacientes_dni_unique`: `CREATE UNIQUE INDEX idx_pacientes_dni_unique ON public.pacientes USING btree (dni)`.
- `idx_pacientes_nombre_trgm`: `CREATE INDEX idx_pacientes_nombre_trgm ON public.pacientes USING gin (nombre gin_trgm_ops)`.
- `pacientes_dni_key`: `CREATE UNIQUE INDEX pacientes_dni_key ON public.pacientes USING btree (dni)`.
- `pacientes_pkey`: `CREATE UNIQUE INDEX pacientes_pkey ON public.pacientes USING btree (id)`.
- `uq_pacientes_dni`: `CREATE UNIQUE INDEX uq_pacientes_dni ON public.pacientes USING btree (dni)`.

### `pagos`

**Finalidad:** Pagos y anulaciones trazables — *interpretación basada en pagosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('pagos_id_seq'::regclass)` | — |
| `cargo_id` | `integer` | No | — | — |
| `importe` | `numeric(12,2)` | No | — | — |
| `metodo_pago` | `character varying(30)` | No | — | — |
| `fecha_pago` | `date` | No | `CURRENT_DATE` | — |
| `observaciones` | `text` | Sí | — | — |
| `estado` | `character varying(10)` | No | `'activo'::character varying` | — |
| `fecha_anulacion` | `timestamp with time zone` | Sí | — | — |
| `motivo_anulacion` | `text` | Sí | — | — |
| `anulado_por_usuario_id` | `integer` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **CHECK `pagos_anulacion_coherente_check`:** `estado, fecha_anulacion, motivo_anulacion, anulado_por_usuario_id`. Definición: `CHECK (estado::text = 'activo'::text AND fecha_anulacion IS NULL AND motivo_anulacion IS NULL AND anulado_por_usuario_id IS NULL OR estado::text = 'anulado'::text AND fecha_anulacion IS NOT NULL AND motivo_anulacion IS NOT NULL AND btrim(motivo_anulacion) <> ''::text AND anulado_por_usuario_id IS NOT NULL)`.
- **CHECK `pagos_estado_check`:** `estado`. Definición: `CHECK (estado::text = ANY (ARRAY['activo'::character varying::text, 'anulado'::character varying::text]))`.
- **CHECK `pagos_importe_positivo_check`:** `importe`. Definición: `CHECK (importe > 0::numeric)`.
- **CHECK `pagos_metodo_pago_check`:** `metodo_pago`. Definición: `CHECK (metodo_pago::text = ANY (ARRAY['efectivo'::character varying::text, 'tarjeta'::character varying::text, 'transferencia'::character varying::text]))`.
- **FOREIGN KEY `fk_pago_anulado_por_usuario`:** `anulado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (anulado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `fk_pago_cargo`:** `cargo_id` → `cargos`(`id`). Definición: `FOREIGN KEY (cargo_id) REFERENCES cargos(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `pagos_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `idx_pagos_cargo`: `CREATE INDEX idx_pagos_cargo ON public.pagos USING btree (cargo_id)`.
- `idx_pagos_cargo_activos`: `CREATE INDEX idx_pagos_cargo_activos ON public.pagos USING btree (cargo_id) WHERE ((estado)::text = 'activo'::text)` **(parcial)**.
- `idx_pagos_fecha_estado`: `CREATE INDEX idx_pagos_fecha_estado ON public.pagos USING btree (fecha_pago DESC, estado)`.
- `pagos_pkey`: `CREATE UNIQUE INDEX pagos_pkey ON public.pagos USING btree (id)`.

### `prestacion_arancel_referencias`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `prestacion_id` | `integer` | No | — | — |
| `referencia_id` | `bigint` | No | — | — |
| `vinculado_por_usuario_id` | `integer` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `prestacion_arancel_referencias_prestacion_id_fkey`:** `prestacion_id` → `prestaciones`(`id`). Definición: `FOREIGN KEY (prestacion_id) REFERENCES prestaciones(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `prestacion_arancel_referencias_referencia_id_fkey`:** `referencia_id` → `arancel_referencias`(`id`). Definición: `FOREIGN KEY (referencia_id) REFERENCES arancel_referencias(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `prestacion_arancel_referencias_vinculado_por_usuario_id_fkey`:** `vinculado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (vinculado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `prestacion_arancel_referencias_pkey`:** `prestacion_id, referencia_id`. Definición: `PRIMARY KEY (prestacion_id, referencia_id)`.
- **UNIQUE `prestacion_arancel_referencias_referencia_id_key`:** `referencia_id`. Definición: `UNIQUE (referencia_id)`.

**Índices**

- `prestacion_arancel_prestacion_idx`: `CREATE INDEX prestacion_arancel_prestacion_idx ON public.prestacion_arancel_referencias USING btree (prestacion_id)`.
- `prestacion_arancel_referencias_pkey`: `CREATE UNIQUE INDEX prestacion_arancel_referencias_pkey ON public.prestacion_arancel_referencias USING btree (prestacion_id, referencia_id)`.
- `prestacion_arancel_referencias_referencia_id_key`: `CREATE UNIQUE INDEX prestacion_arancel_referencias_referencia_id_key ON public.prestacion_arancel_referencias USING btree (referencia_id)`.

### `prestaciones`

**Finalidad:** Catálogo operativo de prestaciones — *interpretación basada en prestacionesService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('prestaciones_id_seq'::regclass)` | — |
| `nombre` | `character varying(100)` | No | — | — |
| `duracion_minutos` | `integer` | Sí | — | — |
| `precio_base` | `numeric(10,2)` | Sí | — | — |
| `activa` | `boolean` | Sí | `true` | — |
| `activo` | `boolean` | Sí | `true` | — |
| `updated_at` | `timestamp with time zone` | Sí | — | — |
| `codigo` | `text` | Sí | — | — |
| `categoria` | `text` | Sí | — | — |
| `precio_modalidad` | `character varying(20)` | Sí | — | — |
| `precio_inicial_referencia_id` | `bigint` | Sí | — | — |

**Claves y restricciones físicas**

- **CHECK `prestaciones_duracion_minutos_check`:** `duracion_minutos`. Definición: `CHECK (duracion_minutos > 0)`.
- **CHECK `prestaciones_precio_consistencia_check`:** `precio_modalidad, precio_base`. Definición: `CHECK (precio_modalidad IS NULL OR precio_modalidad::text = 'fijo'::text AND precio_base > 0::numeric OR (precio_modalidad::text = ANY (ARRAY['a_convenir'::character varying::text, 'sin_definir'::character varying::text])) AND precio_base IS NULL)`.
- **CHECK `prestaciones_precio_modalidad_check`:** `precio_modalidad`. Definición: `CHECK (precio_modalidad IS NULL OR (precio_modalidad::text = ANY (ARRAY['fijo'::character varying::text, 'a_convenir'::character varying::text, 'sin_definir'::character varying::text])))`.
- **FOREIGN KEY `prestaciones_precio_inicial_referencia_fk`:** `precio_inicial_referencia_id` → `arancel_referencias`(`id`). Definición: `FOREIGN KEY (precio_inicial_referencia_id) REFERENCES arancel_referencias(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `prestaciones_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `prestaciones_codigo_unico_idx`: `CREATE UNIQUE INDEX prestaciones_codigo_unico_idx ON public.prestaciones USING btree (lower(btrim(codigo))) WHERE ((codigo IS NOT NULL) AND (btrim(codigo) <> ''::text))` **(parcial)**.
- `prestaciones_duracion_pendiente_idx`: `CREATE INDEX prestaciones_duracion_pendiente_idx ON public.prestaciones USING btree (id) WHERE (duracion_minutos IS NULL)` **(parcial)**.
- `prestaciones_pkey`: `CREATE UNIQUE INDEX prestaciones_pkey ON public.prestaciones USING btree (id)`.

### `prestaciones_historial`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('prestaciones_historial_id_seq'::regclass)` | — |
| `prestacion_id` | `integer` | No | — | — |
| `usuario_id` | `integer` | Sí | — | — |
| `accion` | `character varying(30)` | No | — | — |
| `valores_anteriores` | `jsonb` | Sí | — | — |
| `valores_nuevos` | `jsonb` | No | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `prestaciones_historial_prestacion_id_fkey`:** `prestacion_id` → `prestaciones`(`id`). Definición: `FOREIGN KEY (prestacion_id) REFERENCES prestaciones(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `prestaciones_historial_usuario_id_fkey`:** `usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `prestaciones_historial_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `prestaciones_historial_pkey`: `CREATE UNIQUE INDEX prestaciones_historial_pkey ON public.prestaciones_historial USING btree (id)`.
- `prestaciones_historial_prestacion_fecha_idx`: `CREATE INDEX prestaciones_historial_prestacion_fecha_idx ON public.prestaciones_historial USING btree (prestacion_id, created_at DESC)`.

### `profesionales`

**Finalidad:** Perfil profesional separado de la cuenta de usuario — *interpretación basada en identityService, profesionalesService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | — | — |
| `usuario_id` | `integer` | Sí | — | Cuenta habilitada para operar como este profesional; puede ser NULL para identidades hist?ricas. |
| `usuario_legacy_id` | `integer` | Sí | — | Referencia t?cnica al usuario que ocupaba profesional_id antes de separar cuenta y perfil. |
| `nombre_mostrado` | `character varying(150)` | No | — | — |
| `activo` | `boolean` | No | `false` | — |
| `es_ficticio` | `boolean` | No | `false` | — |
| `compatibilidad_pendiente` | `boolean` | No | `false` | Identidad hist?rica preservada sin atribuci?n profesional verificada. |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |
| `vinculo_confirmado_at` | `timestamp with time zone` | Sí | — | — |
| `vinculo_confirmado_por_usuario_id` | `integer` | Sí | — | — |
| `vinculo_origen` | `character varying(40)` | Sí | — | — |

**Claves y restricciones físicas**

- **CHECK `profesionales_nombre_no_vacio`:** `nombre_mostrado`. Definición: `CHECK (btrim(nombre_mostrado::text) <> ''::text)`.
- **CHECK `profesionales_vinculo_confirmacion_coherente`:** `vinculo_confirmado_at, vinculo_confirmado_por_usuario_id, vinculo_origen`. Definición: `CHECK (vinculo_confirmado_at IS NULL AND vinculo_confirmado_por_usuario_id IS NULL AND vinculo_origen IS NULL OR vinculo_confirmado_at IS NOT NULL AND vinculo_confirmado_por_usuario_id IS NOT NULL AND vinculo_origen IS NOT NULL AND btrim(vinculo_origen::text) <> ''::text)`.
- **FOREIGN KEY `profesionales_usuario_id_fkey`:** `usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `profesionales_usuario_legacy_id_fkey`:** `usuario_legacy_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (usuario_legacy_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `profesionales_vinculo_confirmado_por_fk`:** `vinculo_confirmado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (vinculo_confirmado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `profesionales_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `profesionales_usuario_id_key`:** `usuario_id`. Definición: `UNIQUE (usuario_id)`.
- **UNIQUE `profesionales_usuario_legacy_id_key`:** `usuario_legacy_id`. Definición: `UNIQUE (usuario_legacy_id)`.

**Índices**

- `profesionales_pkey`: `CREATE UNIQUE INDEX profesionales_pkey ON public.profesionales USING btree (id)`.
- `profesionales_usuario_id_key`: `CREATE UNIQUE INDEX profesionales_usuario_id_key ON public.profesionales USING btree (usuario_id)`.
- `profesionales_usuario_legacy_id_key`: `CREATE UNIQUE INDEX profesionales_usuario_legacy_id_key ON public.profesionales USING btree (usuario_legacy_id)`.

### `profesionales_horarios_atencion`

**Finalidad:** Horario por perfil profesional — *interpretación basada en configuracionService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('profesionales_horarios_atencion_id_seq'::regclass)` | — |
| `profesional_id` | `integer` | No | — | — |
| `dia_semana` | `integer` | No | — | — |
| `activo` | `boolean` | No | `false` | — |
| `hora_desde` | `time without time zone` | Sí | — | — |
| `hora_hasta` | `time without time zone` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `horarios_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `profesionales_horarios_atencion_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `profesionales_horarios_atencion_profesional_id_dia_semana_key`:** `profesional_id, dia_semana`. Definición: `UNIQUE (profesional_id, dia_semana)`.

**Índices**

- `idx_horarios_profesional_perfil`: `CREATE INDEX idx_horarios_profesional_perfil ON public.profesionales_horarios_atencion USING btree (profesional_perfil_id, dia_semana)`.
- `profesionales_horarios_atencion_pkey`: `CREATE UNIQUE INDEX profesionales_horarios_atencion_pkey ON public.profesionales_horarios_atencion USING btree (id)`.
- `profesionales_horarios_atencion_profesional_id_dia_semana_key`: `CREATE UNIQUE INDEX profesionales_horarios_atencion_profesional_id_dia_semana_key ON public.profesionales_horarios_atencion USING btree (profesional_id, dia_semana)`.
- `profesionales_horarios_perfil_dia_unique`: `CREATE UNIQUE INDEX profesionales_horarios_perfil_dia_unique ON public.profesionales_horarios_atencion USING btree (profesional_perfil_id, dia_semana) WHERE (profesional_perfil_id IS NOT NULL)` **(parcial)**.

### `protesis_fijas`

**Finalidad:** Prótesis fijas estructuradas — *interpretación basada en protesisFijasService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('protesis_fijas_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `tipo` | `character varying(50)` | No | — | — |
| `dientes` | `smallint[]` | No | — | — |
| `descripcion` | `text` | Sí | — | — |
| `fecha` | `timestamp with time zone` | No | `now()` | — |
| `registrado_por_usuario_id` | `integer` | Sí | — | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `protesis_fijas_paciente_id_fkey`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE`.
- **FOREIGN KEY `protesis_fijas_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `protesis_fijas_registrado_por_usuario_fkey`:** `registrado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (registrado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `protesis_fijas_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `protesis_fijas_pkey`: `CREATE UNIQUE INDEX protesis_fijas_pkey ON public.protesis_fijas USING btree (id)`.

### `protesis_removibles`

**Finalidad:** Prótesis removibles estructuradas — *interpretación basada en protesisRemoviblesService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('protesis_removibles_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `tipo` | `character varying(50)` | No | — | — |
| `arcada` | `character varying(20)` | No | — | — |
| `descripcion` | `text` | Sí | — | — |
| `fecha` | `timestamp with time zone` | No | `now()` | — |
| `registrado_por_usuario_id` | `integer` | Sí | — | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `protesis_removibles_paciente_id_fkey`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE`.
- **FOREIGN KEY `protesis_removibles_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `protesis_removibles_registrado_por_usuario_fkey`:** `registrado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (registrado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `protesis_removibles_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `protesis_removibles_pkey`: `CREATE UNIQUE INDEX protesis_removibles_pkey ON public.protesis_removibles USING btree (id)`.

### `roles`

**Finalidad:** Catálogo de roles canónicos — *interpretación basada en identityService, usuariosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `smallint` | No | `nextval('roles_id_seq'::regclass)` | — |
| `codigo` | `character varying(30)` | No | — | — |
| `nombre` | `character varying(60)` | No | — | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `roles_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `roles_codigo_key`:** `codigo`. Definición: `UNIQUE (codigo)`.

**Índices**

- `roles_codigo_key`: `CREATE UNIQUE INDEX roles_codigo_key ON public.roles USING btree (codigo)`.
- `roles_pkey`: `CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id)`.

### `tratamientos`

**Finalidad:** Tratamientos clínicos registrados — *interpretación basada en tratamientosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('tratamientos_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `diente` | `smallint` | No | — | — |
| `tipo` | `character varying(50)` | No | — | — |
| `observaciones` | `text` | Sí | — | — |
| `fecha` | `timestamp with time zone` | No | `now()` | — |
| `registrado_por_usuario_id` | `integer` | Sí | — | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `tratamientos_paciente_id_fkey`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE`.
- **FOREIGN KEY `tratamientos_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `tratamientos_registrado_por_usuario_fkey`:** `registrado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (registrado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `tratamientos_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `idx_tratamientos_paciente_fecha`: `CREATE INDEX idx_tratamientos_paciente_fecha ON public.tratamientos USING btree (paciente_id, fecha DESC)`.
- `tratamientos_pkey`: `CREATE UNIQUE INDEX tratamientos_pkey ON public.tratamientos USING btree (id)`.

### `turno_prestaciones`

**Finalidad:** Prestaciones múltiples y snapshots asociados a cada turno — *interpretación basada en turnosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('turno_prestaciones_id_seq'::regclass)` | — |
| `turno_id` | `integer` | No | — | — |
| `prestacion_id` | `integer` | No | — | — |
| `orden` | `integer` | No | — | — |
| `nombre_snapshot` | `character varying(100)` | No | — | — |
| `duracion_minutos_snapshot` | `integer` | No | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **CHECK `turno_prestaciones_duracion_minutos_snapshot_check`:** `duracion_minutos_snapshot`. Definición: `CHECK (duracion_minutos_snapshot > 0)`.
- **CHECK `turno_prestaciones_orden_check`:** `orden`. Definición: `CHECK (orden > 0)`.
- **FOREIGN KEY `turno_prestaciones_prestacion_id_fkey`:** `prestacion_id` → `prestaciones`(`id`). Definición: `FOREIGN KEY (prestacion_id) REFERENCES prestaciones(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `turno_prestaciones_turno_id_fkey`:** `turno_id` → `turnos`(`id`). Definición: `FOREIGN KEY (turno_id) REFERENCES turnos(id) ON DELETE CASCADE`.
- **PRIMARY KEY `turno_prestaciones_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **UNIQUE `turno_prestaciones_turno_id_orden_key`:** `turno_id, orden`. Definición: `UNIQUE (turno_id, orden)`.
- **UNIQUE `turno_prestaciones_turno_id_prestacion_id_key`:** `turno_id, prestacion_id`. Definición: `UNIQUE (turno_id, prestacion_id)`.

**Índices**

- `idx_turno_prestaciones_prestacion`: `CREATE INDEX idx_turno_prestaciones_prestacion ON public.turno_prestaciones USING btree (prestacion_id)`.
- `turno_prestaciones_pkey`: `CREATE UNIQUE INDEX turno_prestaciones_pkey ON public.turno_prestaciones USING btree (id)`.
- `turno_prestaciones_turno_id_orden_key`: `CREATE UNIQUE INDEX turno_prestaciones_turno_id_orden_key ON public.turno_prestaciones USING btree (turno_id, orden)`.
- `turno_prestaciones_turno_id_prestacion_id_key`: `CREATE UNIQUE INDEX turno_prestaciones_turno_id_prestacion_id_key ON public.turno_prestaciones USING btree (turno_id, prestacion_id)`.

### `turno_solicitudes`

**Finalidad:** Solicitudes de alta, cancelación o reprogramación — *interpretación basada en turnoSolicitudesService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('turno_solicitudes_id_seq'::regclass)` | — |
| `tipo_solicitud` | `character varying(40)` | No | — | — |
| `estado` | `character varying(30)` | No | `'pendiente'::character varying` | — |
| `paciente_id` | `integer` | Sí | — | — |
| `nombre_apellido` | `text` | Sí | — | — |
| `dni` | `character varying(20)` | No | — | — |
| `telefono` | `character varying(30)` | No | — | — |
| `motivo` | `text` | Sí | — | — |
| `preferencia_horaria` | `text` | Sí | — | — |
| `turno_id` | `integer` | Sí | — | — |
| `observaciones` | `text` | Sí | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `turno_solicitudes_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `idx_turno_solicitudes_estado`: `CREATE INDEX idx_turno_solicitudes_estado ON public.turno_solicitudes USING btree (estado)`.
- `idx_turno_solicitudes_paciente`: `CREATE INDEX idx_turno_solicitudes_paciente ON public.turno_solicitudes USING btree (paciente_id)`.
- `idx_turno_solicitudes_turno`: `CREATE INDEX idx_turno_solicitudes_turno ON public.turno_solicitudes USING btree (turno_id)`.
- `turno_solicitudes_pkey`: `CREATE UNIQUE INDEX turno_solicitudes_pkey ON public.turno_solicitudes USING btree (id)`.

### `turnos`

**Finalidad:** Agenda y solicitudes de turnos — *interpretación basada en turnosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('turnos_id_seq'::regclass)` | — |
| `paciente_id` | `integer` | No | — | — |
| `prestacion_id` | `integer` | Sí | — | Compatibilidad: debe coincidir con prestacion_id de turno_prestaciones donde orden=1. |
| `fecha_hora_inicio` | `timestamp with time zone` | Sí | — | — |
| `fecha_hora_fin` | `timestamp with time zone` | Sí | — | — |
| `estado` | `character varying(30)` | No | `'programado'::character varying` | — |
| `origen` | `character varying(30)` | No | `'interno'::character varying` | — |
| `observaciones` | `text` | Sí | — | — |
| `created_at` | `timestamp with time zone` | Sí | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |
| `fecha_cancelacion` | `timestamp with time zone` | Sí | — | — |
| `recordatorio_procesado_at` | `timestamp with time zone` | Sí | — | — |
| `recordatorio_enviado_at` | `timestamp with time zone` | Sí | — | — |
| `recordatorio_estado` | `text` | Sí | — | — |
| `recordatorio_error` | `text` | Sí | — | — |
| `respuesta_paciente` | `text` | Sí | — | — |
| `respuesta_paciente_at` | `timestamp with time zone` | Sí | — | — |
| `reprogramacion_token` | `text` | Sí | — | — |
| `reprogramacion_token_expira_at` | `timestamp with time zone` | Sí | — | — |
| `profesional_id` | `integer` | Sí | — | — |
| `solicitud_preferencia` | `text` | Sí | — | — |
| `solicitud_confirmada_at` | `timestamp with time zone` | Sí | — | — |
| `solicitud_rechazada_at` | `timestamp with time zone` | Sí | — | — |
| `recordatorio_habilitado` | `boolean` | No | `true` | — |
| `profesional_perfil_id` | `integer` | Sí | — | — |
| `creado_por_usuario_id` | `integer` | Sí | — | — |
| `actualizado_por_usuario_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **CHECK `chk_fechas_turno`:** `fecha_hora_fin, fecha_hora_inicio`. Definición: `CHECK (fecha_hora_fin > fecha_hora_inicio)`.
- **FOREIGN KEY `fk_turno_paciente`:** `paciente_id` → `pacientes`(`id`). Definición: `FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `fk_turno_prestacion`:** `prestacion_id` → `prestaciones`(`id`). Definición: `FOREIGN KEY (prestacion_id) REFERENCES prestaciones(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `turnos_actualizado_por_usuario_fkey`:** `actualizado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (actualizado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `turnos_creado_por_usuario_fkey`:** `creado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `turnos_profesional_perfil_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `turnos_profesional_perfil_id_fkey`:** `profesional_perfil_id` → `profesionales`(`id`). Definición: `FOREIGN KEY (profesional_perfil_id) REFERENCES profesionales(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `turnos_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `idx_turnos_estado`: `CREATE INDEX idx_turnos_estado ON public.turnos USING btree (estado)`.
- `idx_turnos_fecha_inicio`: `CREATE INDEX idx_turnos_fecha_inicio ON public.turnos USING btree (fecha_hora_inicio)`.
- `idx_turnos_paciente`: `CREATE INDEX idx_turnos_paciente ON public.turnos USING btree (paciente_id)`.
- `idx_turnos_paciente_id`: `CREATE INDEX idx_turnos_paciente_id ON public.turnos USING btree (paciente_id)`.
- `idx_turnos_perfil_intervalo_activo`: `CREATE INDEX idx_turnos_perfil_intervalo_activo ON public.turnos USING btree (profesional_perfil_id, fecha_hora_inicio, fecha_hora_fin) WHERE ((estado)::text = ANY (ARRAY[('programado'::character varying)::text, ('reprogramado'::character varying)::text, ('confirmado'::character varying)::text]))` **(parcial)**.
- `idx_turnos_profesional_inicio`: `CREATE INDEX idx_turnos_profesional_inicio ON public.turnos USING btree (profesional_id, fecha_hora_inicio)`.
- `idx_turnos_profesional_perfil_inicio`: `CREATE INDEX idx_turnos_profesional_perfil_inicio ON public.turnos USING btree (profesional_perfil_id, fecha_hora_inicio)`.
- `turnos_pkey`: `CREATE UNIQUE INDEX turnos_pkey ON public.turnos USING btree (id)`.

### `usuarios`

**Finalidad:** Identidad y acceso de cuentas — *interpretación basada en authService, usuariosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('usuarios_id_seq'::regclass)` | — |
| `nombre` | `character varying(100)` | No | — | — |
| `email` | `character varying(150)` | No | — | — |
| `password_hash` | `text` | No | — | — |
| `activo` | `boolean` | Sí | `true` | — |
| `created_at` | `timestamp with time zone` | Sí | `now()` | — |
| `puede_cobrar` | `boolean` | No | `false` | — |
| `debe_cambiar_password` | `boolean` | No | `false` | — |
| `es_demo` | `boolean` | No | `false` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |
| `token_version` | `integer` | No | `0` | — |
| `password_changed_at` | `timestamp with time zone` | Sí | — | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `usuarios_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.
- **t `trg_usuarios_administrador_activo`:** `—`. Definición: `TRIGGER DEFERRABLE INITIALLY DEFERRED`.
- **UNIQUE `usuarios_email_key`:** `email`. Definición: `UNIQUE (email)`.

**Índices**

- `usuarios_email_key`: `CREATE UNIQUE INDEX usuarios_email_key ON public.usuarios USING btree (email)`.
- `usuarios_pkey`: `CREATE UNIQUE INDEX usuarios_pkey ON public.usuarios USING btree (id)`.

### `usuarios_roles`

**Finalidad:** *Sin comentario de catálogo ni servicio unívoco; finalidad pendiente de confirmación.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `usuario_id` | `integer` | No | — | — |
| `rol_id` | `smallint` | No | — | — |
| `asignado_at` | `timestamp with time zone` | No | `now()` | — |
| `asignado_por_usuario_id` | `integer` | Sí | — | — |

**Claves y restricciones físicas**

- **FOREIGN KEY `usuarios_roles_asignado_por_usuario_id_fkey`:** `asignado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (asignado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `usuarios_roles_rol_id_fkey`:** `rol_id` → `roles`(`id`). Definición: `FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `usuarios_roles_usuario_id_fkey`:** `usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `usuarios_roles_pkey`:** `usuario_id, rol_id`. Definición: `PRIMARY KEY (usuario_id, rol_id)`.
- **t `trg_usuarios_roles_administrador_activo`:** `—`. Definición: `TRIGGER DEFERRABLE INITIALLY DEFERRED`.

**Índices**

- `usuarios_roles_pkey`: `CREATE UNIQUE INDEX usuarios_roles_pkey ON public.usuarios_roles USING btree (usuario_id, rol_id)`.

### `usuarios_roles_vigentes`

**Finalidad:** Asignaciones vigentes de roles por cuenta — *interpretación basada en identityService, usuariosService; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `usuario_id` | `integer` | No | — | — |
| `rol_id` | `smallint` | No | — | — |
| `asignado_at` | `timestamp with time zone` | No | `now()` | — |
| `asignado_por_usuario_id` | `integer` | No | — | — |
| `motivo` | `text` | No | — | — |

**Claves y restricciones físicas**

- **CHECK `usuarios_roles_vigentes_motivo_check`:** `motivo`. Definición: `CHECK (btrim(motivo) <> ''::text)`.
- **FOREIGN KEY `usuarios_roles_vigentes_asignado_por_usuario_id_fkey`:** `asignado_por_usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (asignado_por_usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `usuarios_roles_vigentes_rol_id_fkey`:** `rol_id` → `roles`(`id`). Definición: `FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE RESTRICT`.
- **FOREIGN KEY `usuarios_roles_vigentes_usuario_id_fkey`:** `usuario_id` → `usuarios`(`id`). Definición: `FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT`.
- **PRIMARY KEY `usuarios_roles_vigentes_pkey`:** `usuario_id`. Definición: `PRIMARY KEY (usuario_id)`.

**Índices**

- `usuarios_roles_vigentes_pkey`: `CREATE UNIQUE INDEX usuarios_roles_vigentes_pkey ON public.usuarios_roles_vigentes USING btree (usuario_id)`.

### `whatsapp_conversations`

**Finalidad:** Estado operativo de conversaciones del bot — *interpretación basada en whatsappAutogestion.service; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `bigint` | No | `nextval('whatsapp_conversations_id_seq'::regclass)` | — |
| `phone` | `character varying(30)` | No | — | — |
| `status` | `character varying(30)` | No | `'active'::character varying` | — |
| `step` | `character varying(80)` | No | — | — |
| `paciente_id` | `integer` | Sí | — | — |
| `prestacion_id` | `integer` | Sí | — | — |
| `profesional_id` | `integer` | Sí | — | — |
| `turno_id` | `integer` | Sí | — | — |
| `data` | `jsonb` | No | `'{}'::jsonb` | — |
| `expires_at` | `timestamp with time zone` | No | — | — |
| `created_at` | `timestamp with time zone` | No | `now()` | — |
| `updated_at` | `timestamp with time zone` | No | `now()` | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `whatsapp_conversations_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `idx_whatsapp_conversations_expires`: `CREATE INDEX idx_whatsapp_conversations_expires ON public.whatsapp_conversations USING btree (expires_at)`.
- `idx_whatsapp_conversations_phone_status`: `CREATE INDEX idx_whatsapp_conversations_phone_status ON public.whatsapp_conversations USING btree (phone, status)`.
- `whatsapp_conversations_pkey`: `CREATE UNIQUE INDEX whatsapp_conversations_pkey ON public.whatsapp_conversations USING btree (id)`.

### `whatsapp_reminders`

**Finalidad:** Registro operativo de recordatorios — *interpretación basada en whatsappReminder.service; confirmar con el responsable funcional.*

| Columna | Tipo completo | Nulo | Predeterminado | Comentario |
|---|---|---:|---|---|
| `id` | `integer` | No | `nextval('whatsapp_reminders_id_seq'::regclass)` | — |
| `appointment_id` | `integer` | No | — | — |
| `patient_id` | `integer` | Sí | — | — |
| `phone` | `character varying(30)` | No | — | — |
| `status` | `character varying(50)` | No | `'pending_response'::character varying` | — |
| `sent_at` | `timestamp without time zone` | Sí | `CURRENT_TIMESTAMP` | — |
| `responded_at` | `timestamp without time zone` | Sí | — | — |
| `response_text` | `text` | Sí | — | — |
| `channel` | `character varying(30)` | No | `'whatsapp'::character varying` | — |
| `created_at` | `timestamp without time zone` | Sí | `CURRENT_TIMESTAMP` | — |

**Claves y restricciones físicas**

- **PRIMARY KEY `whatsapp_reminders_pkey`:** `id`. Definición: `PRIMARY KEY (id)`.

**Índices**

- `whatsapp_reminders_pkey`: `CREATE UNIQUE INDEX whatsapp_reminders_pkey ON public.whatsapp_reminders USING btree (id)`.

## Relaciones lógicas sin FK física

Estas relaciones se deducen por uso de la columna en el código. PostgreSQL no garantiza su destino ni su existencia.

| Columna | Evidencia de código | Interpretación |
|---|---|---|
| `auditoria.usuario_id` | `auditoriaService.js` | Referencia lógica a `usuarios.id`; la auditoría admite eventos sin usuario y PostgreSQL no impone la FK. |
| `auditoria.recurso_id` | `auditoriaService.js` | Identificador polimórfico cuyo destino depende de `recurso`; no existe una única tabla referenciada. |
| `profesionales_horarios_atencion.profesional_id` | `turnosService.js`, `usuariosService.js` | Referencia lógica a `profesionales.id`; el servicio consulta horarios por perfil, pero falta FK física. |
| `turno_solicitudes.paciente_id` | `turnoSolicitudesService.js` | Referencia lógica a `pacientes.id`; confirmar la política esperada ante borrado. |
| `turno_solicitudes.turno_id` | `turnoSolicitudesService.js` | Referencia lógica a `turnos.id`; el servicio resuelve solicitudes por turno, sin FK física. |
| `turnos.profesional_id` | `turnosService.js` | Referencia histórica a `usuarios.id`; el código la distingue de `profesional_perfil_id` y no debe usarse como regla para altas nuevas. |
| `whatsapp_conversations.paciente_id` | `whatsappAutogestion.service.js` | Referencia lógica a `pacientes.id`, asignada al identificar o crear el paciente durante la conversación. |
| `whatsapp_conversations.prestacion_id` | `whatsappAutogestion.service.js` | Referencia lógica a `prestaciones.id`, asignada por la selección del bot. |
| `whatsapp_conversations.profesional_id` | `whatsappAutogestion.service.js`, `turnosService.js` | El flujo la utiliza como `profesionalPerfilId`; interpretación actual: referencia a `profesionales.id`. El nombre de columna es ambiguo y requiere confirmación. |
| `whatsapp_conversations.turno_id` | `whatsappAutogestion.service.js` | Referencia lógica a `turnos.id`, utilizada para solicitudes de cancelación o reprogramación. |
| `whatsapp_reminders.appointment_id` | `whatsappReminder.service.js` | Referencia lógica a `turnos.id`; los JOIN del servicio lo verifican operativamente, sin FK física. |
| `whatsapp_reminders.patient_id` | `whatsappReminder.service.js` | Referencia lógica a `pacientes.id`; se almacena junto con el turno y requiere confirmación de su necesidad como dato redundante. |

## Secuencias

| Nombre | Tipo | Inicio | Incremento | Mínimo | Máximo | Cicla |
|---|---|---:|---:|---:|---:|---:|
| `arancel_auditoria_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `arancel_referencias_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `arancel_versiones_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `archivos_clinicos_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `auditoria_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `cargos_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `configuracion_consultorio_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `configuracion_horarios_atencion_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `configuracion_mensajes_automaticos_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `declaraciones_salud_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `documentos_paciente_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `historias_clinicas_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `historias_clinicas_revisiones_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `identidad_roles_historial_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `odontograma_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `odontograma_meta_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `odontograma_referencias_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `pacientes_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `pagos_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `prestaciones_historial_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `prestaciones_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `profesionales_horarios_atencion_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `profesionales_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `protesis_fijas_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `protesis_removibles_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `roles_id_seq` | `smallint` | 1 | 1 | 1 | 32767 | No |
| `tratamientos_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `turno_prestaciones_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `turno_solicitudes_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `turnos_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `usuarios_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |
| `whatsapp_conversations_id_seq` | `bigint` | 1 | 1 | 1 | 9223372036854775807 | No |
| `whatsapp_reminders_id_seq` | `integer` | 1 | 1 | 1 | 2147483647 | No |

## Vistas

- No se verificaron vistas en `public`.
## Funciones

- `asegurar_administrador_activo()` → `trigger`. Definición completa disponible en el esquema SQL adjunto.
- `impedir_solapamiento_agenda()` → `trigger`. Definición completa disponible en el esquema SQL adjunto.
- `set_updated_at()` → `trigger`. Definición completa disponible en el esquema SQL adjunto.
- `trg_turnos_set_timestamps_and_cancellation()` → `trigger`. Definición completa disponible en el esquema SQL adjunto.

## Triggers

- `turnos.trg_set_timestamps_and_cancellation`: `CREATE TRIGGER trg_set_timestamps_and_cancellation BEFORE UPDATE ON turnos FOR EACH ROW EXECUTE FUNCTION trg_turnos_set_timestamps_and_cancellation()`.
- `turnos.trg_set_updated_at`: `CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON turnos FOR EACH ROW EXECUTE FUNCTION set_updated_at()`.
- `turnos.trg_turnos_impedir_solapamiento`: `CREATE TRIGGER trg_turnos_impedir_solapamiento BEFORE INSERT OR UPDATE OF profesional_perfil_id, fecha_hora_inicio, fecha_hora_fin, estado ON turnos FOR EACH ROW EXECUTE FUNCTION impedir_solapamiento_agenda()`.
- `usuarios.trg_usuarios_administrador_activo`: `CREATE CONSTRAINT TRIGGER trg_usuarios_administrador_activo AFTER DELETE OR UPDATE ON usuarios DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION asegurar_administrador_activo()`.
- `usuarios_roles.trg_usuarios_roles_administrador_activo`: `CREATE CONSTRAINT TRIGGER trg_usuarios_roles_administrador_activo AFTER INSERT OR DELETE OR UPDATE ON usuarios_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION asegurar_administrador_activo()`.

## Estructuras legacy o residuales

Nombres detectados: `profesionales.usuario_legacy_id`, `profesionales.compatibilidad_pendiente`, `turnos.reprogramacion_token`, `turnos.reprogramacion_token_expira_at`, `usuarios.token_version`.

Su presencia indica compatibilidad o seguridad histórica. No se presenta como regla vigente para nuevas relaciones; el significado exacto debe confirmarse antes de retirar o reutilizar.

## Diferencias respecto del diccionario de la tesis

> El diccionario incluido en la tesis no está disponible en el repositorio ni en la carpeta del proyecto. Esta comparación usa `database/schema_actual.sql` como **proxy técnico histórico** y debe validarse contra el documento real.

- Tablas presentes en la base demo y ausentes del baseline histórico: `arancel_auditoria`, `arancel_referencias`, `arancel_versiones`, `declaraciones_salud`, `demo_generator_runs`, `historias_clinicas_revisiones`, `identidad_roles_historial`, `odontograma_referencias`, `prestacion_arancel_referencias`, `prestaciones_historial`, `profesionales`, `roles`, `turno_prestaciones`, `usuarios_roles`, `usuarios_roles_vigentes`.
- Tablas declaradas en el baseline y ausentes de la base demo: ninguna.
- La base actual agrega o formaliza identidad/roles, perfiles profesionales, prestaciones múltiples por turno, solicitudes y recordatorios WhatsApp, finanzas, auditoría, documentos por atención, declaraciones versionadas, referencias del odontograma y ledger de migraciones. Esta síntesis se apoya en nombres/objetos verificados; la redacción funcional final requiere contraste con la tesis.
- Las FK, CHECK, UNIQUE, índices parciales, funciones y triggers enumerados arriba son la autoridad física observada en `odonton_demo_2026`; las relaciones lógicas no deben confundirse con constraints.
