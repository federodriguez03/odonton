# Diagnóstico del bot: identificación y actividad del paciente

Fecha del diagnóstico: 2026-08-14
Fase: 2B.4A
Alcance: análisis estático y consultas PostgreSQL `SELECT` dentro de una transacción `READ ONLY`.

## 1. Conclusión ejecutiva

El problema fue reproducido y tiene dos componentes relacionados:

1. `pacienteTieneTurnoOSolicitudActiva()` considera activa cualquier fila de `turno_solicitudes` cuyo estado textual continúe siendo `pendiente`, sin comprobar la situación del turno asociado ni la antigüedad de la solicitud.
2. La base conserva solicitudes históricas en estado `pendiente` asociadas a turnos que ya están `cancelado` o `realizado`.

Para el DNI analizado no existe ningún turno futuro realmente activo. Tampoco existe una solicitud realmente pendiente en términos de negocio. El registro que devuelve actualmente el `LIMIT 1` es la solicitud `id=9`, tipo `nuevo_turno`, estado `pendiente`, vinculada al turno `id=17`, que está `realizado` desde el 2026-06-08.

Clasificación principal: **SOLICITUD VIEJA CONSIDERADA ACTIVA**.

La causa estructural es una **DEFINICIÓN INCONSISTENTE DE ESTADO ACTIVO** y una falta de sincronización del estado de solicitudes cuando ciertos turnos son confirmados, cancelados o realizados.

## 2. Origen y recorrido del mensaje

El texto se define como `ACTIVE_DUPLICATE_MESSAGE` en:

- `backend/src/services/whatsappAutogestion.service.js`, línea 34.

Puede enviarse desde dos puntos del flujo vigente:

1. En `handleGuidedDni()`, después de identificar por DNI a un paciente que solicita un turno nuevo.
2. En `handleGuidedConfirmRequest()`, si la comprobación final previa al alta detecta actividad concurrente.

Recorrido completo:

```text
Mensaje entrante de WhatsApp
  -> whatsappClient.service.js / handleIncomingMessage()
  -> detección de intención o sesión activa
  -> whatsappAutogestion.service.js / processAutogestionMessage()
  -> handleGuidedMenu(): opción 1, Sacar turno
  -> handleGuidedPatientType(): existente o primera vez
  -> handleGuidedDni()
  -> findPacienteByDni()
  -> pacienteTieneTurnoOSolicitudActiva()
  -> consulta de turnos
  -> consulta de turno_solicitudes si no encontró turno
  -> ACTIVE_DUPLICATE_MESSAGE si activa=true
```

`whatsappClient.service.js` no decide si el paciente posee actividad. Sólo recibe el evento, descarta mensajes no procesables, determina el contexto y delega en `processAutogestionMessage()`.

## 3. Función y consultas que producen el bloqueo

La función equivalente a `hasActiveTurnOrRequest()` es:

```text
turnoSolicitudesService.pacienteTieneTurnoOSolicitudActiva()
```

### 3.1 Turno considerado activo

Estados configurados en `ESTADOS_TURNO_ACTIVO`:

```text
programado
confirmado
reprogramado
solicitado
reprogramacion_solicitada
cancelacion_solicitada
```

Consulta resumida:

```sql
SELECT t.id, t.estado
FROM turnos t
LEFT JOIN pacientes p ON p.id = t.paciente_id
WHERE t.estado = ANY($1)
  AND (
    t.paciente_id = $2
    OR DNI normalizado = $3
    OR teléfono normalizado = $4
  )
ORDER BY t.fecha_hora_inicio NULLS LAST, t.id DESC
LIMIT 1;
```

Hallazgos:

- No exige `fecha_hora_inicio > NOW()`.
- No exige que `fecha_hora_inicio` tenga valor.
- Usa `fecha_hora_inicio` solamente para ordenar.
- `solicitado` normalmente tiene fecha nula, pero bloquea igualmente.
- Un `programado`, `confirmado` o `reprogramado` vencido puede bloquear si todavía no fue actualizado a `realizado`.
- `realizado`, `cancelado` y `rechazado` no forman parte de la lista.
- La identidad se compara con `OR`: paciente, DNI o teléfono. Esto permite encontrar filas sin `paciente_id` consistente, pero también amplía el riesgo de falsos positivos por teléfonos reutilizados o mal cargados.

