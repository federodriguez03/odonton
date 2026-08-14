# FASE 2B.4C.1 - Diagnóstico del ciclo de `turno_solicitudes`

Fecha del diagnóstico: 2026-08-14  
Alcance: lectura estática de `backend/src` y `frontend/src`, más consultas agregadas y de trazabilidad ejecutadas sobre PostgreSQL dentro de una transacción `BEGIN READ ONLY`, cerrada con `ROLLBACK`.  
No se expusieron nombres, DNI, teléfonos, mensajes ni otros datos personales.

## 1. Conclusión ejecutiva

La inconsistencia no es solamente histórica ni proviene exclusivamente de un flujo legacy. Sigue siendo reproducible en el código actual.

El proyecto mantiene dos representaciones relacionadas:

1. `turnos.estado` representa el estado operativo del turno.
2. `turno_solicitudes.estado` representa si la petición del paciente sigue pendiente o ya terminó.

Algunas transiciones actualizan ambas representaciones, pero otras solo actualizan `turnos`. Los caminos incompletos comprobados son:

- confirmar una solicitud de turno: el turno pasa de `solicitado` a `confirmado`, pero la solicitud queda `pendiente`;
- aceptar una cancelación: el turno pasa a `cancelado`, pero la solicitud queda `pendiente`;
- cancelar un turno que conserva cualquier otra solicitud pendiente: no se cierra esa solicitud;
- marcar automáticamente un turno vencido como `realizado`: no se cierran solicitudes pendientes relacionadas.

La consulta actual encontró 11 solicitudes pendientes: 9 vinculadas con turnos cancelados, 1 con un turno realizado y 1 con un turno futuro confirmado. En el diagnóstico anterior se habían identificado 7 inconsistencias terminales; esas siete continúan y ahora existen 3 terminales adicionales. Esto aporta evidencia directa de que el defecto continúa activo.

## 2. Inventario real de tipos y estados

### 2.1 Tipos de solicitud escritos por el código

| Tipo real | Uso | Principales creadores |
|---|---|---|
| `nuevo_turno` | Paciente existente solicita un nuevo turno | `registerPendingRequestFromSession()` en `whatsappAutogestion.service.js` |
| `primera_consulta` | Paciente nuevo solicita su primera consulta | `registerPendingRequestFromSession()` en `whatsappAutogestion.service.js` |
| `reprogramacion` | Solicitud de cambiar un turno vigente | `handleGuidedDni()`, `startRescheduleFlow()` y `registerAppointmentRequestFromReminder()` |
| `cancelacion` | Solicitud de cancelar un turno vigente | `handleGuidedConfirmCancellation()`, `handleManagedCancelConfirm()` y `registerAppointmentRequestFromReminder()` |

Además de los tres tipos mínimos indicados para la auditoría, `primera_consulta` es un tipo real y activo. No se encontraron otros valores escritos por código ejecutable.

### 2.2 Estados escritos por el código

| Estado | Quién lo escribe | Significado observado |
|---|---|---|
| `pendiente` | `crearSolicitudTurnoPendiente()` y la normalización de `asegurarTablaTurnoSolicitudes()` | La petición todavía requiere una decisión o vinculación operativa |
| `resuelta` | `reprogramarTurno()` | La reprogramación solicitada fue atendida |
| `rechazada` | `rechazarSolicitudTurno()` | El odontólogo rechazó la solicitud |

No existe restricción `CHECK` para `tipo_solicitud` ni para `estado`. La única constraint declarada en la tabla es su clave primaria. Tampoco existen triggers sobre `turno_solicitudes`. Por lo tanto, la coherencia depende completamente de los services.

### 2.3 Valores existentes actualmente en PostgreSQL

| `tipo_solicitud` | `estado` | Cantidad |
|---|---:|---:|
| `cancelacion` | `pendiente` | 4 |
| `nuevo_turno` | `pendiente` | 5 |
| `nuevo_turno` | `rechazada` | 2 |
| `primera_consulta` | `pendiente` | 1 |
| `reprogramacion` | `pendiente` | 1 |

