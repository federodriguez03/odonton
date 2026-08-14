# Diagnóstico funcional — FASE 2A

Fecha del análisis: 2026-08-13  
Proyecto: Odonton  
Alcance: análisis estático, trazado de flujos, compilación y consultas PostgreSQL agregadas de solo lectura.

## Criterio usado en este informe

- **HECHO CONFIRMADO POR CÓDIGO:** el comportamiento se deduce directamente de una ruta ejecutable y completa.
- **HIPÓTESIS:** existe una explicación razonable, pero el código por sí solo no permite demostrar que sea la causa observada.
- **REQUIERE PRUEBA MANUAL:** necesita interacción controlada con navegador, WhatsApp o datos de prueba para confirmarse.

No se inició el backend porque su arranque habilita el scheduler de recordatorios y la conexión WhatsApp. Hacerlo podía producir efectos externos contrarios a las restricciones de esta fase. No se enviaron peticiones mutantes a la aplicación.

## Resumen ejecutivo

1. **Odontograma:** el problema de “Sano” está confirmado en el frontend. Al elegirlo en una cara, `pacientesView.js` cambia las cinco caras en memoria y luego envía cinco `POST`. El backend no borra las otras caras por sí solo.
2. **Recordatorios:** el botón visible es una herramienta manual que ejecuta el mismo procesamiento de recordatorios que el scheduler y puede enviar mensajes reales. Está además ubicado incorrectamente dentro de Pacientes.
3. **Turnos/WhatsApp:** el turno se actualiza antes de intentar notificar. Un fallo de WhatsApp no revierte el cambio. Confirmación y cancelación son funcionales pero frágiles; la reprogramación solicitada tiene una inconsistencia confirmada entre la UI y el endpoint usado.
4. **DNI por WhatsApp:** el flujo activo no permite separadores y vuelve a buscar el DNI antes de crear. PostgreSQL impide duplicados textuales exactos. No hay duplicados normalizados en los datos actuales. Persiste un riesgo global porque `pacientes.dni` es texto y otras altas no normalizan.
5. **Estadísticas/Reportes:** no consultan antes de autenticar y sus listeners se registran una sola vez. No se encontró por análisis estático una causa que obligue a refrescar; ambas pantallas quedan vacías hasta que el usuario elige fechas y envía el formulario. La decisión de mantenerlas visibles es de alcance.
6. **Configuración:** editar y guardar está conectado de extremo a extremo, pero no todos los mensajes configurables tienen consumidores. Además, desactivar un mensaje hace que se use un texto predeterminado, no que se deje de enviar.
7. **Frontend:** es una SPA válida con shell único, pero `index.html` concentra todas las secciones y nueve modales. La implementación es monolítica y las vistas se inicializan de forma anticipada tras el login.
8. **Hallazgo adicional:** el Dashboard sí tiene un bug de inicialización relacionado con refresh: `dashboard.js` intenta cargar solo en `DOMContentLoaded`; si todavía no existe token, no vuelve a intentarlo después del login.

---

## 1. Odontograma — “Sano” limpia toda la pieza

### Recorrido real

```text
frontend/index.html
  #odontograma-modal / #odontograma-form
    -> frontend/src/js/views/pacientesView.js
       handleToothFaceClick()
       guardarToothSeleccionado()
      -> frontend/src/js/api.js
         postOdontograma()
        -> POST /api/odontograma
          -> backend/src/routes/odontogramaRoutes.js
            -> backend/src/controllers/odontogramaController.js
               postOdontograma()
              -> backend/src/services/odontogramaService.js
                 guardarEstadoCara() / guardarMeta()
                -> PostgreSQL: odontograma / odontograma_meta
```

### Representación de caras y estados

**HECHO CONFIRMADO POR CÓDIGO**

- Las caras son `vestibular`, `mesial`, `distal`, `oclusal` y `lingual` (`pacientesView.js`, constante `FACES`, línea 37).
- El frontend conserva cada valor en un `Map` con clave `diente-cara`. Por lo tanto, el modelo visual sí puede representar estados distintos por cara.
- Los estados disponibles son `sano`, `existente`, `requerido`, `corona`, `protesis_fija`, `protesis_removible` y `ausente`.
- En `handleToothFaceClick()` (`pacientesView.js`, líneas 652-668), `affectAll` es verdadero para:
  - `sano`;
  - `ausente`;
  - `protesis_fija`;
  - `protesis_removible`.
- `existente`, `requerido` y `corona` afectan únicamente la cara pulsada.

### Qué se envía al guardar

**HECHO CONFIRMADO POR CÓDIGO**

`guardarToothSeleccionado()` no envía solamente la última cara elegida. Recorre los dientes presentes en el mapa, genera una petición por cada una de sus cinco caras y ejecuta todas mediante `Promise.all()` (`pacientesView.js`, líneas 715-766).

El controller recibe una cara por petición. `guardarEstadoCara()` ejecuta:

```sql
INSERT INTO odontograma (...)
ON CONFLICT (paciente_id, diente, cara)
DO UPDATE ...
```

No existe `DELETE` en ese guardado y una llamada no actualiza otras caras. La modificación masiva nace en el frontend, no en PostgreSQL ni en `odontogramaService.js`.

### Escenarios teóricos

#### A. Vestibular requerido, oclusal existente, distal sano; cambiar solo vestibular a sano