Respuesta por estado bajo el código actual:

| Estado de turno | ¿La función lo considera activo? | ¿Exige fecha futura? |
|---|---:|---:|
| `programado` | Sí | No |
| `confirmado` | Sí | No |
| `reprogramado` | Sí | No |
| `solicitado` | Sí | No |
| `reprogramacion_solicitada` | Sí | No |
| `cancelacion_solicitada` | Sí | No |
| `realizado` | No | No aplica |
| `cancelado` | No | No aplica |
| `rechazado` | No | No aplica |

### 3.2 Solicitud considerada activa

Tabla: `turno_solicitudes`.

Consulta resumida:

```sql
SELECT id, tipo_solicitud, estado
FROM turno_solicitudes
WHERE estado = 'pendiente'
  AND (
    paciente_id = $1
    OR DNI normalizado = $2
    OR teléfono normalizado = $3
  )
ORDER BY created_at DESC
LIMIT 1;
```

Hallazgos:

- Solamente `pendiente` se considera activo.
- `resuelta` y `rechazada` no se consideran activas.
- No se encontraron estados `cancelada` ni `cerrada` en el código o en los datos actuales.
- La tabla no posee un `CHECK` de estados, por lo que PostgreSQL permite cualquier texto.
- No existe filtro de fecha o antigüedad.
- No se comprueba el estado ni la existencia del `turno_id` asociado.
- Una solicitud puede permanecer activa para siempre si nadie actualiza su estado.
- La comparación por paciente/DNI/teléfono usa `OR`. Para el caso analizado, `paciente_id` y DNI ya son suficientes para producir el bloqueo; el teléfono no es la causa.

Estados de solicitudes encontrados o escritos por el código:

| Estado | Existe actualmente en BD | Tratamiento actual |
|---|---:|---|
| `pendiente` | Sí | Bloquea |
| `rechazada` | Sí | No bloquea |
| `resuelta` | No había filas al consultar, pero el código lo escribe | No bloquea |

## 4. Caso DNI 10173234

La consulta identificó exactamente un paciente, con `paciente_id=1`. No se incluyeron nombre, teléfono ni otros datos personales en este informe.

Las fechas se muestran en `America/Argentina/Buenos_Aires`.

### 4.1 Turnos

| ID | Estado | Fecha/hora | ¿Activo según bloqueo de nueva solicitud? | Motivo |
|---:|---|---|---:|---|
| 5 | `realizado` | 2026-05-22 10:15 | No | Estado final |
| 4 | `realizado` | 2026-05-22 19:15 | No | Estado final |
| 7 | `realizado` | 2026-05-25 16:30 | No | Estado final |
| 1 | `cancelado` | 2026-05-26 11:45 | No | Estado final |
| 3 | `realizado` | 2026-05-26 12:30 | No | Estado final |
| 8 | `realizado` | 2026-05-28 15:00 | No | Estado final |
| 11 | `cancelado` | 2026-06-01 16:00 | No | Estado final |
| 12 | `cancelado` | 2026-06-04 10:00 | No | Estado final |
| 16 | `cancelado` | 2026-06-05 09:00 | No | Estado final |
| 17 | `realizado` | 2026-06-08 15:45 | No | Estado final |
| 13 | `cancelado` | 2026-06-10 10:30 | No | Estado final |
| 15 | `cancelado` | 2026-06-10 12:00 | No | Estado final |
| 14 | `cancelado` | 2026-06-12 09:45 | No | Estado final |
| 26 | `cancelado` | 2026-08-14 15:15 | No | Estado final |
| 22 | `cancelado` | 2026-08-19 09:45 | No | Aunque la fecha es futura, está cancelado |
| 9 | `rechazado` | Sin fecha | No | Solicitud rechazada |
| 10 | `rechazado` | Sin fecha | No | Solicitud rechazada |

**¿Existe actualmente un turno futuro realmente activo? NO.**

### 4.2 Solicitudes

