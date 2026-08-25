# Revisión de higiene y arquitectura de Odonton

Fecha: 2026-08-24

Alcance: inspección estática de `backend`, `frontend` y `database`. No se modificó código, no se ejecutaron migraciones, no se modificó PostgreSQL y no se borraron ni movieron archivos.

## Conclusión breve

La estructura principal es comprensible y responde mayormente al recorrido `frontend -> route -> controller -> service -> PostgreSQL`. No hace falta crear una capa `models`: `backend/src/models` está vacío y el proyecto real accede a PostgreSQL desde servicios.

La limpieza segura inmediata se limita a artefactos vacíos u obsoletos explícitos. Los scripts de prueba recientes deben conservarse. Dos vistas frontend (`estadisticasView.js` y `reportesView.js`) no están importadas actualmente, pero no son legacy confirmado: sus pantallas y endpoints continúan presentes, por lo que primero hay que decidir si se conectan al arranque o se retiran funcionalmente.

## CARPETAS PRINCIPALES

```text
backend/
├── .env                         # configuración local privada; ignorada por Git
├── .env.example                 # plantilla de configuración
├── package.json
├── test-db.js                   # comprobación administrativa de PostgreSQL
├── scripts/
│   ├── probar-webhook-whatsapp.ps1
│   └── test-*.js                # pruebas aisladas de Turnos y WhatsApp
├── src/
│   ├── app.js                   # configura Express, rutas e inicialización
│   ├── server.js                # entrypoint del backend
│   ├── config/                  # pool PostgreSQL y referencia de entorno
│   ├── controllers/             # traduce requests/responses HTTP
│   ├── domain/                  # reglas puras de Turnos/recordatorios
│   ├── jobs/                    # scheduler periódico
│   ├── middleware/              # autenticación usada por authRoutes
│   ├── middlewares/             # validación, autorización y auditoría
│   ├── models/                  # vacío
│   ├── routes/                  # endpoints y cadena de middlewares
│   ├── services/                # negocio, SQL e integraciones
│   └── utils/                   # JWT, teléfonos y plantillas WhatsApp
└── uploads/documentos/.gitkeep  # destino runtime; documentos ignorados por Git

frontend/
├── .env.example
├── index.html                   # SPA y estructura de todas las pantallas
├── package.json
├── vite.config.js
├── public/                      # vacío
└── src/
    ├── api/                     # vacío; el cliente real está en src/js/api.js
    ├── assets/                  # logo
    ├── css/styles.css           # estilos base
    ├── styles/main.css          # estilos principales; importa styles.css
    ├── pages/dashboard.js       # indicadores del panel
    └── js/
        ├── api.js               # fetch, JWT y endpoints frontend
        ├── main.js              # autenticación e inicialización de vistas
        ├── components/          # alertas reutilizables
        ├── utils/               # helpers pequeños
        └── views/               # comportamiento de cada pantalla

database/
├── 2026-*.sql                   # migraciones históricas y vigentes
├── schema_actual.sql            # fotografía canónica del esquema actual
├── schema.sql                   # archivo vacío anterior
├── sanear_solicitudes_historicas.sql
├── DIAGNOSTICO_BD.md
├── REVISION_ODONTOGRAMA_DUPLICADO.md
└── REVISION_TOKENS_LEGACY.md
```

### RESPONSABILIDAD