**HECHO CONFIRMADO POR CÓDIGO**

1. El clic sobre vestibular con estado seleccionado `sano` activa `affectAll`.
2. El frontend reemplaza las cinco caras por `sano` en su `Map`.
3. Al guardar, envía cinco `POST`, uno por cara, todos con `estado = sano`.
4. El UPSERT deja las cinco filas en `sano`.

Resultado: también se pierde el estado `existente` de oclusal. Esto contradice la intención expresada de cambiar una sola cara.

**Clasificación:** **BUG CONFIRMADO POR CÓDIGO**.

#### B. Pieza marcada como ausente

**HECHO CONFIRMADO POR CÓDIGO**

`ausente` cambia las cinco caras y las persiste mediante cinco UPSERT. El frontend considera una pieza ausente solamente si todas sus caras tienen ese estado (`isToothMissing()`).

**Clasificación:** comportamiento intencional según el modelo actual.

#### C. Corona o prótesis

**HECHO CONFIRMADO POR CÓDIGO**

- `corona`: solo cambia la cara pulsada.
- `protesis_fija` y `protesis_removible`: cambian las cinco caras.

**HIPÓTESIS:** la prótesis parece modelarse deliberadamente como estado de pieza completa. Si “corona” debe representar toda la pieza o una cara es una decisión clínica que **NO SE PUEDE CONFIRMAR CON EL CÓDIGO DISPONIBLE**.

**REQUIERE PRUEBA MANUAL:** repetir A, B y C con un paciente de prueba no clínico, recargar el modal y comprobar que el estado persistido coincide con el resultado anterior.

---

## 2. Botón “Procesar recordatorios”

### Recorrido real

```text
frontend/index.html:224-230
  #turnos-process-reminders (ubicado en section-pacientes)
    -> turnosView.js / bindReminderActions()
      -> api.js / procesarRecordatoriosTurnos()
        -> POST /api/turnos/recordatorios/procesar
          -> turnosRoutes.js
            -> turnosController.js / procesarRecordatorios()
              -> recordatoriosService.js / procesarRecordatoriosAutomaticos()
                -> whatsappReminder.service.js / processAutomaticReminders()
```

### Comportamiento

**HECHO CONFIRMADO POR CÓDIGO**

- El botón está dentro de `section-pacientes`, aunque su listener pertenece a `turnosView.js`.
- El endpoint está autenticado y autorizado.
- Si `REMINDERS_ENABLED` no es `true`, devuelve un resultado deshabilitado.
- Si está habilitado, busca turnos elegibles dentro de la ventana configurada y llama a `sendAppointmentReminder()`.
- Esa función usa `sendWhatsAppMessage()`: **puede enviar mensajes reales**.
- La tabla `whatsapp_reminders` y `turnos.recordatorio_enviado_at` evitan normalmente un segundo envío del mismo recordatorio.

### Scheduler automático

`backend/src/jobs/reminderScheduler.js` ejecuta `processAutomaticReminders()` cada `WHATSAPP_REMINDER_INTERVAL_MINUTES` (10 minutos por defecto). Se inicia desde `backend/src/app.js` después de la conexión de la aplicación.

El botón duplica manualmente la porción de envío del scheduler. No ejecuta exactamente todo el callback del scheduler: el scheduler también llama a `marcarTurnosVencidosComoRealizados()`.

**Clasificación:** **HERRAMIENTA MANUAL/DEBUG**. No es necesaria para la operación normal cuando el scheduler está activo.

**Recomendación futura:** **OCULTARSE** de la interfaz normal. Si se decide conservar capacidad operativa manual, moverla a un panel administrativo/desarrollo con advertencia explícita. No conviene eliminar el endpoint sin una decisión operativa previa.

---

## 3. Turnos — el cambio se guarda y WhatsApp puede fallar

### Regla transversal

**HECHO CONFIRMADO POR CÓDIGO**

Los métodos de `turnosService.js` usan `pool.query()` sin transacción explícita para el `UPDATE`. Cada actualización queda confirmada por PostgreSQL antes de que el controller intente enviar WhatsApp. `whatsappService.js` captura los errores de envío y los convierte en una advertencia; no relanza el error.

Por lo tanto:

- un fallo de WhatsApp no revierte el turno;
- la respuesta normalmente sigue siendo HTTP 200;
- el frontend debe distinguir éxito funcional de advertencia de notificación.

### A. Confirmar una solicitud

```text
turnosView.js / submit de #edit-turno-form
  (solo estado solicitado)
  -> api.js / confirmarSolicitudTurno()
    -> PUT /api/turnos/:id/confirmar-solicitud
      -> turnosController.js / confirmarSolicitudTurno()
        -> turnosService.js / confirmarSolicitudTurno()
          -> UPDATE turnos SET estado='confirmado', fecha..., profesional...
        -> obtenerTurnoDetalle() / obtenerTelefonoPaciente()
        -> whatsappService.js / notificarConfirmacionSolicitudTurnoPorWhatsapp()
          -> whatsappClient.service.js / sendWhatsAppMessage()
        -> HTTP 200 con advertencias[] si el envío intentado falla
      -> turnosView.js muestra alerta warning o success
```

**HECHO CONFIRMADO POR CÓDIGO**

