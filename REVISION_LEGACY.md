# Revisión de código legacy y consumidores — Odonton

Fecha: 11/08/2026  
Alcance: trazabilidad estática de rutas, imports, llamadas, scripts, documentación y tablas.  
Contexto de BD: `database/schema_actual.sql` y `database/DIAGNOSTICO_BD.md`.

> Actualización 12/08/2026: las rutas y el servicio de autogestión por links/tokens fueron retirados del código. Las tablas `autogestion_tokens` y `tokens_autogestion`, ambas con 0 filas y sin consumidores ejecutables, fueron eliminadas mediante `database/2026-08-12_remove_legacy_autogestion_tokens.sql` después de validar un backup completo. Las descripciones posteriores reflejan el estado histórico al momento de esta auditoría.

No se modificó código ni base de datos. Que una ruta esté montada demuestra que es invocable, no que tenga tráfico real. Sin logs de acceso o telemetría, el uso por clientes externos no puede confirmarse completamente.

## 1. Autogestión antigua

### Conclusión

`backend/src/services/autogestionService.js` es **LEGACY PERO CONECTADA**:

- Sus 14 funciones exportadas son importadas por `pacientesController.js`.
- Los controladores están conectados a 13 endpoints bajo `/api/pacientes/autogestion/*`.
- Esos endpoints son públicos: usan `asignarActorSistema`, no JWT.
- El frontend Vite actual no llama a esos endpoints ni ofrece formularios públicos por token.
- `whatsappAutogestion.service.js` y `whatsappClient.service.js` no importan `autogestionService.js`.
- `backend/scripts/probar-autogestion-pacientes.ps1` llama a los endpoints antiguos y asigna/cancela/reprograma directamente.

Por tanto, no es el flujo WhatsApp vigente, pero sigue exponiendo una API funcional y un script externo la referencia.

### Trazabilidad de exports

| Export de `autogestionService.js` | Importador / llamador | Endpoint | Frontend | WhatsApp actual | Script externo | Estado sugerido |
|---|---|---|---|---|---|---|
| `generarTokenAutogestion` | `pacientesController.generarLinkSolicitudTurno` | POST `/api/pacientes/autogestion/solicitar-turno/link` | No encontrado | No | Sí | LEGACY PERO CONECTADA |
| `enviarLinkAutogestionPorWhatsapp` | `generarLinkSolicitudTurno` | mismo endpoint | No | Usa `whatsappService` indirectamente, pero el bot actual no lo llama | Sí | LEGACY PERO CONECTADA |
| `validarTokenAutogestion` | `validarTokenSolicitudTurno`, validadores de cancelar/reprogramar | GET de token para los tres flujos | No | No | Sí para solicitud | LEGACY PERO CONECTADA |
| `consultarDisponibilidadAutogestion` | `consultarDisponibilidadSolicitudTurno` | POST `/solicitar-turno/disponibilidad` | No | No | Sí | LEGACY PERO CONECTADA |
| `confirmarSolicitudTurnoAutogestion` | `confirmarSolicitudTurno` | POST `/solicitar-turno/confirmar` | No | No | Sí | LEGACY PERO CONECTADA |
| `generarTokenCancelacionAutogestion` | `generarLinkCancelacionTurno` | POST `/cancelar-turno/link` | No | No | Sí | LEGACY PERO CONECTADA |
| `enviarLinkCancelacionPorWhatsapp` | `generarLinkCancelacionTurno` | mismo endpoint | No | No | Sí | LEGACY PERO CONECTADA |
| `listarTurnosCancelablesAutogestion` | `listarTurnosCancelables` | POST `/cancelar-turno/listar` | No | No | Sí | LEGACY PERO CONECTADA |
| `cancelarTurnoPropioAutogestion` | `cancelarTurnoPropio` | POST `/cancelar-turno/confirmar` | No | No | Sí | LEGACY PERO CONECTADA |
| `generarTokenReprogramacionAutogestion` | `generarLinkReprogramacionTurno` | POST `/reprogramar-turno/link` | No | No | Sí | LEGACY PERO CONECTADA |
| `enviarLinkReprogramacionPorWhatsapp` | `generarLinkReprogramacionTurno` | mismo endpoint | No | No | Sí | LEGACY PERO CONECTADA |
| `listarTurnosReprogramablesAutogestion` | `listarTurnosReprogramables` | POST `/reprogramar-turno/listar` | No | No | Sí | LEGACY PERO CONECTADA |
| `consultarDisponibilidadReprogramacionAutogestion` | `consultarDisponibilidadReprogramacion` | POST `/reprogramar-turno/disponibilidad` | No | No | Sí | LEGACY PERO CONECTADA |
| `reprogramarTurnoPropioAutogestion` | `reprogramarTurnoPropio` | POST `/reprogramar-turno/confirmar` | No | No | Sí | LEGACY PERO CONECTADA |