Resumen por estado:

- `pendiente`: 11;
- `rechazada`: 2;
- `resuelta`: 0.

`resuelta` es un estado implementado, pero no hay filas con ese valor en la fotografía actual de la base.

### 2.4 Funciones que crean o vinculan solicitudes

- `crearSolicitudTurnoPendiente()` (`turnoSolicitudesService.js:81`): inserta siempre con `estado = 'pendiente'`.
- `crearSolicitudPendienteSiNoExiste()` (`turnoSolicitudesService.js:157`): evita duplicados solamente por combinación exacta de `turno_id`, `tipo_solicitud` y `pendiente`; luego delega la inserción.
- `registerPendingRequestFromSession()` (`whatsappAutogestion.service.js:460`): para `nuevo_turno` o `primera_consulta` crea primero un turno `solicitado` y luego una solicitud pendiente vinculada.
- `handleGuidedDni()` (`whatsappAutogestion.service.js:948`): abre una reprogramación pendiente; para cancelación continúa hacia confirmación del paciente.
- `handleGuidedConfirmCancellation()` (`whatsappAutogestion.service.js:1192`): crea o reutiliza la cancelación pendiente y lleva el turno a `cancelacion_solicitada`.
- `handleManagedCancelConfirm()` (`whatsappAutogestion.service.js:1780`): hace lo mismo desde el flujo administrado por teléfono.
- `startRescheduleFlow()` (`whatsappAutogestion.service.js:1971`): crea o reutiliza la reprogramación pendiente y lleva el turno a `reprogramacion_solicitada`.
- `registerAppointmentRequestFromReminder()` (`whatsappReminder.service.js:431`): crea cancelaciones o reprogramaciones desde la respuesta a un recordatorio.
- `sincronizarSolicitudesPendientesConTurnos()` (`turnoSolicitudesService.js:329`): para una solicitud `nuevo_turno`/`primera_consulta` sin turno crea un turno `solicitado`, lo vincula y conserva correctamente la solicitud como pendiente.

Las aperturas de cancelación y reprogramación crean la solicitud y modifican el turno mediante consultas separadas. Normalmente producen un par coherente, pero no son atómicas: un error o una carrera entre ambas operaciones podría dejar una solicitud pendiente asociada a un estado no correspondiente.

### 2.5 Funciones que cambian el estado de solicitudes

- `reprogramarTurno()` (`turnosService.js:312`): `pendiente` a `resuelta`, solamente para `reprogramacion` del turno reprogramado.
- `rechazarSolicitudTurno()` (`turnosService.js:546`): `pendiente` a `rechazada`, filtrando el tipo según el estado previo del turno.
- `asegurarTablaTurnoSolicitudes()` (`turnoSolicitudesService.js:35`): normaliza estados nulos a `pendiente`; no representa una decisión de negocio.

No existe una operación general que cierre solicitudes cuando un turno llega a un estado terminal.

## 3. Recorrido de nuevo turno

### 3.1 Apertura

Flujo actual guiado:

`WhatsApp` → `processAutogestionMessage()` → handlers guiados → `handleGuidedConfirmRequest()` → `registerPendingRequestFromSession()` → `crearSolicitudTurno()` + `crearSolicitudTurnoPendiente()`.

Resultado esperado y real en la apertura:

- `turnos.estado = 'solicitado'`;
- `turno_solicitudes.tipo_solicitud IN ('nuevo_turno', 'primera_consulta')`;
- `turno_solicitudes.estado = 'pendiente'`.

Este par es coherente mientras espera la decisión del odontólogo.

### 3.2 Confirmación por el odontólogo

Recorrido:

`turnosView.js:1259` → `PUT /api/turnos/:id/confirmar-solicitud` → `turnosController.confirmarSolicitudTurno()` → `turnosService.confirmarSolicitudTurno()`.