| ID | Tipo | Estado | Turno asociado | Estado actual del turno | ¿Activa según código? | ¿Realmente pendiente? |
|---:|---|---|---:|---|---:|---:|
| 1 | `nuevo_turno` | `rechazada` | 9 | `rechazado` | No | No |
| 2 | `nuevo_turno` | `rechazada` | 10 | `rechazado` | No | No |
| 3 | `nuevo_turno` | `pendiente` | 11 | `cancelado` | Sí | No |
| 4 | `cancelacion` | `pendiente` | 11 | `cancelado` | Sí | No |
| 5 | `nuevo_turno` | `pendiente` | 15 | `cancelado` | Sí | No |
| 6 | `nuevo_turno` | `pendiente` | 16 | `cancelado` | Sí | No |
| 7 | `reprogramacion` | `pendiente` | 11 | `cancelado` | Sí | No |
| 8 | `cancelacion` | `pendiente` | 16 | `cancelado` | Sí | No |
| 9 | `nuevo_turno` | `pendiente` | 17 | `realizado` | Sí | No |

**¿Existe actualmente una solicitud realmente pendiente? NO.**

Hay siete solicitudes que continúan textualmente en `pendiente`, pero ninguna representa una gestión vigente porque sus turnos asociados ya terminaron o fueron cancelados.

**Registro que provoca el mensaje:** el orden `created_at DESC LIMIT 1` devuelve primero `turno_solicitudes.id=9`, tipo `nuevo_turno`, vinculada al turno realizado `id=17`.

## 5. Diferencia con Cancelar

El flujo vigente por DNI es:

```text
Opción 3
  -> esperando_dni
  -> handleGuidedDni()
  -> findPacienteByDni()
  -> findNextActiveAppointmentByPacienteId()
```

La consulta de cancelación exige:

```sql
fecha_hora_inicio > NOW()
AND estado IN (
  'programado',
  'confirmado',
  'reprogramado',
  'reprogramacion_solicitada',
  'cancelacion_solicitada'
)
```

No consulta `turno_solicitudes` para decidir si existe un turno cancelable. Tampoco incluye `solicitado`.

Por eso, para el mismo DNI:

- Sacar turno encuentra `turno_solicitudes.id=9` porque conserva `estado='pendiente'`.
- Cancelar no encuentra ningún turno que cumpla simultáneamente fecha futura y estado permitido.

La diferencia no está en la identificación por DNI. Está en que ambos flujos usan consultas y definiciones de actividad diferentes.

Existe también `findNextManagedAppointment()`, que realiza una búsqueda equivalente por teléfono/conversaciones. Alimenta funciones auxiliares para cancelar/reprogramar, pero esas funciones no tienen consumidor ejecutable en el flujo guiado actual.

## 6. Diferencia con Reprogramar

El flujo guiado vigente usa la misma búsqueda por paciente que Cancelar:

```text
Opción 2
  -> DNI
  -> findPacienteByDni()
  -> findNextActiveAppointmentByPacienteId()
```

Por lo tanto, exige fecha futura y usa los mismos cinco estados de la cancelación.

Si encuentra un turno, crea o reutiliza una solicitud `reprogramacion` pendiente y luego intenta cambiar el turno a `reprogramacion_solicitada`. Sin embargo, ese `UPDATE` solamente acepta como estado anterior:

```text
programado
confirmado
reprogramado
```

Esto genera otra inconsistencia: el selector admite también `reprogramacion_solicitada` y `cancelacion_solicitada`, pero el cambio de estado no opera sobre esas dos situaciones.

La función auxiliar exportada `startRescheduleFlow()` utiliza otra lista local:

```text
programado
confirmado
reprogramado
reprogramacion_solicitada
```

Excluye `cancelacion_solicitada`. Actualmente no tiene consumidor externo encontrado.

Para el DNI analizado, Reprogramar y Cancelar coinciden correctamente en que no existe un turno futuro gestionable. La contradicción aparece solamente al compararlos con el bloqueo de nueva solicitud.

## 7. Flujo actual de paciente nuevo/existente

Estados vigentes del flujo guiado:

```text
esperando_opcion_menu
  -> esperando_tipo_paciente

Paciente existente:
  -> esperando_dni
  -> buscar por DNI

Primera vez:
  -> esperando_nombre_apellido
  -> esperando_dni
  -> motivo
  -> preferencia horaria
  -> confirmación de solicitud
```