### Operaciones contrarias a la regla final

| Operación | Evidencia | Contradicción |
|---|---|---|
| Paciente elige fecha/hora | `consultarDisponibilidadAutogestion` + `confirmarSolicitudTurnoAutogestion` | El odontólogo debería decidir el horario definitivo |
| Cancelación directa | `cancelarTurnoPropioAutogestion` actualiza el turno | Debería crear solicitud pendiente |
| Reprogramación directa | `reprogramarTurnoPropioAutogestion` recibe `fechaHoraInicioNueva` y actualiza | Debería crear solicitud pendiente sin asignar horario |
| Acceso público por token | 13 rutas sin JWT | Es una superficie pública todavía activa |

### Flujo WhatsApp actual

```text
Mensaje entrante
→ whatsappClient.service.js / handleIncomingMessage
→ whatsappReminder.service.js si existe recordatorio pendiente
→ whatsappAutogestion.service.js / processAutogestionMessage
→ turnoSolicitudesService.js
→ INSERT turno_solicitudes y/o estado de solicitud en turnos
→ odontólogo confirma o rechaza desde Turnos
```

Este flujo se acerca a la regla final. Sin embargo, `whatsappAutogestion.service.js` conserva handlers antiguos para elegir día/bloque/hora y funciones `handleConfirmAppointment`/`handleConfirmReschedule`; muchos pasos se redirigen mediante `resetLegacyAppointmentFlow`, pero el archivo requiere revisión por ramas antes de podar código.

## 2. Tablas de tokens

### `autogestion_tokens`

| Archivo | Función | Operación | Endpoint/flujo |
|---|---|---|---|
| `autogestionService.js` | `asegurarTablaAutogestionTokens` | CREATE TABLE / ADD `tipo_flujo` | Inicialización al usar cualquier endpoint antiguo |
| `autogestionService.js` | `generarTokenAutogestion` | INSERT | Generación de links de solicitud, cancelación y reprogramación |
| `autogestionService.js` | `obtenerTokenAutogestion` | SELECT por token | Validación de todos los links |
| `autogestionService.js` | `marcarTokenComoUsado` | UPDATE estado/uso | Confirmar solicitud, cancelar o reprogramar directamente |
| `2026-05-05_recordatorios_whatsapp.sql` | migración | CREATE/ALTER/INDEX | Migración histórica, no ejecutada en esta revisión |

Clasificación actual: **RETIRADA**. Las rutas públicas y el servicio antiguo ya no existen; la tabla fue eliminada mediante migración controlada.

### `tokens_autogestion`

No se encontraron consultas, inserts, updates o deletes en el código actual. Solo aparece en el esquema real de BD y está relacionada con `turnos` mediante FK `ON DELETE CASCADE`.

Clasificación actual: **RETIRADA**. Se comprobó que tenía 0 filas y ningún consumidor ejecutable antes de eliminarla mediante migración controlada.

## 3. Odontograma duplicado

### Odontograma A — interfaz actual

