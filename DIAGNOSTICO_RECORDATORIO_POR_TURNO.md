# Diagnóstico: recordatorio automático opcional por turno

Fecha de auditoría: 16/08/2026.

## Conclusión

**CAMPO EXISTENTE:** NO  
**NOMBRE:** no existe una columna equivalente en `public.turnos`.

El sistema tiene campos que registran el resultado del procesamiento de un recordatorio, pero ninguno expresa si un turno individual debe participar del envío automático. Actualmente todos los turnos que cumplen las condiciones del scheduler son candidatos, sin distinguir si fueron creados manualmente o nacieron de una solicitud por WhatsApp.

La preferencia mínima propuesta es:

```sql
recordatorio_habilitado BOOLEAN NOT NULL DEFAULT TRUE
```

El valor `TRUE` mantiene el comportamiento actual para turnos existentes y nuevos.

## 1. Tabla `turnos`

El esquema versionado (`database/schema_actual.sql`) y PostgreSQL real coinciden. Las columnas relacionadas existentes son:

| Columna | Tipo real | Nullable | Default | Finalidad actual |
|---|---|---:|---|---|
| `recordatorio_procesado_at` | `timestamp with time zone` | Sí | `NULL` | Último momento en que se procesó un envío o error. |
| `recordatorio_enviado_at` | `timestamp with time zone` | Sí | `NULL` | Indica que el recordatorio ya fue enviado. |
| `recordatorio_estado` | `text` | Sí | `NULL` | Resultado operativo: por ejemplo `enviado`, `error` o `respondido`. |
| `recordatorio_error` | `text` | Sí | `NULL` | Mensaje del último error de envío. |

No existen `recordatorio_habilitado`, `enviar_recordatorio`, `recordatorio_activo`, `whatsapp_recordatorio`, `recordatorio_automatico` ni otra columna con significado equivalente.

Estos cuatro campos son de seguimiento posterior; no sirven como preferencia previa porque `NULL` también es el estado normal de un turno todavía no procesado.

La comprobación se realizó dentro de `BEGIN READ ONLY` y terminó con `ROLLBACK`. No se consultaron datos personales.

## 2. Creación de turnos

### Recorrido real del alta manual

```text
frontend/index.html (#create-turno-form)
  → turnosView.js / bindCreateForm()
  → api.js / createTurno()
  → POST /api/turnos
  → turnosRoutes.js
  → turnosController.js / registrarTurno()
  → turnosService.js / crearTurno()
  → INSERT INTO turnos
```

El formulario envía actualmente:

- `pacienteId`;
- `profesionalId`;
- `prestacionId`;
- `fechaHoraInicio`;
- `duracionMinutos`, si se completó;
- `observaciones`.

`fechaDia` y `fechaHoraFin` se usan en la interfaz, pero se eliminan del payload antes del POST. `api.js` transmite el objeto recibido como JSON sin seleccionar campos.

El controlador sí desestructura una lista cerrada y construye otro objeto para `crearTurno()`. Por eso cualquier propiedad nueva enviada hoy por el frontend sería ignorada antes de llegar al servicio. El servicio también recibe parámetros explícitos y el `INSERT` enumera sus columnas.

### Diferencia con una solicitud de WhatsApp

- Alta manual: `crearTurno()` inserta una fila con `origen = 'interno'` y `estado = 'programado'`.
- Solicitud WhatsApp: `crearSolicitudTurno()` inserta inicialmente una fila con `origen = 'autogestion_whatsapp'`, `estado = 'solicitado'` y sin horario definitivo.
- Confirmación del odontólogo: `confirmarSolicitudTurno()` completa profesional, prestación y fechas sobre esa misma fila y cambia el estado a `confirmado`.

Con `DEFAULT TRUE`, ambos recorridos conservarían el comportamiento vigente incluso si no envían explícitamente la preferencia. Para permitir una decisión consciente al confirmar una solicitud, el modal compartido de edición/confirmación debería mostrar también el checkbox y el endpoint de confirmación debería aceptar el booleano.

## 3. Scheduler y condiciones actuales

### Recorrido real

```text
app.js
  → startReminderScheduler()
  → setInterval (WHATSAPP_REMINDER_INTERVAL_MINUTES)
  → processAutomaticReminders()
  → findUpcomingAppointmentsForReminders()
  → sendAppointmentReminder()
```

El scheduler se inicia con la aplicación y ejecuta el proceso en intervalos; actualmente el intervalo configurado es de 10 minutos.

### Condiciones actuales