### Si selecciona "Ya fui atendido" y el DNI no existe

- No crea un paciente.
- Cambia a `esperando_dni_no_encontrado`.
- Permite reintentar, volver al menú o cancelar.
- Obliga al usuario a regresar y declarar que es su primera vez.

### Si selecciona "Es mi primera vez" pero el DNI ya existe

- `handleGuidedDni()` no busca el DNI porque sale anticipadamente por `tipo_solicitud='primera_consulta'`.
- Al confirmar, `registerPendingRequestFromSession()` llama a `createPacienteMinimo()`.
- `createPacienteMinimo()` sí vuelve a buscar por DNI y reutiliza el paciente existente; no crea un duplicado.
- No obstante, conserva la clasificación `primera_consulta`, aunque el paciente realmente ya existía.
- Luego aplica el mismo bloqueo defectuoso de actividad y puede mostrar el mensaje problemático.

### Cuándo crea el paciente mínimo

En el flujo vigente de primera consulta, el paciente se crea o reutiliza recién al confirmar la solicitud, dentro de `registerPendingRequestFromSession()`.

La pregunta "nuevo o existente" no es necesaria para decidir el flujo: PostgreSQL ya permite determinarlo de forma objetiva mediante `findPacienteByDni()`.

El archivo conserva handlers de un flujo anterior (`ASK_EXISTING`, `ASK_DNI_EXISTING`, `ASK_NOMBRE`, etc.), pero el dispatcher actual los redirige a `resetLegacyAppointmentFlow()`; no son el flujo operativo observado.

## 8. Definición conceptual recomendada de actividad

La siguiente tabla propone la referencia para 2B.4B. No cambia código ni datos.

| Entidad | Estado | ¿Bloquea nueva solicitud? | ¿Cancelable por WhatsApp? | ¿Reprogramable por WhatsApp? | Criterio adicional |
|---|---|---:|---:|---:|---|
| Turno | `programado` | Sí | Sí | Sí | Debe ser futuro |
| Turno | `confirmado` | Sí | Sí | Sí | Debe ser futuro |
| Turno | `reprogramado` | Sí | Sí | Sí | Debe ser futuro |
| Turno | `solicitado` | Sí | No | No | Representa una solicitud sin horario definitivo |
| Turno | `reprogramacion_solicitada` | Sí | Revisar/supeditar | No, ya está solicitada | Debe existir una solicitud pendiente coherente y un turno futuro |
| Turno | `cancelacion_solicitada` | Sí | No, ya está solicitada | No | Debe existir una solicitud pendiente coherente y un turno futuro |
| Turno | `realizado` | No | No | No | Estado final |
| Turno | `cancelado` | No | No | No | Estado final |
| Turno | `rechazado` | No | No | No | Estado final |
| Solicitud | `pendiente` | Sí | No aplica | No aplica | Sólo si su turno/entidad relacionada también es coherente y vigente |
| Solicitud | `resuelta` | No | No aplica | No aplica | Estado final |
| Solicitud | `rechazada` | No | No aplica | No aplica | Estado final |

No se encontraron los estados `cancelada` o `cerrada` para `turno_solicitudes`.

Una fecha vencida no debe bloquear una nueva solicitud, incluso si una tarea de ciclo de vida todavía no actualizó el estado del turno.

## 9. Reglas duplicadas y deuda técnica

Se encontraron al menos las siguientes definiciones independientes:

1. `ESTADOS_TURNO_ACTIVO` en `turnoSolicitudesService.js`: seis estados, sin fecha.
2. `findNextActiveAppointmentByPacienteId()` en `whatsappAutogestion.service.js`: cinco estados, con fecha futura.
3. `findNextManagedAppointment()` en `whatsappAutogestion.service.js`: los mismos cinco estados y fecha futura, pero identifica por teléfono/conversación.
4. `ESTADOS_CANCELABLES` en `turnosService.js`: seis estados, sin filtro de fecha.
5. `reprogramarTurno()` en `turnosService.js`: cuatro estados permitidos y exige que la nueva fecha sea futura.
6. `startRescheduleFlow()` en `whatsappAutogestion.service.js`: cuatro estados locales, diferentes de la selección previa.
7. Tres consultas separadas consideran una solicitud duplicada si `turno_solicitudes.estado='pendiente'`, con alcances distintos por turno, tipo o identidad.