```text
pacientesView.js
→ api.js / getOdontogramaPaciente, postOdontograma
→ GET /api/odontograma/:pacienteId o POST /api/odontograma
→ odontogramaRoutes.js
→ odontogramaController.getOdontogramaPaciente / postOdontograma
→ odontogramaService.obtenerOdontogramaPorPaciente / guardarEstadoCara / guardarMeta
→ tablas odontograma + odontograma_meta
```

Estado: **ACTIVO**. Es el único importado por `pacientesView.js`.

### Odontograma B — implementación anterior conectada sin UI actual

```text
api.js / getOdontograma, updateOdontogramaPieza
→ GET /api/pacientes/:id/odontograma
  o PUT /api/pacientes/:id/odontograma/piezas/:pieza
→ pacientesRoutes.js
→ pacientesController.obtenerOdontograma / guardarOdontogramaPieza
→ pacientesService.obtenerOdontogramaPaciente / guardarOdontogramaPieza
→ tablas odontograma_piezas + odontograma_cambios
```

Las funciones de `api.js` existen pero ninguna vista las importa. Las rutas backend sí están montadas y protegidas con JWT.

Estado: **LEGACY PERO CONECTADA**. Riesgo de retiro alto hasta verificar si sus tablas contienen datos únicos o si existen clientes externos.

## 4. WhatsApp legacy

### `integrador-whatsapp/`

- Backend no importa archivos de esa carpeta.
- Frontend no consume su servidor.
- No existe `package.json` raíz ni configuración de workspaces que lo incorpore.
- Backend usa directamente `whatsapp-web.js` desde `whatsappClient.service.js`.
- `server.js` solo imprime que está obsoleto; no inicia Express.
- README raíz y `REVISION_ENTREGA.md` lo declaran legacy.
- `MODULOS.md` todavía describe un integrador externo mediante `WHATSAPP_NOTIFY_ENDPOINT` y webhook.

Clasificación: **LEGACY CONFIRMADO**.

### Servicios actuales

| Servicio | Consumidor | Clasificación |
|---|---|---|
| `whatsappClient.service.js` | `app.js`, controller y demás servicios WhatsApp | ACTIVO |
| `whatsappReminder.service.js` | scheduler, controller, `recordatoriosService`, cliente entrante | ACTIVO |
| `whatsappAutogestion.service.js` | `whatsappClient.service.js` y simulación del controller | ACTIVO, con ramas internas legacy |
| `whatsappConnection.service.js` | No se encontró importador | POSIBLEMENTE SIN CONSUMIDOR |
| `whatsappService.js` | Turnos y autogestión antigua | ACTIVO como fachada de notificaciones |

## 5. Google Calendar

### A. Código ejecutable activo

No se encontró integración activa, import de SDK, cliente de Google, sincronización o acceso a variables Google Calendar.

### B. Variables `.env`

Solo `backend/.env` conserva estas claves:

- `GOOGLE_CALENDAR_ENABLED`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_CALENDAR_CLIENT_EMAIL`
- `GOOGLE_CALENDAR_PRIVATE_KEY`
- `GOOGLE_CALENDAR_TIMEZONE`

No se muestran valores. No aparecen en `.env.example`.

### C. Migraciones históricas

`database/2026-05-19_remove_google_calendar_turnos.sql` elimina índice y columnas `google_event_id`, `sync_estado` y `sync_error`. Es evidencia histórica útil; no es funcionalidad activa.

### D. Documentación

- `README.md`: correctamente lo declara descartado.
- `REVISION_ENTREGA.md`: lo declara fuera de alcance.
- `DIAGNOSTICO_BD.md`: confirma que las columnas no existen en el esquema real.

### E. Texto visual/frontend

Los nombres `calendar*` de `turnosView.js`, CSS e `index.html` corresponden a la agenda interna diaria/semanal. No son referencias a Google Calendar y deben conservarse.

## 6. Rutas de debug y prueba

Todas las rutas siguientes heredan `router.use(middlewareAutenticacion, autorizarOdontologo)`:

| Endpoint | Archivo / función | Consumidor encontrado | Utilidad | Riesgo de retirar |
|---|---|---|---|---|
| GET `/api/whatsapp/debug/chats` | `whatsapp.routes.js` → `debugRecentChats` | Ninguno | Inspección y polling manual de chats | Medio: puede usarse para diagnóstico local |
| POST `/api/whatsapp/send-test` | `sendTestMessage` | README legacy y `probar-webhook-whatsapp.ps1` lo mencionan | Probar envío real | Medio |
| POST `/api/whatsapp/simulate-reply` | `simulateReply` | Ningún consumidor frontend; invocable manualmente | Simular respuesta sin mensaje real | Bajo/medio |
| `http://localhost:3999/mock/reply` | `api.js / simularRespuestaWhatsappMock` | Ninguna vista lo importa; no existe servidor correspondiente actual | Mock de integrador anterior | Bajo |

Otras rutas como `/process-reminders` y `/send-reminder/:appointmentId` son herramientas manuales, pero también están conectadas a funciones reales usadas por la interfaz de Turnos o administración; no deben clasificarse automáticamente como debug.

## 7. Archivos y exports sin consumidor

| Elemento | Evidencia | Clasificación |
|---|---|---|
| `frontend/src/js/views/documentosView.js` | Exporta `initDocumentosView`, pero `main.js` no lo importa. Documentos está reimplementado en `pacientesView.js` | CONFIRMADO SIN CONSUMIDOR dentro del frontend actual |
| `api.js / simularRespuestaWhatsappMock` | Ningún importador | CONFIRMADO SIN CONSUMIDOR dentro del repositorio |
| `api.js / getOdontograma` | Ningún importador | CONFIRMADO SIN CONSUMIDOR frontend; endpoint backend conectado |
| `api.js / updateOdontogramaPieza` | Ningún importador | CONFIRMADO SIN CONSUMIDOR frontend; endpoint backend conectado |
| `recordatoriosService.procesarRecordatoriosAutomaticos` | `turnosController` | ACTIVO |
| `recordatoriosService.enviarRecordatorioManualTurno` | `turnosController` | ACTIVO |
| `recordatoriosService.procesarRespuestaPaciente` | Ningún importador encontrado | POSIBLEMENTE SIN CONSUMIDOR |
| `recordatoriosService.procesarWebhookWhatsapp` | Ningún importador; siempre lanza error “obsoleto” | CONFIRMADO SIN CONSUMIDOR en repositorio |
| `recordatoriosService.aplicarReprogramacionConToken` | Ningún importador; siempre lanza error “obsoleto” | CONFIRMADO SIN CONSUMIDOR en repositorio |
| `recordatoriosService.iniciarSchedulerRecordatorios` | Ningún importador; `app.js` inicia scheduler directamente | CONFIRMADO SIN CONSUMIDOR en repositorio |
| `whatsappConnection.service.js` | No se encontró importador | POSIBLEMENTE SIN CONSUMIDOR |
| `integrador-whatsapp/` | Sin imports; autoidentificado como obsoleto | LEGACY CONFIRMADO |
| `tokens_autogestion` | Sin SQL en código actual; retirada el 2026-08-12 mediante migración controlada | RETIRADA |

“Confirmado sin consumidor” se limita al código contenido en este repositorio. No descarta clientes o scripts externos no disponibles.

## 8. Mapa final