Para iniciar el procesamiento automático:

1. `REMINDERS_ENABLED` debe ser `true`.
2. El turno debe estar en `programado` o `confirmado`.
3. `fecha_hora_inicio` debe ser futura.
4. Debe caer dentro de la ventana configurada; actualmente `REMINDER_WINDOW_HOURS = 24` y el código limita la ventana a un máximo de 24 horas.
5. `recordatorio_enviado_at` debe ser `NULL`.
6. La ficha del paciente debe tener un teléfono no vacío.
7. No debe existir ninguna fila de `whatsapp_reminders` para ese turno.
8. Debe entrar en el límite del lote, por defecto 25.

Antes del envío, `sendAppointmentReminder()` vuelve a validar que el estado sea `programado` o `confirmado`, que el turno no esté vencido y que no exista un recordatorio previo. Luego renderiza `recordatorio_turno`.

Si `configuracion_mensajes_automaticos.recordatorio_turno.activo` es `false`, el renderizado devuelve `null` y el envío se omite. En la auditoría esta configuración global estaba activa.

`recordatorio_estado` y `recordatorio_procesado_at` no participan de la selección. Son campos informativos. La prevención principal de duplicados usa `recordatorio_enviado_at IS NULL` junto con la ausencia de una fila en `whatsapp_reminders`.

No existe condición por `origen`. Por lo tanto, actualmente se procesan por igual los turnos manuales y los confirmados desde WhatsApp siempre que cumplan todas las condiciones anteriores.

## 4. Configuración global frente a preferencia individual

La condición conceptual recomendada es:

```text
REMINDERS_ENABLED activo
AND recordatorio_turno.activo
AND turno.recordatorio_habilitado = TRUE
AND estado/fecha/teléfono/no duplicado cumplen las condiciones actuales
→ enviar recordatorio automático
```

- `recordatorio_turno.activo` controla globalmente si el consultorio utiliza ese mensaje automático.
- `turnos.recordatorio_habilitado` decidiría si un turno particular participa del proceso.

La preferencia debe afectar al procesamiento automático. El botón explícito “Enviar recordatorio por WhatsApp” es un flujo manual y conviene mantenerlo separado; si se desea que el opt-out también lo bloquee, esa sería una regla adicional que debería definirse expresamente.

## 5. UX propuesta

Agregar al modal “Nuevo turno”:

```text
[✓] Enviar recordatorio automático por WhatsApp
    Se enviará antes del turno según la configuración del consultorio.
```

**DEFAULT PROPUESTO:** marcado.

Es la opción compatible con el comportamiento actual. Además, el frontend debe convertir el checkbox a un booleano real: un checkbox HTML marcado produce normalmente el texto `on` y uno desmarcado no aparece en `FormData`. No conviene enviar esos valores directamente al backend.

## 6. Edición y reprogramación

**RECOMENDACIÓN:** alternativa B, permitir modificar la preferencia al registrar y también al editar/reprogramar.

Es más consistente porque la decisión puede cambiar después del alta y el mismo modal se usa para:

- editar un turno normal;
- confirmar una solicitud de WhatsApp;
- atender una reprogramación solicitada.

Al abrir el modal, el checkbox debería reflejar el valor persistido. Una reprogramación debería conservar el valor actual salvo que el odontólogo lo cambie explícitamente.

Advertencia del comportamiento vigente: `reprogramarTurno()` deja el estado en `reprogramado`, pero el scheduler solo selecciona `programado` y `confirmado`. Por ello, hoy un turno que queda en `reprogramado` no recibe recordatorio automático, independientemente de la futura preferencia. Incluir `reprogramado` sería una decisión funcional separada y no debe mezclarse silenciosamente con esta mejora.

Tampoco se reinician `recordatorio_enviado_at` ni el historial de `whatsapp_reminders` al reprogramar. Si un recordatorio ya fue enviado, el sistema no enviará otro para la nueva fecha. Cambiar esa política también es una mejora separada.

## 7. Cambio mínimo si se implementa

### Migración conceptual

```sql
BEGIN;

ALTER TABLE public.turnos
  ADD COLUMN recordatorio_habilitado BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
```

Debe crearse como una migración nueva y fechada. Después de ejecutarla correspondería regenerar `database/schema_actual.sql`. No debe agregarse como `ALTER TABLE` dinámico dentro de un servicio.

### Backend