Resultado real:

- `turnos.estado`: `solicitado` → `confirmado`;
- se completa profesional, prestación, fecha, duración y `solicitud_confirmada_at`;
- `turno_solicitudes.estado`: no se actualiza y queda `pendiente`.

Conclusión: camino incorrecto y actualmente reproducible.

### 3.3 Rechazo por el odontólogo

Recorrido:

`turnosView.js:1353` → `PUT /api/turnos/:id/rechazar-solicitud` → `turnosController.rechazarSolicitudTurno()` → `turnosService.rechazarSolicitudTurno()`.

Resultado real:

- si el turno estaba `solicitado`, pasa a `rechazado`;
- las solicitudes pendientes `nuevo_turno` o `primera_consulta` pasan a `rechazada`.

Conclusión: el resultado funcional es correcto. Sin embargo, los dos `UPDATE` se ejecutan por separado y no dentro de una única transacción. Si falla el segundo, el turno podría quedar rechazado y la solicitud pendiente. Además, el error de tabla inexistente se captura y permite devolver éxito parcial.

### 3.4 Cancelación o realización posterior

Una vez confirmada la petición original, su solicitud ya debería estar `resuelta`. Hoy no ocurre. Por eso:

- `cancelarTurno()` cambia solamente el turno a `cancelado` y conserva la solicitud pendiente;
- `marcarTurnosVencidosComoRealizados()` cambia solamente el turno a `realizado` y conserva la solicitud pendiente.

Estos dos caminos no originan el primer desajuste del nuevo turno, pero lo vuelven terminal y más visible.

## 4. Recorrido de reprogramación

### 4.1 Apertura

Los flujos actuales de WhatsApp crean o reutilizan una solicitud:

- `tipo_solicitud = 'reprogramacion'`;
- `estado = 'pendiente'`;
- `turno_id` vinculado al turno vigente;
- el turno pasa a `reprogramacion_solicitada`.

La creación de la solicitud y el cambio del turno se ejecutan mediante consultas separadas, por lo que existe un riesgo de atomicidad aunque el camino normal sea coherente.

### 4.2 Aceptación

`PUT /api/turnos/:id/reprogramar` → `turnosController.reprogramarTurno()` → `turnosService.reprogramarTurno()`.

La sentencia CTE de `turnosService.js:337-356` realiza conjuntamente:

- turno → `reprogramado`;
- solicitudes `reprogramacion` pendientes del turno → `resuelta`.

Este es el camino principal corregido en FASE 2B.1 y continúa correcto.

### 4.3 Rechazo

`rechazarSolicitudTurno()` devuelve el turno a `programado` y cambia la solicitud `reprogramacion` pendiente a `rechazada`.

El resultado normal es correcto, con el mismo riesgo de no atomicidad señalado para el rechazo de nuevo turno.

### 4.4 Caminos alternativos

- Si se cancela el turno mientras está `reprogramacion_solicitada`, `cancelarTurno()` admite ese estado pero no cierra la solicitud. Resultado: `pendiente + cancelado`.
- El lifecycle no marca directamente como realizado un turno en `reprogramacion_solicitada`, porque solo procesa `programado`, `confirmado` y `reprogramado`.
- Reprogramar mediante el endpoint específico usa `reprogramarTurno()` y cierra correctamente la solicitud.
- `editarTurno()` admite `reprogramacion_solicitada`, pero solo edita datos; no termina el flujo ni cambia el estado. Desde la UI actual, ese estado se deriva al endpoint específico de reprogramación, aunque un consumidor directo del endpoint genérico podría dejarlo abierto.
- Las funciones antiguas `handleConfirmReschedule()` y otras del selector automático permanecen en el archivo, pero los estados de sesión asociados se desvían a `resetLegacyAppointmentFlow()`. No son el origen ejecutable actual de las inconsistencias encontradas.

## 5. Recorrido de cancelación

### 5.1 Apertura