| Elemento | Tipo | Consumidor actual | Estado | Riesgo de retirar | Acción recomendada |
|---|---|---|---|---|---|
| `autogestionService.js` | Servicio | Rutas públicas de pacientes y script PowerShell | LEGACY PERO CONECTADA | Alto | DESACTIVAR primero; ELIMINAR POSTERIORMENTE |
| Rutas `/pacientes/autogestion/*` | API pública | Script antiguo; cliente externo incierto | LEGACY PERO CONECTADA | Alto | DESACTIVAR en cambios pequeños |
| `autogestion_tokens` | Tabla retirada | Ninguno | RETIRADA | Bajo | ELIMINADA mediante migración controlada |
| `tokens_autogestion` | Tabla retirada | Ninguno | RETIRADA | Bajo | ELIMINADA mediante migración controlada |
| `whatsappAutogestion.service.js` | Servicio | Cliente WhatsApp real | ACTIVO | Alto | CONSERVAR; podar ramas legacy después |
| `turnoSolicitudesService.js` | Servicio | WhatsApp y Turnos | ACTIVO | Alto | CONSERVAR |
| `odontograma` + `odontograma_meta` | Tablas/flujo | Interfaz actual | ACTIVO | Alto | CONSERVAR |
| `odontograma_piezas` + `odontograma_cambios` | Tablas/flujo | Rutas backend antiguas | LEGACY PERO CONECTADA | Alto | MIGRAR CONSUMIDOR/datos antes de retirar |
| `documentosView.js` | Vista | Ninguno | SIN CONSUMIDOR | Bajo | ELIMINAR POSTERIORMENTE |
| `integrador-whatsapp/` | Proyecto separado | Ninguno | LEGACY CONFIRMADO | Bajo | ELIMINAR POSTERIORMENTE |
| `whatsappConnection.service.js` | Fachada | Ninguno encontrado | POSIBLEMENTE SIN CONSUMIDOR | Bajo | INVESTIGAR MÁS y luego eliminar |
| Rutas debug WhatsApp | API protegida | Uso manual/documental | Desarrollo | Bajo/medio | DESACTIVAR por entorno |
| Funciones obsoletas de `recordatoriosService` | Exports | Ninguno | SIN CONSUMIDOR | Bajo | ELIMINAR POSTERIORMENTE |
| Variables `GOOGLE_CALENDAR_*` | Configuración local | Ninguno | LEGACY CONFIRMADO | Bajo | ELIMINAR POSTERIORMENTE del entorno local |
| Migración de eliminación Google Calendar | Historial SQL | Historial de esquema | VÁLIDA/HISTÓRICA | Medio | CONSERVAR |
| Agenda visual `calendar*` | Frontend | Turnos | ACTIVA | Alto | CONSERVAR |

## 9. Plan propuesto para FASE 1B

Cada cambio debe realizarse y probarse por separado.

### Cambio 1 — Retirar el mock frontend de WhatsApp

- Archivos: `frontend/src/js/api.js`.
- Alcance: eliminar `WHATSAPP_MOCK_BASE_URL`, `requestAbsolute` si queda sin uso y `simularRespuestaWhatsappMock`.
- Riesgo: bajo.
- Verificación: búsqueda global sin referencias, sintaxis y arranque de frontend.

### Cambio 2 — Retirar vista independiente de documentos no conectada

- Archivos: `frontend/src/js/views/documentosView.js`.
- Riesgo: bajo.
- Verificación: confirmar nuevamente que `main.js` no la importa; probar documentos desde ficha de paciente.

### Cambio 3 — Restringir rutas WhatsApp de desarrollo por entorno

- Archivos: `backend/src/routes/whatsapp.routes.js` y, si se decide, configuración documentada.
- Rutas: debug chats, send-test y simulate-reply.
- Riesgo: medio.
- Verificación: disponibles en desarrollo, 404/denegadas en producción; status/QR siguen funcionando.

### Cambio 4 — Retirar exports obsoletos de `recordatoriosService`

- Archivo: `backend/src/services/recordatoriosService.js`.
- Elementos: webhook externo, reprogramación por token y scheduler duplicado; revisar por separado `procesarRespuestaPaciente`.
- Riesgo: bajo.
- Verificación: búsqueda global, sintaxis, recordatorio manual y scheduler real.