| Ruta | Responsabilidad real |
|---|---|
| `backend/src/routes` | Declara endpoints y encadena autenticación, autorización, validación y auditoría. |
| `backend/src/controllers` | Lee parámetros/body, llama servicios y arma la respuesta HTTP; en Turnos también coordina notificaciones posteriores. |
| `backend/src/services` | Contiene lógica de negocio, SQL PostgreSQL, sesiones del bot y comunicación con WhatsApp. |
| `backend/src/domain` | Reglas puras y reutilizables, actualmente centradas en actividad de turnos y configuración booleana de recordatorios. |
| `backend/src/jobs` | Inicia tareas periódicas: cierre del ciclo de turnos vencidos y recordatorios automáticos. |
| `backend/src/middleware` | Contiene `authMiddleware.js`, usado por rutas de autenticación. |
| `backend/src/middlewares` | Contiene validadores, autorización del odontólogo y auditoría de requests del resto de módulos. |
| `backend/src/config` | Configura el pool PostgreSQL; `env.js` es solo una plantilla informativa no importada. |
| `backend/src/utils` | Helpers sin negocio principal: JWT, normalización telefónica y renderizado de plantillas. |
| `backend/scripts` | Pruebas manuales/aisladas de regresión. No forman parte del runtime. |
| `frontend/src/js/api.js` | Centraliza token, headers, errores HTTP y contratos con `/api`. |
| `frontend/src/js/main.js` | Controla login/restauración de sesión e inicializa las vistas activas. |
| `frontend/src/js/views` | Maneja formularios, estado y renderizado de cada módulo. |
| `frontend/src/pages` | Implementa el panel de indicadores. |
| `database` | Conserva esquema actual, migraciones y evidencia de saneamientos controlados. |

La coexistencia de `middleware` y `middlewares` es una inconsistencia de nombres, pero ambas carpetas tienen consumidores activos. No debe eliminarse ninguna sin mover antes sus imports, algo fuera de esta fase.

## CARPETAS VACÍAS

| Ruta | Vacía | Referenciada | Eliminar posteriormente | Motivo |
|---|---:|---:|---:|---|
| `backend/src/models` | SÍ | NO | SÍ | El proyecto no usa modelos ni ORM; los servicios consultan PostgreSQL directamente. No hace falta conservarla por convención. |
| `frontend/public` | SÍ | NO | SÍ | Vite no exige esta carpeta y los assets activos están en `frontend/src/assets`. |
| `frontend/src/api` | SÍ | NO | SÍ | El cliente real es `frontend/src/js/api.js`; no existe import hacia esta carpeta. |

No se cuentan las carpetas vacías internas de `.wwebjs_auth`: son datos generados por Chromium/WhatsApp, están ignoradas por Git y no son código fuente.

`backend/uploads/documentos` no se considera vacía porque contiene `.gitkeep`; representa el destino runtime intencional y debe conservarse.

## BACKEND/SCRIPTS

### SCRIPTS CONSERVAR — pruebas activas/importantes

| Archivo | Clasificación | Qué valida |
|---|---|---|
| `test-bot-patient-activity.js` | A. CONSERVAR | Reglas puras de turnos/solicitudes activas, identidad del paciente y estados permitidos por WhatsApp. |
| `test-recordatorio-por-turno.js` | A. CONSERVAR | Flag opcional por turno, compatibilidad de edición, confirmación y scheduler sin envío real. |
| `test-turno-solicitudes-transitions.js` | A. CONSERVAR | Ciclo transaccional de solicitudes, confirmación/cancelación/rechazo, cierre automático y rollback. |
| `test-whatsapp-message-rendering.js` | A. CONSERVAR | Plantillas configurables, placeholders válidos/inválidos y mensajes desactivados. |
| `test-whatsapp-patient-phone.js` | A. CONSERVAR | Resolución segura de teléfono/LID, persistencia de pacientes y contrato con autogestión. |
| `test-whatsapp-phone-normalization.js` | A. CONSERVAR | Normalización de teléfonos argentinos, chat IDs y rechazo de entradas inválidas. |
| `test-whatsapp-rejection-notification.js` | A. CONSERVAR | Notificación de rechazo después de persistir, fallos tolerados y plantillas inactivas. |
| `test-whatsapp-request-openings.js` | A. CONSERVAR | Apertura atómica de cancelación/reprogramación, `SELECT FOR UPDATE`, duplicados y rollback. |
| `test-whatsapp-session-start-hotfix.js` | A. CONSERVAR | Comandos exactos, gate por evento vivo, `fromMe`, polling solo lectura y simulación sin transporte real. |

Estas pruebas no se deben borrar por no ser runtime. Documentan reglas que costaron estabilización y son especialmente útiles para una defensa oral.

Observación: `backend/package.json` no ofrece un comando que ejecute esta batería; `npm test` solo ejecuta `test-db.js`. Hoy las nueve pruebas se lanzan manualmente con `node scripts/<archivo>`.

### SCRIPTS CONSERVAR — utilidad administrativa