- El cambio de estado se realiza antes del envío.
- Cliente desconectado/no READY: `sendWhatsAppMessage()` lanza “WhatsApp Web no está listo”; el helper devuelve `advertencia`; la UI muestra warning.
- Paciente sin teléfono: el controller no llama al helper y conserva `advertencia: null`. La UI muestra éxito sin informar que no se notificó.

**Clasificación:** **FRÁGIL**. La separación “turno confirmado / mensaje no enviado” existe cuando se intenta enviar, pero el caso sin teléfono queda silencioso.

### B. Cancelar

```text
turnosView.js / cancelTurnoFromUi()
  -> confirmación de cancelar
  -> confirmación separada de enviar WhatsApp
  -> api.js / cancelarTurno()
    -> PUT /api/turnos/:id/cancelar
      -> turnosController.js / cancelarTurno()
        -> turnosService.js / cancelarTurno()
          -> UPDATE turnos SET estado='cancelado'
        -> si enviarMensaje=true:
           whatsappService.js / notificarCancelacionTurnoPorWhatsapp()
        -> HTTP 200 con advertencia singular si falla
      -> turnosView.js muestra warning o success
```

**HECHO CONFIRMADO POR CÓDIGO**

- La cancelación persiste antes del envío.
- La notificación es optativa y la UI lo pregunta explícitamente.
- Si se solicitó enviar y falta teléfono, el helper devuelve “Teléfono no informado” y la UI muestra warning.
- Un fallo del cliente WhatsApp tampoco revierte la cancelación.

**Clasificación:** **FRÁGIL**, aunque este flujo comunica mejor el fallo que confirmación.

### C. Reprogramar

Existen dos recorridos distintos.

#### Recorrido usado por la UI

Para `reprogramacion_solicitada`, la interfaz muestra la acción “Reprogramar”, pero el submit solamente distingue `solicitado` de todos los demás estados:

```text
turnosView.js
  estado solicitado -> confirmarSolicitudTurno()
  cualquier otro estado -> updateTurno()
```

`updateTurno()` llama a `PUT /api/turnos/:id` y `turnosService.editarTurno()`. Su SQL cambia paciente, prestación, profesional, fechas y observaciones, pero **no cambia `estado`**. En consecuencia, un turno con `reprogramacion_solicitada` puede conservar ese estado después de elegir el nuevo día y horario.

Luego el controller intenta `notificarCambioTurnoPorWhatsapp()` y devuelve `advertencias[]` si falla. Sin teléfono, vuelve a ser silencioso.

#### Endpoint dedicado

Existe `PUT /api/turnos/:id/reprogramar`:

- `turnosService.reprogramarTurno()` valida horario/solapamiento y establece `estado = reprogramado`.
- Su controller no intenta enviar WhatsApp.
- `frontend/src/js/api.js` no exporta un consumidor de este endpoint y `turnosView.js` no lo llama.

**Clasificación:** **BUG CONFIRMADO POR CÓDIGO** en la resolución de `reprogramacion_solicitada`, más una duplicación/inconsistencia de endpoints.

### Normalización del teléfono y READY

**HECHO CONFIRMADO POR CÓDIGO**

- `sendWhatsAppMessage()` comprueba `client && ready` antes de enviar.
- `normalizePhoneToChatId()` conserva `@c.us`/`@lid` o normaliza dígitos.
- Para Argentina usa por defecto país `54` y prefijo móvil `9`.
- La normalización evalúa `value.length >= 10` antes de retirar un posible `15` local. Algunos formatos argentinos con prefijo local pueden producir un identificador incorrecto.

**HIPÓTESIS:** los fallos intermitentes pueden depender tanto del estado READY como del formato almacenado. **NO SE PUEDE CONFIRMAR CON EL CÓDIGO DISPONIBLE** cuál fue la causa de cada prueba manual pasada.

### Casos manuales recomendados para una fase posterior

Usar exclusivamente pacientes y turnos sintéticos en un entorno de prueba:

1. Confirmar solicitud con WhatsApp READY y teléfono canónico `549...`.
2. Repetir con cliente desconectado; comprobar HTTP 200, turno confirmado y warning visible.
3. Repetir sin teléfono; comprobar que hoy no aparece warning en confirmación/edición.
4. Cancelar con “enviar mensaje” en no y en sí; verificar persistencia y alerta.
5. Reprogramar un turno en `reprogramacion_solicitada`; verificar el estado posterior. El código predice que queda igual.
6. Probar en entorno aislado formatos `+54 9...`, `0...`, número local con `15`, `@c.us` y `@lid`.

---

## 4. WhatsApp — posible DNI duplicado

### Flujo activo

```text
whatsappAutogestion.service.js
  handleGuidedDni()
    -> isValidStrictDni()
    -> findPacienteByDni()
       SELECT ... WHERE dni = $1
    -> para primera consulta: registerPendingRequestFromSession()
       -> createPacienteMinimo()
          -> normalizeDni()
          -> findPacienteByDni() nuevamente
          -> pacientesService.js / crearPaciente()
             -> SELECT exacto de unicidad
             -> INSERT pacientes
```

Los handlers antiguos `ASK_DNI_EXISTING` y `ASK_DNI_NEW`, que aceptaban DNI con puntos mediante `normalizeDni()`, hoy se redirigen a `resetLegacyAppointmentFlow()`. No son el flujo vigente.

### Formatos conceptuales

