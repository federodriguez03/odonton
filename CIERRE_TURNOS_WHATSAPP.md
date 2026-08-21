# FASE 2C — Cierre de Turnos + WhatsApp

Fecha de auditoría: 2026-08-16

## ESTADO GENERAL

**ESTADO GENERAL:** los recorridos principales de Turnos y WhatsApp son coherentes con el alcance de la tesis. La revisión estática, las pruebas automáticas existentes y la fotografía `READ ONLY` de PostgreSQL no mostraron un defecto que impida la entrega.

**APTO PARA FREEZE:** **SÍ**, sujeto a completar la checklist manual final en el entorno habitual.

Alcance del freeze recomendado:

- registrar, editar, reprogramar y cancelar turnos desde el sistema;
- registrar solicitudes de turno, reprogramación y cancelación desde WhatsApp;
- identificación del paciente por DNI;
- confirmación o rechazo administrativo de solicitudes;
- recordatorios automáticos opcionales por turno;
- mensajes administrativos configurables.

## 🔴 BLOQUEANTES

**Ninguno encontrado.**

No se observaron solicitudes pendientes incompatibles, solapamientos vigentes, estados de solicitud sin su pendiente asociada ni duplicados pendientes equivalentes. Las siete pruebas específicas solicitadas finalizaron correctamente.

## 🟠 IMPORTANTES PARA DEFENSA

1. **La validación manual final continúa pendiente.** Las pruebas automáticas aíslan reglas y contratos mediante dobles de prueba; no reemplazan una demostración completa navegador → API → PostgreSQL → cliente real de WhatsApp. No es un defecto de código, pero sí la condición final antes de declarar el freeze definitivo.
2. **Persisten helpers de creación/ajuste de esquema en tiempo de ejecución.** `asegurarColumnasProfesionalTurnos`, `asegurarHorariosProfesionales`, `asegurarColumnasRecordatorioTurnos`, `asegurarTablaTurnoSolicitudes`, `ensureWhatsAppReminderSchema` y `asegurarConfiguracion` contienen `CREATE`, `ALTER`, `UPDATE` o creación de índices. El esquema actual ya contiene las estructuras necesarias, por lo que no rompió las pruebas ni los datos revisados; para la defensa debe explicarse como compatibilidad histórica y no como arquitectura objetivo.
3. **El alta de una solicitud nueva se compone de más de una escritura no agrupada en una única transacción.** `registerPendingRequestFromSession` crea primero el turno en estado `solicitado` y después la fila de `turno_solicitudes`. En el flujo normal ambas operaciones funcionan y la base no contiene casos huérfanos; una caída exacta entre ambas escrituras o dos confirmaciones concurrentes podría dejar una operación incompleta. Es un riesgo acotado de concurrencia/infraestructura, no un fallo reproducido del recorrido principal.

## 🟢 BACKLOG / MEJORAS

1. El archivo `whatsappAutogestion.service.js` conserva funciones antiguas capaces de listar días/horarios y crear o reprogramar turnos, pero el dispatcher actual redirige todos sus estados legacy a `resetLegacyAppointmentFlow`. No son alcanzables desde las rutas o el dispatcher activo; conviene retirarlas en una limpieza futura, no durante el freeze.
2. `whatsappClient.service.js` conserva polling complementario. Está desactivado salvo `WHATSAPP_POLLING_ENABLED=true`; el flujo normal usa el evento `message`, y ambos caminos comparten deduplicación. Puede documentarse o retirarse posteriormente.
3. El scheduler no incluye turnos `reprogramado` y no genera un segundo recordatorio tras reprogramar. Es la decisión actual aceptada para el alcance, no un defecto de cierre.
4. `whatsapp_reminders` no tiene una restricción única por turno. La lógica evita el reenvío normal con `hasReminderForAppointment`, `recordatorio_enviado_at` y el `LEFT JOIN`; una invocación explícita con `force=true` o concurrencia entre procesos puede conservar más de un registro histórico.
5. La base contiene dos turnos con dos registros históricos de recordatorio cada uno (dos filas excedentes), pero no hay recordatorios `pending_response` duplicados. No se demostró doble envío automático actual ni una operación pendiente ambigua.
6. Las rutas autenticadas `/api/whatsapp/debug/chats`, `/send-test` y `/simulate-reply` son herramientas de desarrollo. No intervienen en el flujo normal, pero conviene excluirlas del relato funcional de la tesis y restringir su uso operativo.
7. La resolución del teléfono para recordatorios puede completar el teléfono vacío del paciente a partir de una conversación previa. Es un efecto lateral deliberado del servicio que debería explicarse o aislarse en una mejora posterior.
8. Las comprobaciones de solapamiento se realizan en la aplicación, sin una exclusión de rango en PostgreSQL. Es suficiente para una única instancia académica; una instalación concurrente de múltiples procesos requeriría endurecimiento.