| Archivo | Clasificación | Motivo |
|---|---|---|
| `backend/test-db.js` | B. CONSERVAR | Comprueba conexión, `SELECT NOW()`, catálogo de tablas y estado del pool. Es de solo lectura, salvo los efectos normales de abrir/cerrar conexiones. |

### SCRIPTS ARCHIVAR/DOCUMENTAR

No se encontró un script ejecutable en `backend/scripts` que necesite archivo histórico separado. Las pruebas permanecen activas; los saneamientos históricos están correctamente ubicados en `database`.

### SCRIPTS ELIMINABLES

| Archivo | Clasificación | Evidencia |
|---|---|---|
| `backend/scripts/probar-webhook-whatsapp.ps1` | D. ELIMINABLE | El propio archivo dice “quedó obsoleto”, solo imprime instrucciones, no prueba nada y no tiene consumidor ni entrada en `package.json`. Pertenece al webhook retirado. |

### SCRIPTS INCIERTOS

Ninguno dentro de `backend/scripts`.

## DATABASE

### Conservar

- `schema_actual.sql`: fotografía vigente y canónica del esquema; fue generado con `pg_dump --schema-only`.
- Todas las migraciones fechadas `2026-*.sql`: conservar incluso las que crean estructuras luego retiradas. Explican la evolución y permiten justificar el esquema durante la tesis.
- `2026-05-19_remove_google_calendar_turnos.sql`: evidencia explícita de que Google Calendar fue retirado.
- `2026-08-12_remove_legacy_autogestion_tokens.sql` y `2026-08-12_remove_legacy_odontograma.sql`: evidencian retiros controlados y no deben borrarse.
- `2026-08-16_add_recordatorio_habilitado_turnos.sql`: migración vigente del recordatorio opcional.
- `DIAGNOSTICO_BD.md`, `REVISION_ODONTOGRAMA_DUPLICADO.md` y `REVISION_TOKENS_LEGACY.md`: documentación de decisiones y verificaciones históricas.

### Archivar/documentar, no volver a ejecutar indiscriminadamente

- `sanear_solicitudes_historicas.sql`: one-off ejecutado de saneamiento de datos. Debe conservarse por trazabilidad, claramente tratado como histórico y nunca incorporado a un ejecutor automático de migraciones.
- Migraciones iniciales/superpuestas del odontograma (`2026-03-09_*` y `2026-03-10_odontograma_*`): están superadas por el estado actual, pero siguen siendo historia del esquema; no son basura ejecutable.

### Eliminable

- `database/schema.sql`: tiene 0 bytes, no representa la base y `DIAGNOSTICO_BD.md` ya documenta que fue reemplazado por `schema_actual.sql`. Riesgo de retiro: bajo.

### Backups

No se encontraron archivos `.backup`, `.bak`, `.dump`, `.tar`, `.gz` o `.zip` dentro del repositorio. Los backups completos con datos reales deben seguir fuera de Git.

## ARCHIVOS LEGACY COMPLETOS

### Confirmados

| Archivo | Evidencia de no uso | Recomendación futura |
|---|---|---|
| `backend/src/contro` | Archivo de 0 bytes; no tiene extensión, imports, rutas, tests ni contenido. | Eliminar. |
| `backend/scripts/probar-webhook-whatsapp.ps1` | Declara explícitamente que el webhook quedó obsoleto; no es invocado por código ni paquetes. | Eliminar. |
| `database/schema.sql` | Archivo de 0 bytes reemplazado por `schema_actual.sql`; el diagnóstico de BD confirma esa condición. | Eliminar conservando la referencia histórica en el diagnóstico. |

### Candidato de higiene, no legacy funcional confirmado

| Archivo | Estado | Recomendación futura |
|---|---|---|
| `backend/src/config/env.js` | No es importado por ningún archivo y duplica parcialmente `backend/.env.example`. Contiene valores ficticios y funciona como documentación dentro de `src`. | Revisar y probablemente retirar, dejando `.env.example` como única plantilla. No clasificarlo como funcionalidad legacy. |

### Archivos sin import actual que NO deben eliminarse todavía