| Entrada recibida | Validación activa `isValidStrictDni` | Normalizado | Consultado | Eventualmente insertado |
|---|---:|---|---|---|
| `33881199` | válida | `33881199` | `33881199` | `33881199` si no existe |
| `33.881.199` | inválida | no llega al alta activa | no se consulta | no se inserta |
| `33 881 199` | inválida | no llega al alta activa | no se consulta | no se inserta |
| `33-881-199` | inválida | no llega al alta activa | no se consulta | no se inserta |
| `" 33881199 "` | válida por `trim()` | `33881199` | `33881199` | `33881199` si no existe |

### Protección real de PostgreSQL

**HECHO CONFIRMADO POR CÓDIGO Y CATÁLOGO**

- `pacientes.dni` es `VARCHAR(20) NOT NULL`.
- El esquema actual tiene dos constraints `UNIQUE (dni)` y un índice unique adicional sobre la misma columna. Es redundante, pero protege igualdad textual exacta.
- Si dos solicitudes concurrentes superan los `SELECT`, una de las inserciones exactas debe fallar por unicidad. El bot captura el error general y responde con un mensaje genérico; no crea dos filas iguales.

### Consulta agregada de solo lectura

Resultado actual, sin exponer DNI ni pacientes:

- pacientes: 7;
- DNI exactos distintos: 7;
- DNI normalizados a dígitos distintos: 7;
- filas con separadores/formato: 0;
- filas con longitud normalizada distinta de 7 u 8: 0;
- grupos duplicados después de normalizar: 0;
- filas dentro de grupos duplicados normalizados: 0.

### Asociación de persona y teléfono

**HECHO CONFIRMADO POR CÓDIGO**

`createPacienteMinimo()` identifica a la persona solo por DNI. Si existe:

- devuelve ese paciente;
- si el paciente no tiene teléfono, completa el teléfono con el del chat;
- si ya tiene teléfono, no lo reemplaza.

**HIPÓTESIS/RIESGO:** un tercero que conozca el DNI podría iniciar una solicitud asociada a esa ficha porque no hay un segundo factor de identidad. Esto no demuestra duplicación, pero sí una posible asociación incorrecta de conversación/solicitud.

**Clasificación de la observación “WhatsApp crea el mismo DNI dos veces”:** **PROTEGIDO POR BD** para el mismo valor y protegido por el flujo activo para variantes con separadores. No está reproducida en los datos actuales.

**Riesgo residual de integridad:** otras altas de pacientes aceptan texto y `pacientesService.js` compara exactamente el DNI, sin normalización compartida. La BD permitiría `33881199` y `33.881.199` como valores diferentes. El flujo activo de WhatsApp no genera hoy esa variante, pero el modelo global sigue siendo frágil.

**REQUIERE PRUEBA MANUAL:** en una base aislada, iniciar dos altas sintéticas con el mismo DNI exacto y luego probar los cinco formatos. Verificar conteos, respuesta amigable y asociación de teléfono. No usar pacientes reales.

---

## 5. Estadísticas y Reportes — supuesto refresh

### Inicialización real

**HECHO CONFIRMADO POR CÓDIGO**

1. Los módulos se importan al cargar `main.js`, pero en ese momento solo capturan referencias a elementos que ya existen en `index.html`.
2. Tras login, `setToken()` ocurre antes de `initAppOnce()`.
3. Al restaurar sesión, `getMe()` valida el token antes de `initAppOnce()`.
4. `initAppOnce()` ejecuta secuencialmente todas las vistas y usa `appInitialized` para no repetir listeners.
5. `initReportesView()` solo ejecuta `bindForm()` y `bindExport()`.
6. `initEstadisticasView()` solo ejecuta `bindForm()`.
7. Ninguna de las dos consulta la API durante su inicialización.
8. La navegación de `bindTabs()` únicamente alterna `d-none`; no dispara un hook de carga por pantalla.

Por lo tanto, Reportes y Estadísticas no consultan antes de que exista token y no tienen listeners duplicados por el flujo normal.

### Condición para mostrar datos

Ambas vistas necesitan que el usuario:

1. ingrese fecha desde;
2. ingrese fecha hasta;
3. pulse “Generar”.

No tienen rango predeterminado, carga al entrar ni estado inicial explicativo en todos sus contenedores. Navegar a la pestaña muestra deliberadamente una pantalla aún no generada.

**HIPÓTESIS:** esa ausencia de carga inicial puede percibirse como “no funciona hasta refrescar”. Sin embargo, un refresh por sí mismo no completa fechas ni ejecuta el submit.

**Clasificación del supuesto bug de inicialización:** **NO REPRODUCIBLE CON ANÁLISIS ESTÁTICO**. Si el submit no responde antes del refresh, se necesita observar consola y Network en navegador.

### Backend existente

- `GET /api/estadisticas` → `estadisticasController.obtenerEstadisticas()` → `estadisticasService.generarEstadisticas()`.
- `GET /api/reportes/atencion-facturacion` → `reportesController.reporteAtencionFacturacion()` → `reportesService.generarReporteAtencionFacturacion()`.
- Ambos endpoints están montados, autenticados y autorizados.
- Estadísticas calcula turnos por día, pacientes nuevos, prestaciones e ingresos **estimados por precio base de turnos realizados**.
- Reportes genera resumen, detalle opcional y exportación frontend CSV/impresión a PDF. No usa los pagos reales para “facturación”.

### Decisión de alcance