La cancelación se crea desde los handlers guiados/administrados o desde una respuesta a recordatorio:

- se crea o reutiliza `turno_solicitudes(tipo_solicitud='cancelacion', estado='pendiente')`;
- el turno pasa a `cancelacion_solicitada`;
- el paciente recibe una aclaración correcta: todavía no está cancelado definitivamente.

### 5.2 Aceptación

La UI muestra “Cancelar turno” y utiliza el mismo endpoint general:

`turnosView.js:1286` → `PUT /api/turnos/:id/cancelar` → `turnosController.cancelarTurno()` → `turnosService.cancelarTurno()`.

Resultado real:

- turno → `cancelado` y se informa `fecha_cancelacion`;
- solicitud `cancelacion` → permanece `pendiente`.

No existe otro endpoint de aceptación que cierre esa solicitud. Este es un bug actual.

### 5.3 Rechazo

El endpoint `/:id/rechazar-solicitud`:

- devuelve el turno de `cancelacion_solicitada` a `programado`;
- cambia la solicitud `cancelacion` pendiente a `rechazada`.

El resultado normal es correcto, pero no es transaccional.

### 5.4 Otros cierres

- Cancelar desde cualquier pantalla termina en el mismo `cancelarTurno()`, que no cierra ninguna solicitud.
- El lifecycle no procesa directamente `cancelacion_solicitada`; por eso no debería llevar ese estado a realizado. Si el turno vuelve primero a un estado activo y existe una solicitud residual, el lifecycle sí podrá realizar el turno y la solicitud seguirá pendiente.
- La base actual demuestra que un turno cancelado puede conservar cancelaciones pendientes: hay 4 casos.

## 6. Cambios de estado de `turnos` en código ejecutable

| Archivo y función | Transición/escritura | ¿Actualiza solicitudes? | Evaluación |
|---|---|---:|---|
| `turnosService.js` / `crearTurno()` | inserta `programado` | NO CORRESPONDE | Alta manual sin solicitud asociada |
| `turnosService.js` / `crearSolicitudTurno()` | inserta `solicitado` | NO, lo hace el orquestador inmediatamente después | Correcto en flujo normal, no atómico |
| `turnosService.js` / `reprogramarTurno()` | activo o `reprogramacion_solicitada` → `reprogramado` | SÍ | Cierra `reprogramacion` como `resuelta` en la misma sentencia |
| `turnosService.js` / `cancelarTurno()` | estados cancelables → `cancelado` | NO | Fuga comprobada |
| `turnosService.js` / `confirmarTurno()` | `programado` → `confirmado` | NO CORRESPONDE en uso normal | Función exportada sin consumidor encontrado; defensivamente no repara pendientes previas |
| `turnosService.js` / `confirmarSolicitudTurno()` | `solicitado` → `confirmado` | NO | Fuga comprobada para `nuevo_turno`/`primera_consulta` |
| `turnosService.js` / `rechazarSolicitudTurno()` | `solicitado` → `rechazado`; solicitudes de cambio → `programado` | SÍ | Correcto en resultado normal; dos consultas no atómicas |
| `turnoLifecycle.service.js` / `marcarTurnosVencidosComoRealizados()` | activo vencido → `realizado` | NO | Fuga defensiva y un caso histórico comprobado |
| `whatsappAutogestion.service.js` / handlers actuales | activo → `reprogramacion_solicitada` o `cancelacion_solicitada` | SÍ, abre antes una pendiente | Apertura coherente en caso exitoso, pero no atómica |
| `whatsappReminder.service.js` / `processPatientReply()` | `programado`/`confirmado` → confirmado o estado de solicitud | SÍ para abrir cancelación/reprogramación; NO CORRESPONDE para confirmar recordatorio | La confirmación del recordatorio no representa una fila de `turno_solicitudes` |
| `whatsappAutogestion.service.js` / `handleConfirmAppointment()` | `programado` → `confirmado` | NO CORRESPONDE | Implementación legacy no alcanzada por el dispatcher actual |
| `whatsappAutogestion.service.js` / `handleConfirmReschedule()` | `reprogramado` → `confirmado` | SÍ previamente, mediante `reprogramarTurno()` | Implementación legacy no alcanzada; no explica los casos actuales |