| Archivo | Evidencia | Motivo para conservar/revisar |
|---|---|---|
| `frontend/src/js/views/estadisticasView.js` | Exporta `initEstadisticasView`, pero `main.js` no la importa. | `index.html` conserva la sección Estadísticas y el backend mantiene `/api/estadisticas`; parece una inicialización omitida, no funcionalidad retirada. |
| `frontend/src/js/views/reportesView.js` | Exporta `initReportesView`, pero `main.js` no la importa. | `index.html` conserva la sección Reportes y el backend mantiene `/api/reportes`; eliminarla rompería el intento de módulo existente. |

También se verificó que:

- `recordatoriosService.js` sigue importado por `turnosController.js`; no es un archivo legacy completo, aunque `procesarRespuestaPaciente` no tenga consumidor actual.
- `whatsappService.js` sigue importado por `turnosController.js` y cubierto por pruebas.
- `dashboard.js` está importado por `main.js`.
- `main.css` está enlazado desde `index.html` e importa los estilos base.
- rutas, controladores y servicios de prótesis continúan montados y tienen llamadas frontend.

## IMPORTS / REQUIRE

La verificación global encontró el siguiente patrón activo:

```text
app.js
└── routes/*
    ├── middlewares/*
    └── controllers/*
        └── services/*
            ├── config/db.js
            ├── domain/*
            └── utils/*
```

No se declaró eliminable ningún controlador, servicio o ruta con consumidor. Los únicos archivos completos confirmados como muertos son los tres indicados arriba.

El frontend tiene un entrypoint único, `index.html -> src/js/main.js`. Esta comprobación es la que reveló que Reportes y Estadísticas no están inicializados actualmente.

## ARQUITECTURA REAL

El flujo predominante sí es:

```text
Vista frontend
  -> función de frontend/src/js/api.js
  -> ruta Express
  -> autenticación/validación/auditoría
  -> controller
  -> service
  -> PostgreSQL o WhatsApp
  -> response JSON
  -> actualización de la vista
```

Responsabilidad oral de cada capa:

- **Vista:** captura la acción del usuario, mantiene el estado visual y presenta resultados/errores.
- **API frontend:** convierte la acción en una petición HTTP autenticada y normaliza errores.
- **Route:** define URL y método, y decide qué middlewares y controller intervienen.
- **Controller:** adapta HTTP al caso de uso y compone la respuesta.
- **Service:** aplica reglas, valida contra datos, ejecuta SQL y coordina operaciones atómicas.
- **Domain:** expresa reglas puras que no dependen de Express ni PostgreSQL.
- **PostgreSQL:** conserva pacientes, turnos, solicitudes, sesiones, recordatorios y auditoría.

Excepciones reales que conviene poder explicar:

- Algunos middlewares (`turnosMiddleware.js`) consultan PostgreSQL para autorización/auditoría.
- `turnosController.js` coordina notificaciones de WhatsApp después de que el service persiste el cambio.
- Algunos servicios ejecutan `CREATE/ALTER ... IF NOT EXISTS` al iniciar su uso. Es compatibilidad defensiva acumulada, no una capa `models`.
- `whatsappAutogestion.service.js` funciona como una máquina de estados persistida y por eso concentra más responsabilidad que un service CRUD común.

## FLUJO REGISTRAR TURNO

```text
frontend/index.html (#turno-form)
-> frontend/src/js/views/turnosView.js (submit de createForm)
-> frontend/src/js/api.js / createTurno(payload)
-> POST /api/turnos
-> backend/src/routes/turnosRoutes.js
-> middlewareAutenticacion + autorizarOdontologo + middlewareAuditoria
-> backend/src/controllers/turnosController.js / registrarTurno
-> backend/src/services/turnosService.js / crearTurno
-> PostgreSQL: pacientes, prestaciones, usuarios/horarios, turnos
-> 201 + turno detallado
-> recarga/renderizado de Turnos
```

El frontend pide disponibilidad y arma el payload. El backend vuelve a validar paciente, prestación, profesional, horario y superposición antes de insertar; la BD es la fuente definitiva.

## FLUJO PACIENTE