- `turnosController.js`: leer y validar el booleano en alta, edición y confirmación de solicitudes.
- `turnosService.js`: incorporarlo en `crearTurno()`, `editarTurno()`, `confirmarSolicitudTurno()`, los `INSERT`/`UPDATE`, los `SELECT` de detalle/listado y el mapeo de respuestas.
- `whatsappReminder.service.js`: agregar `t.recordatorio_habilitado = TRUE` a la consulta de candidatos automáticos.
- `reprogramarTurno()`: conservar el valor existente; solo aceptar un cambio si el flujo de edición lo envía expresamente.

`api.js` ya transmite payloads JSON genéricos, por lo que no requiere necesariamente un cambio estructural.

### Frontend

- `frontend/index.html`: checkbox y texto secundario en alta y edición/confirmación.
- `turnosView.js`: referencias DOM, default marcado, carga del valor actual y conversión explícita a booleano en los payloads.

El flujo de autogestión no necesita definir el valor durante la solicitud inicial si la columna usa `DEFAULT TRUE`. La decisión podría ajustarse al confirmar la solicitud desde el modal del odontólogo.

## 8. Casos esperados

| Caso | Comportamiento propuesto |
|---|---|
| 1. Turno manual, checkbox marcado | Se guarda `TRUE`; puede recibir recordatorio si globales y condiciones actuales lo permiten. |
| 2. Turno manual, checkbox desmarcado | Se guarda `FALSE`; el scheduler automático lo excluye. |
| 3. Solicitud WhatsApp confirmada | Empieza con `TRUE` por default; el odontólogo puede conservarlo o cambiarlo al confirmar. |
| 4. Turno reprogramado | Conserva la preferencia. Actualmente el estado `reprogramado` queda fuera del scheduler y no se reinicia un recordatorio ya enviado; ambas políticas requieren una decisión separada. |
| 5. Configuración global desactivada | No se envía aunque la preferencia individual sea `TRUE`. |
| 6. Turno sin teléfono | El scheduler actual lo excluye. No se envía y no se marca error. |
| 7. Recordatorio ya enviado | No se vuelve a enviar porque `recordatorio_enviado_at` ya no es `NULL` y existe historial en `whatsapp_reminders`. |

## 9. Archivos que serían afectados

Cambios necesarios:

- nueva migración fechada en `database/`;
- `database/schema_actual.sql`, después de ejecutar y regenerar el esquema;
- `backend/src/controllers/turnosController.js`;
- `backend/src/services/turnosService.js`;
- `backend/src/services/whatsappReminder.service.js`;
- `frontend/index.html`;
- `frontend/src/js/views/turnosView.js`.

Revisado, pero probablemente sin cambios:

- `frontend/src/js/api.js`, porque ya reenvía el payload JSON recibido.

## Resumen solicitado

**CAMPO EXISTENTE:** NO  
**NOMBRE:** no aplica; se propone `recordatorio_habilitado`.

**COMPORTAMIENTO ACTUAL DEL SCHEDULER:** procesa todos los turnos `programado`/`confirmado` dentro de la ventana, con teléfono, sin envío previo y sin fila en `whatsapp_reminders`; no distingue origen ni preferencia individual.

**CONFIGURACIÓN GLOBAL ACTUAL:** `REMINDERS_ENABLED = true` y `recordatorio_turno.activo = true` al momento de la auditoría.

**CAMBIO PROPUESTO:** agregar `turnos.recordatorio_habilitado` y exigirlo en la selección automática.

**DEFAULT PROPUESTO:** `TRUE`.

**REGISTRAR TURNO — CAMBIO NECESARIO:** checkbox marcado por defecto, booleano explícito en payload, controlador, servicio e `INSERT`.

**EDITAR/REPROGRAMAR — CAMBIO NECESARIO:** mostrar y persistir la preferencia; conservarla si no se cambia.

**SOLICITUDES WHATSAPP — COMPORTAMIENTO PROPUESTO:** usar `TRUE` por default y permitir al odontólogo modificarlo al confirmar.

**CAMBIO DE ESQUEMA NECESARIO:** SÍ.

**RIESGO:** MEDIO. La migración es pequeña y compatible, pero hay que mantener alineados tres recorridos de persistencia y no confundir recordatorios automáticos con el envío manual. También debe decidirse por separado el tratamiento del estado `reprogramado` y de recordatorios ya enviados antes de una reprogramación.

**CÓDIGO MODIFICADO:** NO  
**BASE MODIFICADA:** NO  
**MIGRACIONES:** NINGUNA  
**WHATSAPP ENVIADO:** NO  
**COMMIT:** NO