La regla está duplicada y las listas no expresan la misma semántica. Esta es una deuda técnica directa y dificulta explicar por qué un turno es activo, cancelable o reprogramable.

## 10. Propuesta mínima para la Fase 2B.4B

### A. Eliminar falsos positivos

Separar la consulta combinada en dos resultados explícitos:

- turno que bloquea;
- solicitud que bloquea.

Para turnos con horario, exigir fecha futura. Para `solicitado`, admitir fecha nula porque representa una solicitud sin agenda definitiva, pero exigir que no esté rechazado/resuelto.

Para `turno_solicitudes`, no aceptar solamente `estado='pendiente'`: validar coherencia con `turno_id` y el estado del turno asociado. Una solicitud vinculada a `realizado`, `cancelado` o `rechazado` no debe bloquear.

### B. Centralizar actividad

Definir constantes con nombre semántico y helpers compartidos, por ejemplo:

```text
ESTADOS_TURNO_FUTURO_GESTIONABLE
ESTADOS_TURNO_SOLICITUD_PENDIENTE
buscarTurnoQueBloqueaNuevaSolicitud()
buscarSolicitudQueBloqueaNuevaSolicitud()
buscarTurnoFuturoGestionable()
```

Cancelar y reprogramar pueden compartir la selección base de turno futuro, aplicando después restricciones específicas de cada operación.

### C. Pedir DNI primero

Flujo propuesto:

```text
Sacar turno
  -> pedir DNI
  -> validar formato
  -> findPacienteByDni()
  -> si existe: flujo de paciente existente
  -> si no existe: pedir nombre y apellido, crear/reutilizar paciente mínimo
  -> verificar duplicados reales
  -> registrar solicitud
```

### D. Determinar nuevo/existente automáticamente

Eliminar la pregunta subjetiva "¿Ya fuiste atendido?". La existencia de la ficha se decide por DNI. Esto evita rutas contradictorias y mantiene la protección contra pacientes duplicados.

### E. Mantener un único bloqueo real

Antes de confirmar la solicitud, repetir la validación dentro del mismo flujo de persistencia para evitar concurrencia. Bloquear solamente si existe un turno o solicitud vigente y coherente.

### F. Mantener las reglas del proyecto

- Si el DNI no existe, la solicitud debe ser exclusivamente `primera_consulta`.
- El bot no ofrece ni asigna automáticamente día u horario.
- El odontólogo conserva la decisión de fecha y hora definitiva.
- Debe existir como máximo una solicitud realmente activa cuando corresponda.

### G. Tratar los datos históricos por separado

La corrección de lectura puede evitar inmediatamente el falso positivo sin modificar datos. Posteriormente, y sólo con backup y una fase autorizada, convendría reclasificar las solicitudes `pendiente` asociadas a turnos finales. No debe hacerse dentro de 2B.4A.

## 11. Diagnóstico final

**Clasificación: SOLICITUD VIEJA CONSIDERADA ACTIVA.**

Evidencia:

- No existe un turno futuro realmente activo para el DNI analizado.
- Cancelar y Reprogramar no encuentran un turno futuro porque filtran fecha y estados.
- Sacar turno consulta también `turno_solicitudes`.
- Existen siete filas históricas en `pendiente` asociadas exclusivamente a turnos `cancelado` o `realizado`.
- El primer registro devuelto es `turno_solicitudes.id=9`, asociado a un turno realizado.

El comportamiento es reproducible y no se debe a una falla en la búsqueda por DNI.

## 12. Confirmaciones de alcance

- CÓDIGO MODIFICADO: NO
- BASE DE DATOS MODIFICADA: NO
- PACIENTES CREADOS: NO
- TURNOS MODIFICADOS: NO
- SOLICITUDES MODIFICADAS: NO
- WHATSAPP ENVIADO: NO
- MIGRACIONES EJECUTADAS: NINGUNA