```text
frontend/index.html (#paciente-form)
-> frontend/src/js/views/pacientesView.js (submit de createForm)
-> frontend/src/js/api.js / createPaciente(payload)
-> POST /api/pacientes
-> backend/src/routes/pacientesRoutes.js
-> autenticación + autorización + auditoría + validarEntradaPaciente
-> backend/src/controllers/pacientesController.js / registrarPaciente
-> backend/src/services/pacientesService.js / crearPaciente
-> PostgreSQL: pacientes
-> 201 + paciente
-> actualización del listado
```

La vista recoge datos; middleware y service validan el contrato; el service controla duplicados por DNI y persiste.

## FLUJO WHATSAPP

```text
whatsapp-web.js: evento message
-> whatsappClient.service.js / handleIncomingMessage
-> filtros fromMe, origen directo, safe mode, dedup e intención/sesión
-> whatsappReminder.service.js / processPatientReply (si existe recordatorio pendiente)
   o whatsappAutogestion.service.js / processAutogestionMessage
-> whatsapp_conversations (estado de diálogo)
-> handler según step
-> turnoSolicitudesService.js
-> PostgreSQL: turno_solicitudes y, según el caso, turnos/pacientes
-> safeSend/sendWhatsAppMessage
```

Solo el evento vivo `message` puede abrir una sesión nueva. El bot no asigna automáticamente reprogramaciones: registra solicitudes pendientes para revisión del odontólogo.

## FLUJO RECORDATORIO

```text
backend/src/app.js / inicializar
-> jobs/reminderScheduler.js / startReminderScheduler
-> cada intervalo:
   1. turnoLifecycle.service.js / marcarTurnosVencidosComoRealizados
   2. whatsappReminder.service.js / processAutomaticReminders
-> findUpcomingAppointmentsForReminders
-> sendAppointmentReminder(..., { automatic: true })
-> configuracionService.js / renderizarMensajeAutomatico
-> whatsappClient.service.js / sendWhatsAppMessage
-> PostgreSQL: whatsapp_reminders + columnas recordatorio_* de turnos
```

El envío automático respeta la habilitación global, la habilitación individual del turno, la ventana máxima y los marcadores que evitan un segundo recordatorio. También existe ejecución manual mediante controller/ruta autenticada.

## ESTADO ACTUAL DE LOS COMENTARIOS

El criterio es irregular:

- Hay comentarios útiles que explican fallos deliberadamente tolerados, por ejemplo la resolución opcional de LID y los errores de Chromium ignorados en `whatsappClient.service.js`.
- En rutas y `config/db.js` existen comentarios que repiten lo evidente (“Listar turnos”, “Crear pool”, “Cerrar pool”). Aportan poco a la defensa.
- Las operaciones de mayor riesgo —transacciones, locks y orden persistencia/WhatsApp— casi no explican el motivo.
- `whatsappAutogestion.service.js`, con más de 2.000 líneas y una máquina de estados, necesita puntos de orientación, no comentarios línea por línea.
- Algunos comentarios ya quedaron históricos, como “Prótesis se integrará en odontograma” en `frontend/src/js/api.js`, mientras siguen existiendo llamadas y rutas separadas de prótesis. Debe revisarse antes de conservarlo como explicación.

No se recomienda una campaña masiva de comentarios. Conviene agregar pocos comentarios estables, centrados en decisiones y reglas.

## COMENTARIOS RECOMENDADOS