### Cambio 5 — Retirar `whatsappConnection.service.js`

- Archivo: `backend/src/services/whatsappConnection.service.js`.
- Condición: una última búsqueda y prueba de configuración/QR.
- Riesgo: bajo.
- Verificación: arranque backend, connect/restart/logout/disconnect.

### Cambio 6 — Archivar/eliminar `integrador-whatsapp/`

- Archivos: carpeta completa, package lock y referencias documentales.
- Riesgo: bajo.
- Verificación: backend y frontend inician sin esa carpeta; WhatsApp interno conecta.

### Cambio 7 — Actualizar documentación del integrador antiguo

- Archivos: `MODULOS.md`, README relacionados.
- Alcance: retirar webhook/endpoint externo y explicar `whatsapp-web.js` interno.
- Riesgo: bajo.
- Verificación: endpoints documentados coinciden con rutas reales.

### Cambio 8 — Desactivar solo las rutas públicas de asignación directa

- Archivos: `pacientesRoutes.js`; documentación/script asociado.
- Primera unidad: `/solicitar-turno/disponibilidad` y `/solicitar-turno/confirmar`.
- Segunda unidad: `/cancelar-turno/*`.
- Tercera unidad: `/reprogramar-turno/*`.
- Riesgo: alto.
- Verificación: WhatsApp actual crea `turno_solicitudes`; odontólogo confirma/rechaza; rutas administrativas siguen funcionando.

### Cambio 9 — Retirar script de autogestión antigua

- Archivo: `backend/scripts/probar-autogestion-pacientes.ps1`.
- Condición: después de desactivar las rutas que prueba.
- Riesgo: bajo.
- Verificación: no quedan documentos apuntando al script.

### Cambio 10 — Retirar `autogestionService.js` y controladores antiguos

- Archivos: servicio, `pacientesController.js`, imports y exports.
- Condición: todas las rutas antiguas ya desactivadas y flujo WhatsApp pendiente probado.
- Riesgo: medio/alto.
- Verificación: login, pacientes, Turnos y tres solicitudes WhatsApp.

### Cambio 11 — Desmontar endpoints del odontograma anterior

- Archivos: `pacientesRoutes.js`, `pacientesController.js`, `api.js`.
- No eliminar todavía tablas ni lógica de servicio.
- Riesgo: medio.
- Verificación: odontograma visual actual carga y guarda caras/meta.

### Cambio 12 — Analizar y migrar datos del odontograma anterior

- Alcance: comparación de conteos por paciente entre ambos modelos; decidir migración.
- Riesgo: alto.
- Verificación: respaldo, reporte de equivalencias y comprobación visual por pacientes de prueba.

### Cambio 13 — Investigar tablas de tokens antes de cualquier DROP

- Alcance: conteos, fechas máximas, estados y referencias reales.
- Riesgo: alto si se elimina prematuramente.
- Verificación: la tabla antigua no recibe nuevas filas durante pruebas y no hay cliente externo.

### Cambio 14 — Retirar variables locales Google Calendar

- Archivo local: `backend/.env`, sin tocar la migración histórica.
- Riesgo: bajo.
- Verificación: búsqueda global y arranque backend.

## 10. Resultado de la revisión

- El flujo de links/tokens es antiguo, pero continúa públicamente conectado.
- El flujo WhatsApp interno y `turno_solicitudes` son los consumidores actuales que deben conservarse.
- La interfaz usa el odontograma nuevo; el anterior conserva rutas backend.
- El integrador externo es legacy confirmado.
- Google Calendar no tiene código ejecutable activo.
- Existen unidades pequeñas y de bajo riesgo que pueden limpiarse antes de tocar los flujos críticos.

## Validación final

- BASE DE DATOS MODIFICADA: **NO**
- CÓDIGO MODIFICADO: **NO**
- ARCHIVOS CREADOS: **REVISION_LEGACY.md**
- ARCHIVOS ELIMINADOS: **NINGUNO**