## REGISTRAR TURNO

**Resultado:** FUNCIONAL.

Recorrido real:

`turnosView.js: bindCreateForm` → `api.js: createTurno` → `POST /api/turnos` → `turnosRoutes.js` → `turnosController.js: registrarTurno` → `turnosService.js: crearTurno` → `pacientes`, `prestaciones`, `usuarios`, horarios configurados y `turnos`.

Confirmaciones:

- paciente, prestación y fecha/hora son obligatorios en controller y service;
- el profesional se valida como usuario activo y, si falta, se resuelve el usuario autenticado/default;
- la duración informada o la de la prestación debe ser válida y de al menos 15 minutos;
- se rechazan fechas pasadas y horarios fuera de la atención configurada;
- `existeSolapamiento` controla cruces para el mismo profesional contra estados `programado`, `reprogramado` y `confirmado`;
- el estado inicial es `programado` y el origen administrativo es `interno`;
- se guardan observaciones y `recordatorio_habilitado`, con valor inicial `true` si no se informa.

## EDITAR

**Resultado:** FUNCIONAL.

`turnosView.js: loadAndOpenEditTurno/openEditModal/bindEditForm` carga la fila real del listado, sus relaciones y el valor del recordatorio. La disponibilidad excluye el propio turno. `editarTurno` vuelve a validar paciente, prestación, profesional, duración, atención y solapamiento; conserva el estado y usa `COALESCE` para conservar `recordatorio_habilitado` cuando no se envía un nuevo valor.

La secuencia es persistencia → lectura del detalle → intento de WhatsApp. El resultado de WhatsApp se devuelve como advertencia y no revierte la edición ya guardada.

## CANCELAR

**Resultado:** FUNCIONAL.

### Desde el sistema

`PUT /api/turnos/:id/cancelar` → `turnosController.cancelarTurno` → `turnosService.cancelarTurno`.

- inicia transacción y bloquea el turno con `SELECT ... FOR UPDATE`;
- valida que el estado sea cancelable;
- actualiza el turno a `cancelado` y cierra solicitudes pendientes relacionadas como `resuelta`;
- ejecuta `COMMIT` antes de preparar o enviar la notificación;
- el envío es opcional (`enviarMensaje === true`) y su fallo no revierte la cancelación.

### Solicitada desde WhatsApp

`whatsappClient.handleIncomingMessage` → `processAutogestionMessage` o `processPatientReply` → `abrirSolicitudCambioTurno`.

- no cancela directamente;
- bloquea el turno con `SELECT ... FOR UPDATE`;
- crea/reutiliza una solicitud `cancelacion` pendiente y cambia el turno a `cancelacion_solicitada` dentro de la misma transacción;
- la aceptación administrativa usa `cancelarTurno`: turno `cancelado` + solicitud `resuelta`;
- el rechazo usa `rechazarSolicitudTurno`: turno `programado` + solicitud `rechazada`;
- el mensaje al paciente ocurre después del `COMMIT` administrativo.

## REPROGRAMAR

**Resultado:** FUNCIONAL.

### Desde el sistema