No se encontraron otros escritores de `confirmado`, `rechazado`, `cancelado`, `reprogramado` o `realizado` en `backend/src`.

## 7. Scheduler y lifecycle

`app.js:78` inicia `startReminderScheduler()`. El intervalo configurado ejecuta, en este orden:

1. `marcarTurnosVencidosComoRealizados()`;
2. `processAutomaticReminders()`.

`marcarTurnosVencidosComoRealizados()` selecciona hasta 50 turnos en `programado`, `confirmado` o `reprogramado` cuyo `fecha_hora_fin <= NOW()`, los cambia a `realizado` y registra `APPOINTMENT_MARKED_COMPLETED_AUTOMATICALLY`.

No consulta ni actualiza `turno_solicitudes`. Por lo tanto, si un turno activo conserva una solicitud pendiente por una fuga anterior, el cierre automático mantiene la inconsistencia. La auditoría confirma que esto ocurrió en una de las siete filas históricas.

## 8. Clasificación actual de solicitudes pendientes

Fotografía de PostgreSQL al 2026-08-14. Las categorías A-F son conteos agregados y no contienen información personal.

| Grupo | Condición | Cantidad | Coherencia |
|---|---|---:|---|
| A | pendiente + turno `cancelado` | 9 | Inconsistente |
| B | pendiente + turno `realizado` | 1 | Inconsistente |
| C | pendiente + turno `rechazado` | 0 | Sin casos actuales |
| D | pendiente + turno futuro vigente | 1 | Es un `nuevo_turno` ya `confirmado`; inconsistente porque la aceptación ya ocurrió |
| E | pendiente + turno `solicitado` | 0 | Sería coherente mientras espera decisión |
| F | pendiente + `turno_id IS NULL` | 0 | Sería coherente temporalmente para nuevo turno/primera consulta antes de sincronizar |

Control adicional:

- solicitudes pendientes con `turno_id` que no existe: 0;
- total pendiente: 11;
- la suma A-F es 11 y no quedan casos fuera de esas categorías en la fotografía actual.

Desglose de las 10 inconsistencias terminales:

| Tipo | Estado final del turno | Cantidad |
|---|---|---:|
| `cancelacion` | `cancelado` | 4 |
| `nuevo_turno` | `cancelado` | 3 |
| `nuevo_turno` | `realizado` | 1 |
| `primera_consulta` | `cancelado` | 1 |
| `reprogramacion` | `cancelado` | 1 |

## 9. Causa de las siete solicitudes históricas

### 9.1 Evidencia conjunta

Las siete filas originales no cambiaron su `updated_at` desde que fueron creadas. En cambio, sus turnos sí registran marcas y eventos posteriores. El historial permite reconstruir los grupos sin exponer pacientes:

| Tipo de las siete | Cantidad | Transición posterior comprobada | Función responsable probable/comprobada | Por qué no se cerró |
|---|---:|---|---|---|
| `nuevo_turno` | 3 | `solicitado` → `confirmado` → `cancelado` | `confirmarSolicitudTurno()` y luego `cancelarTurno()`; ambas acciones constan en auditoría | Ninguna de las dos funciones actualiza estas solicitudes |
| `nuevo_turno` | 1 | `solicitado` → `confirmado` → `realizado` | `confirmarSolicitudTurno()` y luego `marcarTurnosVencidosComoRealizados()`; ambas acciones constan en auditoría | Ninguna de las dos funciones actualiza estas solicitudes |
| `cancelacion` | 2 | estado activo → `cancelacion_solicitada` → `cancelado` | `cancelarTurno()`; la cancelación final consta en auditoría | La aceptación cambia solo `turnos` |
| `reprogramacion` | 1 | `reprogramacion_solicitada` → `cancelado` antes de resolverse | `cancelarTurno()` es la transición consistente con el estado permitido y consta la cancelación del turno | La cancelación admite `reprogramacion_solicitada`, pero no cierra solicitudes |