**HECHO:** los títulos y resultados financieros pueden hacer pensar que son reportes definitivos, aunque usan precio base de prestaciones, no cobros reales.

**Recomendación:** **OCULTAR DE NAVEGACIÓN** Estadísticas y Reportes hasta definir su alcance de tesis y su relación con Pagos. Conservar temporalmente rutas y archivos facilita retomarlos. No desmontarlos ni eliminarlos todavía.

### Hallazgo adicional: Dashboard y refresh

`frontend/src/pages/dashboard.js` sí escucha una sola vez `DOMContentLoaded` y llama a `loadStats()`. Este script se carga antes de que el usuario inicie sesión. Si no existe token, su `request()` devuelve `null` y no vuelve a cargar al completarse el login. Un refresh posterior, con token ya guardado, hace que funcione.

**Clasificación:** **BUG CONFIRMADO** de inicialización en Dashboard. También usa un cliente HTTP propio, duplicado respecto de `api.js`.

---

## 6. Configuración — mensajes automáticos

### Recorrido de edición y persistencia

```text
configuracionView.js / initConfiguracionView()
  -> loadConfiguracion()
    -> api.js / GET /api/configuracion
      -> configuracionController.obtenerConfiguracion()
        -> configuracionService.obtenerConfiguracion()
          -> SELECT configuracion_mensajes_automaticos
  -> renderMensajes()
  -> listeners delegados input/change/click
  -> #config-save-btn / bindSave()
    -> api.js / PUT /api/configuracion
      payload: consultorio + horarios + mensajes[]
      -> configuracionController.guardarConfiguracion()
        -> configuracionService.guardarConfiguracion()
          -> BEGIN
          -> UPDATE configuracion_mensajes_automaticos
          -> COMMIT
          -> obtenerConfiguracion()
      -> hydrateForm() con la respuesta fresca
```

**HECHO CONFIRMADO POR CÓDIGO**

- Los mensajes se cargan.
- Existen textareas, switches y botones para insertar placeholders.
- Los eventos actualizan `state.mensajes`.
- El botón está conectado y usa `PUT`.
- El backend valida tipo y contenido no vacío.
- Los `UPDATE` se ejecutan dentro de una transacción.
- La respuesta vuelve a hidratar la interfaz.

No hay una desconexión general entre formulario y tabla.

### Puntos concretos donde el resultado no coincide con la expectativa

#### 1. “Inactivo” usa el texto predeterminado

En `configuracionService.renderizarMensajeAutomatico()`:

```js
const contenido = mensaje?.activo
  ? mensaje.contenido
  : MENSAJES_DEFAULT_ACTUALES[tipo] || '';
```

Si el switch se desactiva, no se devuelve vacío: se usa el mensaje default. Para recordatorios esto significa que el mensaje puede seguir enviándose.

**Clasificación:** **BUG CONFIRMADO POR CÓDIGO** en la semántica de activación.

#### 2. No todos los tipos tienen consumidor activo

- `recordatorio_turno`: consumido al construir recordatorios.
- `confirmacion_turno`: consumido por la respuesta de confirmación de un recordatorio.
- `cancelacion_turno`: existe `buildCancellationReply()`, pero esa función no tiene consumidores; el flujo activo usa `buildCancellationRequestReply()` hardcodeado.
- `reprogramacion_turno`: no se pasa a `renderizarMensajeAutomatico()` en código ejecutable.
- `principal_whatsapp`: no se pasa a `renderizarMensajeAutomatico()` en código ejecutable.
- Los mensajes administrativos de editar, confirmar solicitud y cancelar turno están hardcodeados en `whatsappService.js`, por lo que no toman los textos editados en Configuración.

**Clasificación general:** **IMPLEMENTACIÓN INCOMPLETA**. Guardar funciona, pero la aplicación posterior es parcial.

#### 3. Placeholder inconsistente

El HTML informa `{enlace_reprogramacion}` y el renderer backend conoce esa variable, pero `configuracionView.js` no la incluye en `PLACEHOLDERS`, por lo que no aparece como botón de inserción. Es una mejora UX, no la causa principal.

**REQUIERE PRUEBA MANUAL:** cambiar temporalmente un mensaje en una base de prueba, guardar, recargar la pantalla y verificar por `SELECT` que persistió. Luego comprobar por cada flujo cuál usa el texto. No enviar mensajes desde la base real en esta fase.

---

## 7. Arquitectura frontend

### Inventario estructural

**HECHO CONFIRMADO POR CÓDIGO**

- `frontend/index.html`: 1.266 líneas.
- Contiene 13 elementos `<section>`, 14 formularios, 9 modales Bootstrap, 10 tablas, 4 canvas y 3 SVG.
- Secciones principales del shell: Dashboard, Pacientes, Turnos, Prestaciones/Tratamientos, Historia clínica, Pagos, Reportes, Estadísticas y Configuración.
- Modales: paciente, ficha clínica, odontograma, tratamiento, prótesis, alta de turno, edición de turno, detalle de turno y prestación.
- Archivos de vista:
  - `turnosView.js`: 1.417 líneas;
  - `pacientesView.js`: 1.120 líneas;
  - `configuracionView.js`: 412 líneas;
  - `pagosView.js`: 322 líneas;
  - `reportesView.js`: 312 líneas;
  - `estadisticasView.js`: 217 líneas;
  - `prestacionesView.js`: 182 líneas.

### Mapa actual