`PUT /api/turnos/:id/reprogramar` valida fechas, horario del profesional y solapamiento. El CTE actualiza el turno a `reprogramado` y resuelve la solicitud pendiente de reprogramación en una sola sentencia. La notificación se intenta después de persistir.

### Solicitada desde WhatsApp

El paciente sólo identifica su turno y registra la intención. `abrirSolicitudCambioTurno` crea/reutiliza la solicitud pendiente y deja el turno en `reprogramacion_solicitada`; no solicita ni asigna día u hora. El odontólogo define después la fecha y el horario desde el sistema. El rechazo devuelve el turno a `programado` y cierra la solicitud como `rechazada`.

## DISPONIBILIDAD

**Resultado:** FUNCIONAL.

`GET /api/turnos/disponibilidad` exige profesional, fecha y prestación/tratamiento. `consultarDisponibilidad` obtiene la duración, respeta el horario específico del profesional o el horario global, genera intervalos de 15 minutos, excluye horarios pasados y cruza la agenda del profesional. Crear, editar, confirmar y reprogramar repiten la validación en backend antes de escribir.

Fotografía de PostgreSQL: **0 pares de turnos vigentes solapados para el mismo profesional**.

## SOLICITUDES

**Resultado:** FUNCIONAL y consistente en la fotografía auditada.

Conteos `READ ONLY`:

- pendientes totales: **0**;
- pendientes incompatibles: **0**;
- pendientes ambiguas: **0**;
- grupos de duplicados pendientes equivalentes: **0**;
- turnos en estado de solicitud sin su solicitud pendiente correspondiente: **0**;
- histórico conservado: 15 `resuelta` y 3 `rechazada`.

Las aperturas de cancelación y reprogramación están centralizadas en `turnoSolicitudesService.abrirSolicitudCambioTurno`, usan `SELECT FOR UPDATE` y agrupan solicitud + estado del turno en una transacción. Tanto autogestión como respuestas a recordatorios reutilizan esa operación.

## BOT DNI-FIRST

**Resultado:** FUNCIONAL.

Flujo activo:

`Turno` o una opción directa → menú → opción 1 → `esperando_dni`.

- DNI existente: se conserva `paciente_id` como identidad operativa y se registra `nuevo_turno`;
- DNI inexistente: se solicitan nombre y apellido, se crea/localiza el paciente y la solicitud se clasifica únicamente como `primera_consulta`;
- `createPacienteMinimo` vuelve a buscar por DNI antes de crear, y la restricción de DNI del módulo Pacientes protege la identidad;
- no existe una selección activa “Ya fui atendido/a” / “Es mi primera vez”.

Reglas de actividad:

- un turno futuro en estado vigente bloquea una nueva solicitud incompatible;
- sólo una solicitud realmente `pendiente` y coherente bloquea;
- solicitudes `resuelta`/`rechazada`, turnos `cancelado`/`realizado` y turnos pasados no bloquean;
- las reglas están concentradas en `domain/turnoActivityRules.js` y consumidas por `turnoSolicitudesService` y autogestión.

## MENÚ Y CONVERSACIÓN

**Resultado:** FUNCIONAL.

- opciones activas: 1 sacar turno, 2 reprogramar, 3 cancelar, 0 cancelar conversación;
- `0`, `cancelar`, `salir`, `terminar` y `cancelar conversacion` cierran una sesión activa;
- cortesías reconocidas no producen operaciones ni errores;
- mensajes sin intención, sin sesión y sin recordatorio pendiente se ignoran; el log sólo aparece con `WHATSAPP_DEBUG=true`;
- una sesión vencida se marca `expired` y no continúa con el paso anterior;
- ningún estado activo permite elegir día u hora: los estados antiguos se cortan con `resetLegacyAppointmentFlow`;
- el evento `message` es el ingreso normal. El polling opcional está desactivado por defecto y comparte la deduplicación por id/fingerprint si se habilita.

## RECORDATORIOS

**Resultado:** FUNCIONAL para el alcance actual.