### 9.2 Clasificación solicitada

- BUG ACTUAL AÚN REPRODUCIBLE: 7 de 7.
- DATO GENERADO POR FLUJO LEGACY YA RETIRADO: 0 de 7 confirmados.
- INCIERTO: 0 de 7 respecto de la causa de permanencia pendiente.

En la solicitud de reprogramación no hay suficiente auditoría para asegurar qué variante exacta del bot creó la petición, pero sí se puede confirmar la causa de que permaneciera pendiente: la cancelación posterior no la cerró. Esa misma fuga sigue en `cancelarTurno()`.

### 9.3 Evidencia de reproducción posterior

Después de aquellas siete aparecieron tres inconsistencias terminales adicionales:

- una `primera_consulta` confirmada y luego cancelada;
- una cancelación del mismo turno aceptada sin cierre;
- una cancelación solicitada sobre un turno de origen interno y aceptada el mismo día sin cierre.

Además existe una solicitud `nuevo_turno` pendiente cuyo turno futuro ya está `confirmado`. No hace falta esperar su cancelación o realización para considerarla incoherente: el flujo que representaba ya fue aceptado.

## 10. Invariante propuesta

Una fila de `turno_solicitudes` puede permanecer `pendiente` únicamente si cumple una de estas combinaciones:

| Tipo | Estado de turno permitido mientras está pendiente |
|---|---|
| `nuevo_turno` o `primera_consulta` | `turno_id IS NULL`, o turno `solicitado` |
| `reprogramacion` | turno `reprogramacion_solicitada` |
| `cancelacion` | turno `cancelacion_solicitada` |

Una solicitud no puede permanecer pendiente si:

- el turno fue `confirmado`, `reprogramado`, `cancelado`, `realizado` o `rechazado` de forma incompatible con el tipo;
- el flujo que representa ya fue aceptado o rechazado;
- su `turno_id` apunta a un turno inexistente.

Regla de cierre recomendada:

- aceptación de nuevo turno/primera consulta → `resuelta`;
- aceptación de reprogramación → `resuelta`;
- aceptación de cancelación → `resuelta`;
- rechazo explícito → `rechazada`;
- llegada defensiva a `cancelado` o `realizado` → ninguna solicitud asociada puede seguir pendiente.

## 11. Capa responsable de mantener la consistencia

| Opción | Ventaja | Problema | Evaluación para Odonton |
|---|---|---|---|
| A. Cada service que modifica turnos actualiza solicitudes | Cambio inicial directo | Duplica filtros y vuelve fácil olvidar un nuevo escritor, que es precisamente el defecto actual | Aceptable solo como parche puntual |
| B. Helper/service central de transición | Mantiene una regla única, reutilizable y testeable dentro de Controller → Service → PostgreSQL | Requiere pasar el mismo cliente/transacción a las dos actualizaciones | Recomendada |
| C. Trigger PostgreSQL | Cubre escrituras externas | Oculta lógica de negocio, complica la explicación oral y no distingue con claridad aceptación de rechazo | No recomendado |
| D. Job periódico reparador | Detectaría residuos | Corrige tarde, oculta el error original y no garantiza atomicidad | Útil solo como diagnóstico, no como fuente de verdad |

Recomendación: opción B. Incorporar en la capa service un helper pequeño que reciba un cliente PostgreSQL y cierre las solicitudes pendientes del turno según la transición. El cambio de `turnos` y el cierre de solicitudes deben ejecutarse dentro de la misma transacción. Esto respeta la arquitectura real y es sencillo de defender: “el service aplica de manera atómica el cambio de estado y sus efectos relacionados”.

No se recomienda un trigger.