```text
index.html
  ├─ shell, navegación, secciones, formularios y modales
  ├─ /src/pages/dashboard.js (inicialización propia)
  └─ /src/js/main.js
      ├─ autenticación
      ├─ mapa manual data-section -> section-*
      └─ init de todas las vistas después del login
          ├─ pacientesView.js ─┐
          ├─ turnosView.js     │
          ├─ pagosView.js      ├─> api.js -> backend
          ├─ prestacionesView.js│
          ├─ reportesView.js   │
          ├─ estadisticasView.js│
          └─ configuracionView.js┘
```

Parte del HTML de tablas, cards, ficha clínica, odontograma, calendarios y mensajes se genera con `innerHTML` desde las vistas. No existe una capa formal de templates: el markup está repartido entre `index.html` y strings dentro de JS.

### Evaluación

Es una **SPA correcta con shell único** en cuanto a navegación sin recarga, pero la implementación actual es también un **index.html monolítico con vistas acopladas**.

| Aspecto | Clasificación | Evidencia |
|---|---|---|
| Shell HTML único | SIN PROBLEMA | Es válido para una SPA pequeña. |
| Todo el markup de módulos en un archivo | MANTENIBILIDAD / ACOPLAMIENTO | 1.266 líneas y nueve modales globales. |
| Vistas grandes | MANTENIBILIDAD | Turnos y Pacientes superan 1.000 líneas. |
| Inicialización ansiosa | INICIALIZACIÓN / ACOPLAMIENTO | Todas las vistas cargan datos después del login aunque estén ocultas. |
| Dashboard separado de `main.js` | DUPLICACIÓN / INICIALIZACIÓN | Cliente HTTP y ciclo de vida propios. |
| Markup en HTML y en strings JS | DUPLICACIÓN / MANTENIBILIDAD | No hay ubicación uniforme para templates. |
| Navegación solo con `d-none` | SIN PROBLEMA para el alcance actual | Simple y explicable, pero sin hooks de entrada/salida. |

### Separación futura sin abandonar la SPA

Una evolución incremental razonable sería:

```text
src/js/views/
  pacientes/
    index.js
    ficha.template.js
    odontograma.js
    documentos.js
  turnos/
    index.js
    agenda.js
    formularios.js
  pagos/
    index.js
    conceptos.js
  configuracion/
    index.js
    mensajes.js
    whatsappPanel.js
```

`index.html` conservaría el shell y contenedores raíz. Cada módulo podría insertar o administrar su template al activarse. No es necesario crear múltiples páginas HTML ni adoptar React para lograrlo.

No conviene hacer esta separación antes de estabilizar reglas de odontograma, reprogramación y DNI.

---

## 8. Inventario visual para revisión posterior

No se evaluaron colores, proporciones finales ni apariencia renderizada. Esas conclusiones requieren inspección visual manual.

| Pantalla | Render principal | Sección/modal | Elementos | Problema estructural observable | Revisión visual manual |
|---|---|---|---|---|---|
| Login | `index.html` + `main.js` | `#login-screen`, `#login-form` | card, logo, email, contraseña | Sin problema estructural relevante | responsive, foco, errores y contraste |
| Panel/Inicio | `index.html` + `pages/dashboard.js` | `#section-dashboard` | 4 KPIs, 3 charts | Bug de carga antes del token; cliente API duplicado | estados de carga/vacío y legibilidad de gráficos |
| Pacientes | `index.html` + `pacientesView.js` | `#section-pacientes`, `#paciente-modal` | filtros, tabla, paginación, alta/edición | Barra superior sobrecargada; botón de recordatorios ajeno al módulo | comportamiento móvil de filtros/acciones |
| Ficha clínica | HTML generado por `pacientesView.js` | `#ficha-modal` | datos, antecedentes, tratamientos, prótesis, documentos | Gran template dentro de JS; coexistencia confusa con pestaña “Historia clínica” vacía | jerarquía de información y scroll del modal |
| Odontograma | `index.html` + SVG generado por `pacientesView.js` | `#odontograma-modal` | SVG, leyenda, meta y formulario lateral | Lógica clínica, dibujo y persistencia en una misma vista grande | tamaño de caras, feedback de selección y uso táctil |
| Turnos | `index.html` + `turnosView.js` | `#section-turnos` y 3 modales | filtros, tabla de 9 columnas, agenda diaria/semanal, slots | Mayor concentración funcional; tabla y agenda duplican representación | densidad, responsive y claridad de estados |
| Pagos | `index.html` + `pagosView.js` | `#section-pagos` | alta, conceptos, deuda, filtros y tabla | Alta y listado en una sección extensa; alcance aún en desarrollo | prioridad visual de deuda/saldo y formularios |
| Prestaciones | `index.html` + `prestacionesView.js` | `#section-prestaciones`, `#prestacion-modal` | tabla, estado activo, formulario | Estructura pequeña y coherente | estados vacío/carga y acciones móviles |
| Configuración | `index.html` + `configuracionView.js` | `#section-configuracion` | consultorio, horarios, WhatsApp, QR, mensajes | Cuatro responsabilidades en una pantalla; mensajes parcialmente conectados | agrupación, advertencias y confirmación de guardado |
| Estadísticas | `index.html` + `estadisticasView.js` | `#section-estadisticas` | rango, KPIs, 2 SVG y tabla | Sin carga inicial ni estado introductorio; alcance indefinido | escalas, ejes y rangos sin datos |
| Reportes | `index.html` + `reportesView.js` | `#section-reportes` | rango, cards, tablas, CSV/PDF | Nombre “facturación” sin usar pagos reales; alcance indefinido | impresión, tabla ancha y estado previo a generar |