| Archivo | Función/zona | Motivo |
|---|---|---|
| `backend/src/services/turnoSolicitudesService.js` | `abrirSolicitudCambioTurno` | JSDoc breve: la solicitud y el cambio de estado del turno deben confirmarse o revertirse juntos. |
| `backend/src/services/turnoSolicitudesService.js` | `SELECT ... FOR UPDATE` | Explicar que bloquea el turno para impedir solicitudes duplicadas o cambios concurrentes durante la transacción. |
| `backend/src/services/turnosService.js` | `cancelarTurno`, `confirmarSolicitudTurno`, `rechazarSolicitudTurno` | Explicar que el turno y sus solicitudes pendientes se cierran dentro de la misma transacción. Un comentario por función es suficiente. |
| `backend/src/controllers/turnosController.js` | Bloques de notificación posteriores a editar/reprogramar/cancelar/confirmar/rechazar | Explicar que WhatsApp se intenta después de persistir y que su fallo se devuelve como advertencia, sin revertir el turno. |
| `backend/src/services/whatsappClient.service.js` | Inicio de `handleIncomingMessage` | Documentar la decisión de seguridad: solo un evento entrante real y ajeno puede alimentar el bot. |
| `backend/src/services/whatsappClient.service.js` | `pollRecentMessagesOnce` | Aclarar que el polling es diagnóstico y deliberadamente no procesa mensajes recuperados. |
| `backend/src/services/whatsappAutogestion.service.js` | `shouldStartAutogestion` | Explicar por qué las keywords deben coincidir exactamente: evitar activar el bot por frases incidentales. |
| `backend/src/services/whatsappAutogestion.service.js` | Gate `canStartSession` en `processAutogestionMessage` | Explicar que fuentes internas/debug pueden continuar una sesión existente, pero no abrir una nueva. |
| `backend/src/services/whatsappAutogestion.service.js` | `processAutogestionMessage` y mapa `handlers` | JSDoc breve: despacha una máquina de estados persistida en `whatsapp_conversations`. |
| `backend/src/services/whatsappReminder.service.js` | `sendAppointmentReminder` | Explicar la regla “una sola vez” y la combinación de flag individual, ventana y marcadores persistidos. |
| `backend/src/services/whatsappReminder.service.js` | Transacción de `processPatientReply` | Explicar que respuesta, recordatorio y solicitud/cambio de turno se persisten antes de contestar por WhatsApp. |
| `backend/src/services/whatsappService.js` | Envíos administrativos | Explicar que un fallo externo se transforma en advertencia porque la operación de negocio ya fue persistida. |
| `backend/src/controllers/documentosController.js` | Limpieza con `unlink` en `subirDocumento` | Explicar que elimina el archivo físico cuando la validación o persistencia falla para no dejar uploads huérfanos. |
| `backend/src/services/turnoLifecycle.service.js` | `marcarTurnosVencidosComoRealizados` | Explicar por qué también se cierran solicitudes pendientes al finalizar automáticamente un turno. |

Estilo recomendado para la fase futura:

- español;
- una línea, máximo dos frases;
- explicar el porqué o la garantía;
- JSDoc breve solo en operaciones centrales;
- no comentar imports, asignaciones, respuestas HTTP evidentes ni cada branch.

## RECOMENDACIÓN DE LIMPIEZA

Orden pequeño y controlado, sin reestructurar la arquitectura:

1. Eliminar, después de una confirmación final de diff, `backend/src/contro` y las tres carpetas fuente vacías.
2. Eliminar `backend/scripts/probar-webhook-whatsapp.ps1`, ya autodeclarado obsoleto.
3. Eliminar `database/schema.sql` vacío y conservar `schema_actual.sql` como única fotografía vigente.
4. Revisar `backend/src/config/env.js`; si `.env.example` cubre todo, retirar la plantilla duplicada de `src`.
5. Decidir explícitamente si `initReportesView` e `initEstadisticasView` deben conectarse en `main.js`; no borrar esas vistas antes de esa decisión/prueba manual.
6. Agregar en una fase posterior comandos `npm` para ejecutar la batería `scripts/test-*.js` de forma repetible, sin convertir `test-db.js` en una prueba unitaria.
7. Documentar en README qué pruebas son aisladas y cuáles requieren PostgreSQL o WhatsApp.
8. Marcar `sanear_solicitudes_historicas.sql` como ejecución histórica controlada; conservarlo fuera de cualquier ejecución automática.
9. En una fase específica, agregar únicamente los comentarios recomendados y retirar comentarios obvios u obsoletos.

No se recomienda crear `models`, incorporar ORM, mover masivamente SQL ni cambiar la arquitectura actual.

## CONFIRMACIONES

- CÓDIGO MODIFICADO: NO
- ARCHIVOS ELIMINADOS: NO
- ARCHIVOS MOVIDOS: NO
- BASE MODIFICADA: NO
- MIGRACIONES EJECUTADAS: NINGUNA
- COMMIT: NO

Archivo creado por esta auditoría: `REVISION_HIGIENE_Y_ARQUITECTURA.md`.