## 12. Propuesta de FASE 2B.4C.2

### PARTE A — Evitar nuevas inconsistencias

#### Cambio mínimo propuesto

1. En `turnoSolicitudesService.js`, agregar un helper de datos que acepte un `client`, `turnoId`, tipos afectados y estado final (`resuelta` o `rechazada`). No debe abrir su propia transacción.
2. En `turnosService.js`:
   - hacer atómica la confirmación de solicitud y resolver `nuevo_turno`/`primera_consulta`;
   - hacer atómica la cancelación y resolver la solicitud `cancelacion`; defensivamente cerrar cualquier otra pendiente incompatible con `cancelado`;
   - hacer atómico el rechazo existente;
   - conservar el CTE correcto de reprogramación o hacerlo usar el mismo helper sin cambiar su regla.
3. En `turnoLifecycle.service.js`, cambiar a `realizado` y cerrar defensivamente solicitudes pendientes de esos mismos turnos dentro de una operación transaccional/CTE.
4. En un segundo ajuste de seguridad, revisar las aperturas de cancelación y reprogramación en `whatsappAutogestion.service.js` y `whatsappReminder.service.js` para que crear la solicitud y pasar el turno al estado solicitado sea atómico. No cambiar la regla del bot ni asignar horarios.

#### Riesgo

- Riesgo funcional: MEDIO, porque afecta todas las transiciones centrales de solicitudes.
- Riesgo de datos: BAJO si cada operación usa una transacción y solo actualiza filas `estado='pendiente'` del `turno_id` correspondiente.
- Riesgo de WhatsApp: BAJO para el cierre; MEDIO al volver atómicas las aperturas por la cantidad de entrypoints duplicados.

#### Pruebas necesarias

- pruebas unitarias del helper por tipo y estado;
- pruebas de integración por endpoint con lectura de ambas tablas después de cada transición;
- prueba de rollback forzado entre el `UPDATE turnos` y el `UPDATE turno_solicitudes`;
- prueba del scheduler con un turno vencido y una solicitud residual preparada en una base de prueba;
- prueba de duplicado y concurrencia al crear cancelación/reprogramación desde WhatsApp, sin enviar mensajes reales.

### PARTE B — Sanear datos históricos

Precondiciones:

1. confirmar un backup completo reciente inmediatamente antes del saneamiento;
2. repetir los SELECT de control y guardar solamente conteos/IDs técnicos para trazabilidad;
3. desplegar y validar primero la PARTE A, para no volver a producir filas inconsistentes.

Diseño conceptual de la actualización, que **no fue ejecutada**:

```sql
BEGIN;

-- Solicitudes cuyo flujo fue aceptado o quedó definitivamente cerrado.
UPDATE turno_solicitudes AS ts
SET estado = 'resuelta',
    updated_at = NOW()
FROM turnos AS t
WHERE ts.turno_id = t.id
  AND ts.estado = 'pendiente'
  AND (
    t.estado IN ('cancelado', 'realizado')
    OR (
      ts.tipo_solicitud IN ('nuevo_turno', 'primera_consulta')
      AND t.estado IN ('programado', 'confirmado', 'reprogramado')
    )
    OR (
      ts.tipo_solicitud = 'reprogramacion'
      AND t.estado IN ('reprogramado', 'confirmado')
    )
  );

-- Solicitudes asociadas a un rechazo definitivo.
UPDATE turno_solicitudes AS ts
SET estado = 'rechazada',
    updated_at = NOW()
FROM turnos AS t
WHERE ts.turno_id = t.id
  AND ts.estado = 'pendiente'
  AND t.estado = 'rechazado';

-- Ejecutar nuevamente los conteos A-F antes de confirmar.
-- COMMIT solamente si los conteos y filas afectadas coinciden con el control previo.
COMMIT;
```

Observaciones para la ejecución futura:

- no borrar solicitudes;
- no alterar `created_at`, tipo, turno ni datos originales;
- conservar las filas y su transición de estado como trazabilidad;
- las combinaciones ambiguas que no entren en los predicados deben revisarse, no actualizarse por aproximación;
- registrar en el informe de ejecución los conteos antes/después y la migración/script exacto utilizado.

## 13. Escenarios de prueba futuros

| # | Escenario | Estado esperado del turno | Estado esperado de la solicitud |
|---:|---|---|---|
| 1 | `nuevo_turno` confirmado | `confirmado` | `resuelta`; ninguna pendiente del tipo nuevo/primera |
| 2 | `nuevo_turno` rechazado | `rechazado` | `rechazada` |
| 3 | reprogramación aceptada | `reprogramado` | `resuelta` |
| 4 | reprogramación rechazada | `programado` | `rechazada` |
| 5 | cancelación aceptada | `cancelado` | `resuelta` |
| 6 | cancelación rechazada | `programado` | `rechazada` |
| 7 | turno finalizado automáticamente | `realizado` | ninguna solicitud incompatible permanece pendiente |
| 8 | solicitud nueva todavía sin turno | sin turno asociado | permanece `pendiente` correctamente |

Pruebas adicionales recomendadas:

- cancelar un turno mientras tiene una reprogramación pendiente;
- confirmar una primera consulta;
- forzar un error en el segundo paso de cada transición y comprobar rollback total;
- ejecutar dos solicitudes simultáneas del mismo tipo y comprobar que no queden duplicados pendientes;
- verificar que una respuesta de confirmación a recordatorio no cierre solicitudes que no corresponden.

## 14. Resumen solicitado

**TIPOS DE SOLICITUD:** `nuevo_turno`, `primera_consulta`, `reprogramacion`, `cancelacion`.

**ESTADOS:** el código escribe `pendiente`, `resuelta` y `rechazada`; PostgreSQL contiene actualmente `pendiente` y `rechazada`, sin filas `resuelta`.

**CAMINOS QUE CIERRAN CORRECTAMENTE:** reprogramación aceptada; rechazo de nuevo turno, primera consulta, reprogramación o cancelación en el camino normal.

**CAMINOS QUE DEJAN PENDIENTES:** confirmación de nuevo turno/primera consulta; aceptación de cancelación; cancelación de un turno con cualquier solicitud residual; lifecycle automático a realizado. Las aperturas WhatsApp también tienen riesgo de consistencia por no ser atómicas.

**PROCESOS AUTOMÁTICOS:** `reminderScheduler` ejecuta `marcarTurnosVencidosComoRealizados()`, que no cierra solicitudes.

**INCONSISTENCIAS ACTUALES POR GRUPO:** A=9, B=1, C=0, D=1, E=0, F=0.

**CAUSA DE LAS 7 SOLICITUDES:** actual=7; legacy confirmado=0; incierta respecto de la causa de permanencia=0. La variante creadora exacta de una reprogramación no puede probarse, pero su fuga posterior sí.

**INVARIANTE PROPUESTA:** una solicitud pendiente solo puede no tener turno todavía o estar vinculada al estado de turno que representa; ninguna puede seguir pendiente después de aceptación, rechazo, cancelación o realización.

**CAPA RECOMENDADA PARA MANTENERLA:** helper/service central de transición, usado por los services dentro de la misma transacción PostgreSQL.

**PROPUESTA 2B.4C.2:** primero impedir nuevas fugas con transiciones atómicas y pruebas; después, con backup y controles, actualizar explícitamente los estados históricos sin eliminar filas.

## 15. Confirmaciones de esta fase

- CÓDIGO MODIFICADO: NO
- BASE DE DATOS MODIFICADA: NO
- SOLICITUDES MODIFICADAS: NO
- TURNOS MODIFICADOS: NO
- WHATSAPP ENVIADO: NO
- MIGRACIONES EJECUTADAS: NINGUNA
- ARCHIVO CREADO: `DIAGNOSTICO_CICLO_SOLICITUDES.md`