La pestaña `#section-historia` es solo un placeholder, mientras la ficha clínica real está dentro de Pacientes. Esto es una deuda de alcance/UX que puede confundir durante la defensa.

---

## 9. Clasificación final

| Observación | Evidencia encontrada | Clasificación | Capa responsable | Impacto | Prioridad | Requiere prueba manual | Acción recomendada |
|---|---|---|---|---|---|---|---|
| “Sano” limpia toda la pieza | `affectAll` incluye `sano`; se envían cinco UPSERT | BUG CONFIRMADO | Frontend / odontograma | Pérdida lógica de estados de otras caras | ALTA | Sí, para confirmar UI y recarga | Hacer `sano` por cara y probar escenarios A-C |
| Botón Procesar recordatorios visible | Está en Pacientes y llama al envío automático real | DEUDA TÉCNICA | HTML / frontend / operación | Envíos manuales accidentales y UX confusa | ALTA | No para demostrar; sí antes de retirarlo | Ocultarlo de UI normal o moverlo a administración |
| Confirmar y WhatsApp falla | UPDATE previo; warning si el intento falla; sin teléfono queda silencioso | RIESGO | Controller / integración WhatsApp | Turno correcto pero paciente no informado | ALTA | Sí | Estandarizar resultado de notificación, incluido “sin teléfono” |
| Cancelar y WhatsApp falla | UPDATE previo; envío optativo; advertencia visible | RIESGO | Controller / integración WhatsApp | Cancelación válida con notificación fallida | MEDIA | Sí | Mantener persistencia independiente y mejorar trazabilidad |
| Reprogramación solicitada | UI usa editar; SQL de editar no cambia estado; endpoint dedicado no se consume | BUG CONFIRMADO | Frontend + API de Turnos | Solicitud puede quedar pendiente tras ser resuelta | ALTA | Sí | Usar un único flujo de reprogramación que cambie estado y notifique |
| Teléfonos argentinos variables | Normalizador puede prefijar antes de retirar `15` | BUG PROBABLE | `whatsappClient.service.js` | Chat ID inválido y fallo de envío | ALTA | Sí | Definir formatos admitidos y probar tabla de normalización |
| DNI duplicado desde WhatsApp | Validación estricta, doble búsqueda y UNIQUE exacto; BD actual sin duplicados | FUNCIONAMIENTO CORRECTO | WhatsApp + Pacientes + BD | Bajo para flujo activo exacto | BAJA | Sí, para cerrar observación | Mantener protección y dar error amigable de unicidad |
| Variantes textuales del DNI por otros canales | Columna texto y comparación exacta; no hay normalizador compartido | RIESGO | Pacientes / BD | Posibles fichas duplicadas a futuro | ALTA | Sí en entorno aislado | Normalización única antes de altas y búsquedas |
| Estadísticas/Reportes requieren refresh | Listeners se atan después de auth; no hay API automática; no se halló causa estática | NO REPRODUCIBLE CON ANÁLISIS ESTÁTICO | Frontend | Módulos percibidos como rotos | MEDIA | Sí | Capturar consola/Network y definir carga al entrar |
| Estadísticas/Reportes sin alcance final | “Ingresos” usa precio base, no pagos | DECISIÓN DE ALCANCE | Producto/tesis | Puede documentar cifras ambiguas | ALTA | No | Ocultar navegación hasta definir alcance |
| Edición de mensajes automáticos | Persistencia completa, pero consumidores parciales | DEUDA TÉCNICA | Servicios WhatsApp/Configuración | Cambios guardados que no alteran ciertos mensajes | ALTA | Sí | Mapear cada tipo a un único consumidor real |
| Desactivar mensaje | `activo=false` selecciona default | BUG CONFIRMADO | `configuracionService.js` | El mensaje puede seguir enviándose | ALTA | Sí antes de corregir | Definir semántica de desactivado y respetarla |
| Dashboard solo funciona tras refresh | Carga en DOMContentLoaded antes del login y no reintenta | BUG CONFIRMADO | `pages/dashboard.js` / ciclo auth | Panel inicial queda en “-” | MEDIA | Sí | Integrar carga al ciclo autenticado de `main.js` |
| `index.html` concentra todo | 1.266 líneas, 9 modales, todas las secciones | DEUDA TÉCNICA | Arquitectura frontend | Dificulta mantenimiento y defensa | MEDIA | No | Extraer por módulo después de estabilizar funciones |

---

## 10. Orden propuesto de corrección

Los cambios siguientes son futuros y pequeños. No se implementaron en esta fase.

### 1. Normalización e integridad de DNI

- **Archivos probables:** `backend/src/services/pacientesService.js`, validadores/controladores de pacientes y `whatsappAutogestion.service.js`; migración separada solo si se decide reforzar la BD.
- **Riesgo:** alto por identidad de pacientes.
- **Prueba:** matriz de los cinco formatos, concurrencia y conteo normalizado en una copia de la BD.
- **No tocar:** turnos, odontograma, pagos ni conversaciones reales.
- **Alcance pequeño:** una función canónica compartida y tratamiento explícito de violación unique. Antes de una migración, backup y auditoría de datos.