- scheduler iniciado cada 10 minutos en la configuración local auditada;
- `REMINDERS_ENABLED=true` y ventana de 24 horas en la configuración local auditada;
- se seleccionan sólo estados `programado`/`confirmado`, turnos futuros, teléfono no vacío, sin recordatorio previo y con `recordatorio_habilitado = TRUE`;
- la plantilla `recordatorio_turno` existe, está activa y no contiene placeholders inválidos;
- `recordatorio_habilitado = FALSE` queda excluido tanto en la consulta del scheduler como en la defensa de `sendAppointmentReminder(..., { automatic: true })`;
- con `REMINDERS_ENABLED` distinto de `true`, `processAutomaticReminders` retorna sin procesar envíos;
- el envío manual no depende de `recordatorio_habilitado`, según el alcance pedido;
- tras enviar se registra `whatsapp_reminders`, `recordatorio_enviado_at` y estado del recordatorio;
- la respuesta puede confirmar el turno o abrir una solicitud atómica de cancelación/reprogramación, sin ejecutar directamente esas decisiones.

Fotografía de PostgreSQL:

- 32 turnos con `recordatorio_habilitado = TRUE`;
- 0 con `FALSE` y 0 con `NULL`;
- 0 turnos con más de un recordatorio `pending_response`;
- 2 turnos con duplicados históricos, sin pendiente duplicada.

## MENSAJES ADMINISTRATIVOS

**Resultado:** FUNCIONAL.

Tipos y consumidores:

| Tipo | Consumidor real |
|---|---|
| `recordatorio_turno` | `whatsappReminder.service.js: buildReminderMessage` |
| `confirmacion_turno` | confirmación administrativa y respuesta confirmada a recordatorio |
| `cancelacion_turno` | `whatsappService.notificarCancelacionTurnoPorWhatsapp` |
| `reprogramacion_turno` | `whatsappService.notificarCambioTurnoPorWhatsapp` |
| `rechazo_solicitud_turno` | `whatsappService.notificarRechazoSolicitudTurnoPorWhatsapp` |

Las cinco configuraciones existen, están activas y no usan placeholders no soportados. El contrato administrativo es `{ intentado, enviado, advertencia }`. Una plantilla desactivada devuelve `{ intentado: false, enviado: false, advertencia: null }`. En edición, reprogramación, cancelación, confirmación y rechazo, la persistencia finaliza antes del intento de WhatsApp; el envío nunca decide el `COMMIT` o `ROLLBACK`.

## CONSISTENCIA BD

La revisión se ejecutó dentro de `BEGIN READ ONLY` y terminó con `ROLLBACK`. No mostró filas ni datos personales.

| Control | Resultado |
|---|---:|
| Solicitudes pendientes | 0 |
| Pendientes incompatibles | 0 |
| Pendientes ambiguas | 0 |
| Duplicados pendientes equivalentes | 0 |
| Turnos en estado de solicitud sin pendiente coherente | 0 |
| Pares de turnos vigentes solapados | 0 |
| `recordatorio_habilitado IS NULL` | 0 |
| Recordatorios pendientes duplicados | 0 |
| Turnos con duplicados históricos de recordatorio | 2 |

Estados actuales de turnos: 16 `cancelado`, 1 `programado`, 12 `realizado` y 3 `rechazado`. La ausencia de solicitudes pendientes es válida para esta fotografía; una solicitud nueva real podría aparecer posteriormente sin constituir una inconsistencia.

## LEGACY EJECUTABLE PELIGROSO

**NO.**

Las funciones antiguas de selección de día/hora permanecen físicamente en `whatsappAutogestion.service.js`, pero sus pasos no ejecutan esos handlers: el dispatcher los deriva a `resetLegacyAppointmentFlow`. Tampoco se exportan las funciones de creación/confirmación legacy. Se clasifican como backlog porque no son alcanzables desde routes/dispatcher.

El polling de mensajes sí es código ejecutable si se habilita explícitamente mediante ambiente, pero no implementa reglas distintas: vuelve a pasar los mensajes por `handleIncomingMessage` y su deduplicación. No está activo por defecto.

## PRUEBAS AUTOMÁTICAS

**RESULTADO:** todas correctas; no se envió WhatsApp real.

| Validación | Resultado |
|---|---|
| `test-turno-solicitudes-transitions` | OK — 8 escenarios y rollback |
| `test-whatsapp-request-openings` | OK — cancelación/reprogramación atómicas, rollback y duplicados |
| `test-recordatorio-por-turno` | OK — 10 escenarios, sin WhatsApp real |
| `test-bot-patient-activity` | OK — 9 casos y estados |
| `test-whatsapp-message-rendering` | OK — 8 casos |
| `test-whatsapp-rejection-notification` | OK — 6 casos |
| `test-whatsapp-phone-normalization` | OK — 10 válidos y 5 inválidos |
| `node --check` sobre `backend/src` | OK — 62 archivos JavaScript |
| `npm run build` en frontend | OK — 89 módulos transformados |
| `git diff --check` | OK |

## CHECKLIST MANUAL FINAL

- [ ] 1. Registrar un turno futuro con paciente, profesional, prestación, duración, observaciones y recordatorio habilitado; verificarlo en lista/calendario.
- [ ] 2. Intentar registrar otro turno superpuesto para el mismo profesional; comprobar que se rechace.
- [ ] 3. Editar fecha/hora y `recordatorio_habilitado`; recargar y comprobar persistencia. Probar WhatsApp desconectado y verificar que la edición igualmente quede guardada.
- [ ] 4. Cancelar un turno desde el sistema sin mensaje y otro con mensaje opcional; comprobar estado `cancelado`.
- [ ] 5. Desde WhatsApp, opción 1 con DNI inexistente: completar nombre, motivo y preferencia; comprobar paciente nuevo + `primera_consulta` pendiente, sin día/hora asignados por el bot.
- [ ] 6. Desde WhatsApp, opción 1 con DNI existente: comprobar `nuevo_turno` pendiente y asociación al paciente correcto.
- [ ] 7. Repetir opción 1 para un paciente con turno futuro o solicitud pendiente; comprobar que no crea otra solicitud. Repetir después de cerrar históricamente una solicitud y comprobar que el histórico no bloquea.
- [ ] 8. Desde WhatsApp, opción 2: comprobar solicitud `reprogramacion` pendiente y turno `reprogramacion_solicitada`, sin elección de fecha/hora.
- [ ] 9. Desde WhatsApp, opción 3 y confirmación: comprobar solicitud `cancelacion` pendiente y turno `cancelacion_solicitada`, todavía no cancelado.
- [ ] 10. Confirmar una solicitud nueva desde el sistema y comprobar turno `confirmado`, solicitud `resuelta` y notificación posterior a la persistencia.
- [ ] 11. Rechazar una solicitud de alta/cancelación/reprogramación y comprobar estado de turno definido, solicitud `rechazada` y recepción del mensaje configurado.
- [ ] 12. Probar recordatorio automático con un turno habilitado dentro de la ventana y otro con `recordatorio_habilitado=false`; sólo el primero debe enviarse. Verificar que no se repita.
- [ ] 13. Durante una conversación, responder `0`; comprobar cierre sin crear/cambiar turnos. Enviar después un mensaje libre sin intención y verificar que no ejecuta operaciones.
- [ ] 14. Finalizar un flujo y enviar una cortesía (`gracias`/`ok`); comprobar que no produce error ni reabre una gestión.

## RECOMENDACIÓN

Completar una sola pasada de la checklist manual, registrar evidencia breve de los resultados y congelar estos módulos. Los puntos 🟠 y 🟢 no justifican una nueva ronda de refactor antes de la entrega salvo que la prueba manual reproduzca un fallo funcional.

**Recomiendo declarar Turnos + WhatsApp funcionalmente cerrados y no realizar nuevas modificaciones salvo bugs encontrados en la prueba final.**

---

**CÓDIGO MODIFICADO:** NO

**BASE MODIFICADA:** NO

**WHATSAPP REAL ENVIADO:** NO

**COMMIT:** NO