### 2. Corregir “Sano” por cara

- **Archivo principal:** `frontend/src/js/views/pacientesView.js`.
- **Riesgo:** medio; afecta datos clínicos al guardar.
- **Prueba:** escenarios A, B y C, recarga y revisión de las cinco caras.
- **No tocar:** `odontogramaService.js`, schema ni tablas.
- **Alcance pequeño:** ajustar la lista de estados de pieza completa; no reescribir el odontograma.

### 3. Resolver correctamente `reprogramacion_solicitada`

- **Archivos probables:** `turnosView.js`, `api.js`, `turnosController.js`; decidir entre el endpoint dedicado y la edición existente.
- **Riesgo:** alto por regla de negocio y estados.
- **Prueba:** solicitud pendiente → nuevo horario → estado `reprogramado`, sin superposición, warning si WhatsApp falla.
- **No tocar:** reglas de disponibilidad, creación de solicitudes WhatsApp ni asignación automática de horarios.
- **Alcance pequeño:** unificar un solo recorrido, no refactorizar todo Turnos.

### 4. Estandarizar resultados de notificación

- **Archivos probables:** `turnosController.js`, `whatsappService.js`, `whatsappClient.service.js`, `turnosView.js`.
- **Riesgo:** medio.
- **Prueba:** READY/no READY/sin teléfono/formato inválido para confirmar, cancelar y reprogramar.
- **No tocar:** la persistencia previa del cambio; WhatsApp no debe controlar el commit del turno.
- **Alcance pequeño:** contrato común `intentado/enviado/advertencia` y mensajes UI consistentes.

### 5. Corregir semántica y consumidores de mensajes configurables

- **Archivos probables:** `configuracionService.js`, `whatsappReminder.service.js`, `whatsappService.js`, `configuracionView.js`.
- **Riesgo:** medio-alto porque puede cambiar mensajes automáticos.
- **Prueba:** uno por cada tipo, activo/inactivo y placeholders, usando un adaptador de envío simulado.
- **No tocar:** cliente real ni destinatarios reales durante pruebas.
- **Alcance pequeño:** definir qué significa inactivo y conectar solo los tipos documentados.

### 6. Retirar controles operativos de la navegación normal

- **Archivos:** `frontend/index.html`, posiblemente `turnosView.js` y `api.js` solo si se decide desmontar el listener.
- **Riesgo:** bajo si solo se oculta el botón.
- **Prueba:** scheduler sigue registrado; no quedan errores por elemento ausente.
- **No tocar:** scheduler, tracking de envío ni reglas de una sola vez.

### 7. Definir alcance de Dashboard, Estadísticas y Reportes

- **Archivos:** `index.html`, `main.js`, `pages/dashboard.js`, vistas correspondientes.
- **Riesgo:** bajo si inicialmente solo se ocultan tabs.
- **Prueba:** login con y sin sesión restaurada; navegación sin refresh; sin llamadas 401.
- **No tocar:** Pagos hasta definir de qué fuente salen los ingresos.
- **Decisión recomendada:** integrar Dashboard al ciclo autenticado; ocultar Estadísticas/Reportes mientras se especifican.

### 8. Modularización frontend incremental

- **Archivos iniciales:** primero `pacientesView.js` o `turnosView.js`, nunca ambos simultáneamente.
- **Riesgo:** medio.
- **Prueba:** smoke test completo del módulo extraído y build.
- **No tocar:** contratos HTTP ni lógica de negocio durante la extracción.
- **Alcance pequeño:** separar template/render/eventos por módulo, manteniendo la SPA.

### 9. Revisión visual manual

- **Archivos:** a decidir después del inventario renderizado.
- **Riesgo:** bajo si no mezcla cambios funcionales.
- **Prueba:** escritorio y móvil, estados vacío/carga/error, teclado y modales.
- **No tocar:** reglas de negocio ni servicios mientras se ajusta presentación.

---

## 11. Validaciones ejecutadas

### Análisis estático

- Búsqueda de rutas, consumidores y funciones: correcta.
- `node --check` sobre los 58 archivos JavaScript de `backend/src`: **CORRECTO**.
- `npm run build` en frontend: **CORRECTO**; Vite transformó 90 módulos.
- `git diff --check` antes de crear este informe: **CORRECTO**.

### PostgreSQL

- Se ejecutaron únicamente consultas `SELECT` agregadas y consultas al catálogo.
- No se mostraron DNI, teléfonos, nombres ni otros datos individuales.
- No se ejecutaron escrituras ni DDL.

### Pendiente manual

Las reproducciones que podrían enviar WhatsApp, crear pacientes, modificar turnos o cambiar datos clínicos quedaron expresamente pendientes para un entorno seguro. En esos casos, el informe indica **REQUIERE PRUEBA MANUAL**.

---

## Confirmación final

CÓDIGO MODIFICADO: NO  
BASE DE DATOS MODIFICADA: NO  
DATOS CLÍNICOS MODIFICADOS: NO  
PACIENTES CREADOS: NO  
TURNOS MODIFICADOS: NO  
MENSAJES WHATSAPP ENVIADOS: NO  
MIGRACIONES EJECUTADAS: NINGUNA

ARCHIVOS CREADOS:

- `DIAGNOSTICO_FUNCIONAL_FASE2.md`
