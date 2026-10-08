# Auditoría de coherencia entre tesis y sistema real Odonton

## Resumen ejecutivo

Se auditó `Tesis_Odonton_revision_profesor_FINAL.docx` contra el runtime de `backend/src`, `frontend/src`, `frontend/index.html` y `database/schema_actual.sql`. También se contrastaron los documentos técnicos finales del repositorio. La revisión fue estática y documental: no se ejecutaron migraciones, no se modificó PostgreSQL y no se alteró el Word.

La tesis describe correctamente el propósito general de Odonton, su arquitectura web, el uso de PostgreSQL, JWT, WhatsApp, el control final del odontólogo sobre los turnos y el modelo final Paciente → Cargo → Pago(s). Sin embargo, requiere correcciones antes de la entrega:

- no incluye un DER relacional independiente;
- el diccionario de datos es un resumen conceptual y no documenta las 22 tablas y 197 columnas reales;
- el diagrama de clases mezcla dominio y persistencia y conserva nombres/modelos anteriores;
- siete casos de uso contienen diferencias funcionales relevantes;
- varios diagramas de secuencia asignan responsabilidades a servicios inexistentes o a capas equivocadas;
- el caso 3.3 reutiliza literalmente los diagramas y el prototipo de 3.2;
- los prototipos de alta/edición/consulta de pacientes y del flujo WhatsApp no representan fielmente la interfaz final.

Resultado general: **SÍ CON AJUSTES**. El sistema está terminado y es defendible; las diferencias detectadas son principalmente documentales. Deben corregirse el DER, el diccionario, el diagrama de clases y los casos marcados en rojo antes de presentar la versión final.

### Alcance cuantificado

| Elemento | Resultado |
|---|---:|
| Casos de uso revisados | 17 |
| Vistas estáticas/asociación revisadas | 17 |
| Diagramas de secuencia revisados | 17 |
| Prototipos revisados | 17 |
| Otros diagramas estructurales revisados | 4 |
| Diagramas/artefactos visuales relevantes revisados | 38 |
| Tablas contrastadas | 22 |
| Columnas contrastadas | 197 |
| Casos ✅ coherentes | 3 |
| Casos 🟡 con ajuste menor | 7 |
| Casos 🔴 con inconsistencia | 7 |
| Inconsistencias críticas agrupadas | 11 |
| Ajustes menores agrupados | 10 |

## Paquete 2 — Pacientes

### 2.1 Registrar paciente — 🟡 AJUSTE MENOR

**Tesis:** alta con identificación, contacto y datos clínicos; el prototipo usa “nombre completo” e incluye antecedentes/alergias. La secuencia ubica autenticación en controller y auditoría en service.

**Sistema real:** el formulario activo solicita `nombre`, `apellido` y `dni` como obligatorios; `teléfono`, `email`, `nacionalidad`, `domicilio`, `fecha_nacimiento` y `observaciones` son opcionales. El controller de alta no recibe alergias, condiciones ni estado de tratamiento. El DNI se valida con 7–10 dígitos y se exige unicidad. JWT y auditoría son middlewares.

**Corrección recomendada:** enumerar los campos reales; retirar antecedentes/alergias del alta; reemplazar la captura por el formulario actual con datos de ejemplo y corregir la secuencia a Vista → `api.js` → route → validadores/auth → controller → service → PostgreSQL → auditoría middleware.

### 2.2 Actualizar paciente — 🟡 AJUSTE MENOR

**Tesis:** modificación de datos identificatorios, personales y clínicos usando el mismo prototipo sintético de alta.

**Sistema real:** la vista edita los mismos campos generales del formulario; no ofrece edición de alergias, condiciones o estado de tratamiento. El service admite actualización parcial y conserva la unicidad del DNI.

**Corrección recomendada:** limitar la ficha del caso a los campos visibles en la interfaz, aclarar que la validación de DNI también se aplica al actualizar y reemplazar el prototipo. Corregir responsabilidades de autenticación y auditoría en la secuencia.

### 2.3 Consultar / visualizar pacientes — 🔴 INCONSISTENCIA

**Tesis:** presenta una consulta detallada del paciente y navegación hacia tratamientos, pagos y documentos. El prototipo mostrado corresponde a una ficha clínica.

**Sistema real:** la pantalla activa lista pacientes, busca por nombre/apellido o DNI y ofrece únicamente `Ficha`, `Odonto` y `Editar`. Existe `GET /api/pacientes/:id`, pero no tiene un consumidor activo que construya una vista general independiente. No existe desde la fila una acción de tratamientos o prótesis; pagos/cargos se gestionan desde su módulo.

**Corrección recomendada:** redefinir el caso como “Listar y buscar pacientes” o describir solamente lista, filtro y acciones reales. Sustituir el prototipo por la tabla activa con datos cargados. Retirar la navegación no implementada.

### 2.4 Consultar ficha clínica — 🔴 INCONSISTENCIA

**Tesis:** afirma que la ficha consolida datos, turnos, tratamientos, odontograma, documentos y evoluciones; la secuencia hace que `PacientesController` coordine varios services.

**Sistema real:** el GET es de lectura pura y devuelve paciente, datos clínicos existentes, última visita realizada, próximo turno, historial paginado de turnos e historias clínicas existentes. La vista muestra los datos y turnos; obtiene y muestra documentos mediante una llamada separada. No muestra `historiasClinicas`, tratamientos ni odontograma. El odontograma se abre desde una acción separada. Consultar la ficha no inserta filas.

**Corrección recomendada:** describir solo la información efectivamente visible; destacar que el GET no crea evoluciones; separar documentos como segunda consulta frontend y odontograma como caso independiente. Regenerar el diagrama de secuencia.

### 2.5 Gestionar odontograma — 🟡 AJUSTE MENOR

**Tesis:** describe selección de uno o varios dientes y observaciones asociadas a estado/tratamiento/evolución. La secuencia pasa por controller/service de Pacientes.

**Sistema real:** la interfaz trabaja sobre un diente seleccionado y sus caras `vestibular`, `mesial`, `distal`, `oclusal` y `lingual`. Los estados son `sano`, `existente`, `requerido`, `corona`, `protesis_fija`, `protesis_removible` y `ausente`. Permite dentición permanente/temporal/mixta, sarro, periodontal, observación general y exportación para impresión/PDF. El flujo real es `/api/odontograma` → `odontogramaRoutes` → `odontogramaController` → `odontogramaService` → `odontograma`/`odontograma_meta`.

**Corrección recomendada:** reemplazar “uno o varios” por “un diente seleccionado y sus caras”; distinguir observación general de una evolución clínica; corregir participantes del diagrama. El prototipo actual es apto.

### 2.6 Adjuntar documentos — 🟡 AJUSTE MENOR

**Tesis:** carga documento con tipo, descripción y observaciones; la secuencia lo encadena desde PacientesController/PacientesService.

**Sistema real:** la UI recibe archivo y descripción. El tipo se deriva del MIME; no existe campo independiente de observaciones. Se aceptan PDF, JPEG y PNG hasta 10 MB. Los metadatos se guardan en `documentos_paciente` y el archivo en filesystem. Subida, listado, descarga y eliminación requieren JWT; `/uploads` no está expuesto públicamente. El flujo usa routes/controller/service propios de Documentos y middleware Multer.

**Corrección recomendada:** quitar campos inexistentes; explicitar formatos, límite y descarga autenticada; regenerar la secuencia con middleware de autenticación, Multer, service, PostgreSQL y filesystem. El prototipo actual es apto.

## Paquete 3 — Turnos

### 3.1 Registrar turno — 🔴 INCONSISTENCIA

**Tesis:** presenta prestación o motivo como opcionales según configuración y estado inicial `programado` o `solicitado` según origen/acción.

**Sistema real:** el alta interna exige paciente, prestación y fecha/hora; la duración puede derivarse de la prestación y respeta un mínimo. El turno se crea `programado` y con origen `interno`. `solicitado` pertenece al flujo supervisado proveniente de WhatsApp, no al alta interna. La disponibilidad se valida en `turnosService`, no en un `DisponibilidadService` separado.

**Corrección recomendada:** hacer obligatoria la prestación para este caso; fijar el estado inicial en `programado`; separar solicitudes de WhatsApp; corregir la secuencia y eliminar services inexistentes.

### 3.2 Editar turno — 🔴 INCONSISTENCIA

**Tesis:** permite modificar el estado y describe la notificación WhatsApp como condicional/elegible.

**Sistema real:** el endpoint de edición no acepta una transición arbitraria de estado; las transiciones se realizan con operaciones específicas. La edición normal conserva el estado y, tras persistir, intenta la notificación WhatsApp. Un fallo externo se trata como advertencia y no revierte la edición.

**Corrección recomendada:** retirar “editar estado”; explicar operaciones específicas para confirmar/reprogramar/cancelar; describir WhatsApp como intento posterior a la persistencia. Regenerar la secuencia sin `DisponibilidadService`.

### 3.3 Reprogramar turno — 🔴 INCONSISTENCIA

**Tesis:** la narrativa general es compatible, pero la vista estática, la secuencia y el prototipo son copias literales de 3.2 Editar turno.

**Sistema real:** existe una operación específica de reprogramación que valida nuevo intervalo/disponibilidad, cambia a `reprogramado` y resuelve solicitudes pendientes de reprogramación. La vista la utiliza especialmente al atender una `reprogramacion_solicitada`.

**Corrección recomendada:** conservar la narrativa depurada y regenerar los tres artefactos visuales para mostrar el endpoint/operación específica, la transición a `reprogramado` y el cierre atómico de la solicitud asociada.

### 3.4 Cancelar turno — 🟡 AJUSTE MENOR

**Tesis:** cancelación con validación, persistencia y eventual aviso por WhatsApp.

**Sistema real:** `cancelarTurno` bloquea el turno en una transacción, cambia a `cancelado` y cierra solicitudes pendientes relacionadas. La notificación se intenta después del commit y solo si el usuario acepta el segundo aviso. Un fallo WhatsApp no revierte la cancelación. Auditoría opera como middleware.

**Corrección recomendada:** mantener el caso, corregir el orden y las responsabilidades de la secuencia y aclarar la condición de notificación. El prototipo es apto.

### 3.5 Controlar disponibilidad — 🔴 INCONSISTENCIA

**Tesis:** considera que `solicitado` puede ocupar agenda junto con `programado`, `confirmado` y `reprogramado`, y representa un service independiente.

**Sistema real:** únicamente `programado`, `confirmado` y `reprogramado` bloquean un intervalo. Las solicitudes no tienen horario definitivo y no ocupan agenda. Se validan horario profesional, duración y superposición dentro de `turnosService` por profesional.

**Corrección recomendada:** retirar `solicitado` de estados ocupantes y el `DisponibilidadService` inexistente. Mantener la regla de no superposición y control del horario profesional.

### 3.6 Gestionar solicitudes por WhatsApp — 🔴 INCONSISTENCIA

**Tesis:** muestra que el paciente elige “ya me atendí/primera vez” y que al reprogramar informa una nueva preferencia horaria. Los prototipos reproducen ese flujo anterior.

**Sistema real:** el bot inicia solo con coincidencia exacta de palabra clave o comando directo 1/2/3 proveniente de un evento real. Ofrece 1 solicitar, 2 reprogramar, 3 cancelar y 0 salir. Para solicitar pide DNI y detecta automáticamente si el paciente existe; el nuevo informa nombre/apellido y solo puede pedir Primera Consulta. En alta de solicitud pide motivo y preferencia libre. Para reprogramar pide DNI, identifica el turno futuro activo y crea la solicitud pendiente sin pedir una nueva preferencia. Para cancelar pide confirmación. Nunca asigna día/hora definitivo y solo admite una solicitud activa por paciente.

**Corrección recomendada:** reescribir el curso normal y alternativos; eliminar el submenú no vigente y la preferencia inexistente de reprogramación; incorporar opción 0, detección por DNI, Primera Consulta y unicidad de solicitud activa. Reemplazar prototipos y secuencia.

### 3.7 Enviar recordatorios automáticos — 🟡 AJUSTE MENOR

**Tesis:** describe ventana de 24 horas, un recordatorio por turno y respuesta de confirmación/cambio.

**Sistema real:** el job corre por intervalo; requiere flag global y flag individual del turno. Busca turnos futuros `programado`/`confirmado`, con teléfono y dentro de una ventana máxima de 24 horas. Un envío exitoso se registra una vez. Ante un fallo se guarda diagnóstico en el turno y puede reintentarse mientras siga elegible; por ello “un intento máximo” no es correcto. Las respuestas confirman o abren atómicamente solicitudes de cancelación/reprogramación; WhatsApp se responde después del commit.

**Corrección recomendada:** distinguir un envío exitoso máximo de los reintentos por fallo, añadir flags global/individual y corregir los participantes de la secuencia. El prototipo es apto.

## Paquete 4 — Cargos / Pagos

### 4.1 Crear cargo — 🟡 AJUSTE MENOR

**Tesis:** modelo Paciente → Cargo, importe/concepto históricos, turno y prestación opcionales; el prototipo marca concepto como siempre obligatorio.

**Sistema real:** paciente e importe positivo son obligatorios. Turno y prestación son opcionales. El concepto puede omitirse en la solicitud cuando una prestación permite construir el snapshot; en la tabla siempre queda un `concepto` no vacío. `importe_total` y concepto quedan históricos.

**Corrección recomendada:** describir la obligatoriedad condicional del concepto y ajustar la etiqueta/captura. La lógica principal y la secuencia son coherentes.

### 4.2 Registrar pago — ✅ COHERENTE

**Tesis:** pago asociado a cargo, parcial o total, con control de saldo y sobrepago.

**Sistema real:** la transacción bloquea el cargo con `SELECT ... FOR UPDATE`, suma pagos activos, valida importe positivo y saldo y registra método `efectivo`, `tarjeta` o `transferencia`. El estado `PENDIENTE/PARCIAL/PAGADO` y el saldo se calculan, no se persisten.

**Corrección recomendada:** conservar texto y secuencia. Como mejora documental, reemplazar la captura si se desea eliminar el campo demostrativo “estado esperado”, que no forma parte del modal final.

### 4.3 Anular pago — ✅ COHERENTE

**Tesis:** anulación lógica con motivo, usuario y recomposición del saldo, conservando historial.

**Sistema real:** se bloquean cargo y pago dentro de transacción; el pago pasa a `anulado`, registra fecha, motivo y usuario. No se borra. El saldo/estado del cargo se recalculan a partir de pagos activos.

**Corrección recomendada:** conservar. La vista estática puede simplificarse para no representar validaciones internas como casos de uso.

### 4.4 Consultar historial / constancia — ✅ COHERENTE

**Tesis:** historial, pagos activos/anulados, constancia interna no fiscal e ingresos reales.

**Sistema real:** lista cargos y pagos, reconstruye constancia mediante endpoint autenticado, muestra anulación y permite imprimir/Guardar PDF desde el navegador. Los reportes usan pagos activos reales; no usan `precio_base` como ingreso ni implementan fiscalidad.

**Corrección recomendada:** conservar el alcance y mantener visible la leyenda “Constancia interna de pago — no fiscal”.

## Control completo de las fichas de casos de uso

Esta matriz deja constancia de la revisión de todos los componentes solicitados. “Correcto” significa que actor, objetivo o condición coincide; las salvedades remiten al detalle precedente.

| Caso | Nombre / número | Actores y objetivo | Precondición / postcondición | Curso y alternativas | Reglas y validaciones | Prototipo | Vista estática | Secuencia |
|---|---|---|---|---|---|---|---|---|
| 2.1 | Correcto | Personal autenticado; alta de paciente | Correctas con DNI único | Ajustar campos reales | DNI 7–10, email válido; quitar datos clínicos del alta | 🔴 | 🟡 sobrecargada | 🟡 capas |
| 2.2 | Correcto | Personal autenticado; actualizar | Correctas; paciente existente | Ajustar campos visibles | Unicidad DNI y actualización parcial | 🔴 | 🟡 sobrecargada | 🟡 capas |
| 2.3 | Nombre impreciso | Personal; listar/buscar | Debe exigir sesión, sin crear datos | Quitar detalle/navegación inexistentes | Filtro nombre/apellido o DNI | 🔴 | 🔴 acciones | 🟡 enfocar listado |
| 2.4 | Correcto | Personal; consultar ficha | Debe declarar lectura pura | Quitar tratamientos/odonto/evoluciones visibles | Paginación de turnos; documentos en llamada separada | ✅ | 🔴 alcance | 🔴 orquestación |
| 2.5 | Correcto | Personal; gestionar odontograma | Paciente existente; persiste caras/meta | Cambiar selección múltiple por diente seleccionado | Estados/caras exactos; meta general | ✅ | 🟡 simplificar | 🔴 participantes |
| 2.6 | Correcto | Personal; adjuntar/consultar documentos | Paciente y JWT; persiste DB/filesystem | Quitar tipo/observaciones ingresados | PDF/JPEG/PNG, 10 MB, descarga auth | ✅ | 🟡 simplificar | 🔴 participantes |
| 3.1 | Correcto | Odontólogo; registrar turno | Requiere paciente/prestación/horario; queda programado | Quitar alta `solicitado` | Horario, duración y no superposición | ✅ | 🔴 estado | 🔴 services |
| 3.2 | Correcto | Odontólogo; editar datos | Turno editable; estado se conserva | Quitar edición arbitraria de estado | Disponibilidad; aviso post-persistencia | ✅ | 🔴 acción inexistente | 🔴 service/orden WA |
| 3.3 | Correcto | Odontólogo; reprogramar | Turno válido; queda reprogramado y solicitud resuelta | Narrativa válida | Validación/atomicidad correctas | 🔴 duplicado | 🔴 duplicada | 🔴 duplicada |
| 3.4 | Correcto | Odontólogo; cancelar | Estado cancelable; queda cancelado | Alternativa de aviso opcional | Lock y cierre de solicitudes | ✅ | 🟡 simplificar | 🟡 orden/capas |
| 3.5 | Correcto | Odontólogo/sistema; disponibilidad | Profesional/intervalo informados | Quitar `solicitado` como ocupante | Ocupan programado/confirmado/reprogramado | ✅ | 🔴 regla | 🔴 service |
| 3.6 | Correcto | Paciente y odontólogo; solicitud supervisada | Evento real/sesión; solicitud pendiente | Reescribir identificación y reprogramación | Primera Consulta, opción 0, una solicitud activa | 🔴 | 🔴 flujo | 🔴 flujo/participantes |
| 3.7 | Correcto | Sistema/paciente; recordar y responder | Flags y elegibilidad; registro/estado actualizado | Precisar reintento por fallo | Ventana ≤24 h; un envío exitoso | ✅ | 🟡 simplificar | 🟡 participantes |
| 4.1 | Correcto | Personal; crear cargo | Paciente/importe; cargo pendiente calculado | Concepto o prestación | Importe/concepto históricos | 🟡 | 🟡 técnica | ✅ |
| 4.2 | Correcto | Personal; registrar pago | Cargo/saldo; pago activo | Alternativas de parcial/total/sobrepago correctas | Lock, métodos, saldo/estado calculados | 🟡 | 🟡 técnica | ✅ |
| 4.3 | Correcto | Personal; anular | Pago activo; queda anulado | Motivo obligatorio e historial | Anulación lógica transaccional | ✅ | 🟡 técnica | ✅ |
| 4.4 | Correcto | Personal; consultar/generar constancia | Datos existentes; sin efecto fiscal | Activo/anulado correctamente visibles | Ingresos reales, no fiscal | ✅ | 🟡 técnica | ✅ |

## Arquitectura, alcance, implementación, testing y seguridad

### Arquitectura e implementación

La descripción de arquitectura es **coherente a nivel predominante**: Vite/JavaScript/Bootstrap en frontend; Express/Node.js en backend; PostgreSQL; flujo route → controller → service y domain donde aporta reglas. `api.js` centraliza peticiones HTTP. Auditoría/autenticación operan principalmente como middlewares y WhatsApp/filesystem son adaptadores externos.

Salvedades para la defensa:

- no todos los diagramas respetan esa arquitectura, aunque el texto general sí;
- persiste DDL defensivo en runtime de módulos históricos; debe explicarse como deuda técnica y no como capa nueva;
- algunos services concentran consulta, transacción y reglas, decisión razonable para el alcance académico;
- existen dos implementaciones de middleware de autenticación con usos distintos, sin que ello invalide JWT como mecanismo común.

### Requisitos y alcance

- Los requisitos de turnos supervisados, disponibilidad, WhatsApp y cargos/pagos coinciden en su intención.
- Deben retirarse del alcance visible tratamientos/prótesis y la supuesta ficha clínica integral.
- Google Calendar está correctamente presentado como descartado en la solución final; las menciones históricas deben conservar su contexto.
- Cargos/Pagos no implementa facturación fiscal, ARCA, CAE, obras sociales, Mercado Pago ni contabilidad profesional.

### Testing

La sección de implementación/testing es compatible con la evidencia final del repositorio: documentos de cierre, pruebas aisladas de Turnos/WhatsApp, Cargos/Pagos y Reportes, y checklists manuales. Las cifras documentadas de 15 suites, 90 módulos y 84 archivos corresponden a la evidencia final consultada. Esta auditoría no volvió a ejecutar pruebas porque su alcance prohíbe modificar/activar el sistema y su objetivo es coherencia documental.

### Seguridad

- `.env` está ignorado y `.env.example` documenta configuración sin ser fuente de secretos.
- Las contraseñas se almacenan como hash y las rutas funcionales usan JWT/middlewares.
- Los documentos clínicos no se sirven por `/uploads`; la descarga utiliza endpoint autenticado.
- Las sesiones/cache de WhatsApp y uploads están ignorados por Git.
- El handler global expone stack solo en desarrollo.
- Permanecen nombres de variables de token/link legacy en `.env.example` y columnas `reprogramacion_token*` en `turnos`, sin consumidores runtime. Deben identificarse como residuos técnicos y no como autogestión activa en la tesis.

## Diagramas de secuencia

| Diagrama | Estado | Participantes incorrectos / mensajes a corregir | Flujo real resumido |
|---|---|---|---|
| 2.1 Registrar paciente | 🟡 | Auth en controller; auditoría en service | View → api.js → route + auth/validación → controller → pacientesService → PostgreSQL → auditoría middleware |
| 2.2 Actualizar paciente | 🟡 | Igual que 2.1 | View → api.js → PUT route → middlewares → controller → service → DB |
| 2.3 Consultar pacientes | 🟡 | Confunde listado con detalle; auth mal ubicada | View → api.js → GET `/pacientes?q=` → route/auth → controller → service → DB |
| 2.4 Ficha clínica | 🔴 | Orquestación inexistente de services de Odontograma/Documentos desde PacientesController | View → GET ficha → pacientes route/controller/service → DB; en paralelo View → API Documentos → documentos stack; Odontograma es otra acción |
| 2.5 Odontograma | 🔴 | PacientesController/PacientesService no participan | View → api.js → `/api/odontograma` → odontograma route/controller/service → `odontograma` + `odontograma_meta` |
| 2.6 Documentos | 🔴 | PacientesController/PacientesService no participan; falta Multer/filesystem | View → api.js/FormData → documentos route + auth + Multer → controller → service → DB/filesystem |
| 3.1 Registrar turno | 🔴 | Services separados de paciente/prestación/disponibilidad como orquestadores; auth/auditoría mal ubicadas | View carga catálogos; POST turno → route/middlewares → controller → turnosService/domain → DB |
| 3.2 Editar turno | 🔴 | `DisponibilidadService` inexistente; estado editable; WhatsApp antes/dentro de service | PUT → controller → turnosService/DB → commit/respuesta persistida → intento WhatsApp |
| 3.3 Reprogramar turno | 🔴 | Es copia de 3.2 | Operación reprogramar → service transaccional → lock/validación → turno reprogramado + solicitud resuelta → commit → aviso |
| 3.4 Cancelar turno | 🟡 | WhatsApp y auditoría atribuidos al service | DELETE/operación → controller → service transaccional → commit → WhatsApp opcional; auditoría middleware |
| 3.5 Disponibilidad | 🔴 | `DisponibilidadService` inexistente y estado `solicitado` incorrecto | View/API → turnosService → horarios profesionales + turnos ocupantes → respuesta |
| 3.6 Solicitudes WhatsApp | 🔴 | Flujo anterior y mensajes no vigentes | evento real → whatsappClient → whatsappAutogestion → pacientes/prestaciones + turnoSolicitudesService → PostgreSQL → respuesta WhatsApp |
| 3.7 Recordatorios | 🟡 | Consultas/actualizaciones atribuidas a TurnosService/PacientesService | scheduler → whatsappReminderService → DB → whatsappClient; respuesta → reminderService → turnoSolicitudesService/DB → commit → WhatsApp |
| 4.1 Crear cargo | ✅ | Abstracción aceptable; puede agregar route/middleware | View → api.js → route → controller → cargos/pagos service + domain → DB |
| 4.2 Registrar pago | ✅ | Abstracción aceptable | View → endpoint → controller → service → `FOR UPDATE` + validación domain → INSERT pago → commit |
| 4.3 Anular pago | ✅ | Abstracción aceptable | View → endpoint → controller → service → locks → UPDATE lógico → commit |
| 4.4 Historial/constancia | ✅ | Abstracción aceptable | View → endpoints autenticados → controller/service → cargos/pagos/paciente → respuesta/HTML imprimible |

## Vistas estáticas / asociación

Los 17 diagramas modelan validaciones, guardado, control de errores y cancelaciones como si fueran casos de uso incluidos o extendidos. Es una representación sobrecargada: `include`/`extend` debería expresar comportamiento reutilizable o extensiones reales desde la perspectiva del actor, no cada paso interno.

- **Correctos en objetivo:** 2.1, 2.2, 2.5, 2.6, 3.4, 3.7 y 4.1–4.4, aunque conviene simplificarlos.
- **A corregir funcionalmente:** 2.3 (acciones no accesibles), 2.4 (tratamientos/odontograma dentro de ficha), 3.1 (estado solicitado), 3.2 (editar estado), 3.3 (duplicado), 3.5 (`solicitado` ocupa agenda) y 3.6 (flujo WhatsApp anterior).
- **Recomendación académica:** dejar un caso principal, actor y alternativas visibles; trasladar validaciones y persistencia a la ficha narrativa y al diagrama de secuencia.

## Diagrama de clases integrado

**Estado: NO COHERENTE.** Es útil como aproximación conceptual, pero mezcla clases de dominio con columnas de persistencia y conserva estructuras que no coinciden con el sistema final.

### Diferencias principales

- `Usuario.rol` no existe en `usuarios`.
- `Configuracion(clave, valor, updated_at)` no existe; hay tres tablas de configuración con estructuras distintas.
- `Odontograma(datos_piezas, observaciones, updated_at)` corresponde a un modelo agregado anterior; el modelo actual guarda una fila por cara y usa `odontograma_meta`.
- `Prestacion.duracion_estimada` debe ser `duracion_minutos`.
- `Turno.duracion` no se persiste: se deriva de inicio y fin.
- `SolicitudTurno.tipo`/`preferencia` deben corresponder a `tipo_solicitud`/`preferencia_horaria` si se muestran como atributos persistidos.
- `RecordatorioWhatsApp` usa nombres que no corresponden a `whatsapp_reminders` (`appointment_id`, `status`, `sent_at`, `responded_at`, `response_text`, `channel`).
- Falta `OdontogramaMeta`; faltan las tres configuraciones reales si el objetivo es persistencia.

### Relaciones esperadas

| Clase A | Relación | Clase B | Cardinalidad esperada | Evidencia |
|---|---|---|---|---|
| Paciente | posee | Turno | 1 a 0..N | FK `turnos.paciente_id` |
| Prestación | clasifica | Turno | 1 a 0..N; turno 0..1 prestación | FK nullable `turnos.prestacion_id` |
| Paciente | posee | DocumentoPaciente | 1 a 0..N | FK `documentos_paciente.paciente_id` |
| Paciente | posee | HistoriaClinica | 1 a 0..N | FK `historias_clinicas.paciente_id` |
| Turno | puede originar | HistoriaClinica | 1 a 0..N; historia 0..1 turno | FK nullable `historias_clinicas.turno_id` |
| Paciente | posee estados por cara | Odontograma | 1 a 0..N filas | FK + unique paciente/diente/cara |
| Paciente | posee metadatos | OdontogramaMeta | 1 a 0..1 | FK + unique paciente |
| Paciente | posee | Cargo | 1 a 0..N | FK obligatoria `cargos.paciente_id` |
| Turno | puede justificar | Cargo | 1 a 0..N; cargo 0..1 turno | FK nullable `cargos.turno_id` |
| Prestación | puede originar snapshot en | Cargo | 1 a 0..N; cargo 0..1 prestación | FK nullable `cargos.prestacion_id` |
| Cargo | recibe | Pago | 1 a 0..N | FK obligatoria `pagos.cargo_id` |
| Usuario | anula | Pago | 1 a 0..N; pago activo 0 usuario/anulado 1 | FK `pagos.anulado_por_usuario_id` + check |
| Turno | se relaciona conceptualmente con | SolicitudTurno | 1 a 0..N | `turno_solicitudes.turno_id`, sin FK declarada |
| Turno | recibe técnicamente | RecordatorioWhatsApp | 1 a 0..N | `whatsapp_reminders.appointment_id`, sin FK declarada |
| Usuario | ejecuta | Auditoría | 1 a 0..N | `auditoria.usuario_id`, sin FK declarada |

**Recomendación:** regenerar el diagrama como modelo conceptual, sin copiar las 22 tablas, usando nombres de dominio actuales. Separarlo explícitamente del DER.

## DER

**DER coherente: NO.** No se encontró en el Word un DER relacional autónomo identificable. El diagrama integrado de clases no puede reemplazarlo porque no representa con precisión tablas, PK, FK y cardinalidades reales.

### Inventario real

**Tablas activas relevantes (14):** `usuarios`, `pacientes`, `prestaciones`, `turnos`, `turno_solicitudes`, `documentos_paciente`, `historias_clinicas`, `odontograma`, `odontograma_meta`, `tratamientos`, `protesis_fijas`, `protesis_removibles`, `cargos`, `pagos`.

**Tablas técnicas activas (7):** `auditoria`, `configuracion_consultorio`, `configuracion_horarios_atencion`, `configuracion_mensajes_automaticos`, `profesionales_horarios_atencion`, `whatsapp_conversations`, `whatsapp_reminders`.

**Tabla legacy/histórica sin consumidor runtime encontrado (1):** `archivos_clinicos`. No debe presentarse como funcionalidad activa.

### Claves y relaciones reales

- Las 22 tablas tienen PK `id`.
- Existen 16 FK declaradas: archivos→historias; cargos→pacientes/turnos/prestaciones; documentos→pacientes; historias→pacientes/turnos; odontograma/meta→pacientes; pagos→cargos/usuarios; prótesis fijas/removibles→pacientes; tratamientos→pacientes; turnos→pacientes/prestaciones.
- Relaciones conceptuales sin FK declarada: `turnos.profesional_id`, `profesionales_horarios_atencion.profesional_id`, `turno_solicitudes.paciente_id/turno_id`, `whatsapp_conversations` IDs, `whatsapp_reminders.appointment_id/patient_id`, `auditoria.usuario_id`.
- Unicidades relevantes: `usuarios.email`, `pacientes.dni` (declarada dos veces), `odontograma(paciente_id,diente,cara)`, `odontograma_meta.paciente_id`, horario general por día, horario profesional por profesional/día y configuración de mensaje por tipo.
- Restos de esquema: `turnos.reprogramacion_token*` no tiene consumidor runtime; `prestaciones` conserva `activa` y `activo`. Deben marcarse como legacy técnico si aparecen, no modelarse como funcionalidad final.

### DER recomendado

Crear un DER nuevo que muestre como mínimo Paciente, Turno, Prestación, Solicitud, Documento, Historia, Odontograma, OdontogramaMeta, Cargo, Pago, Usuario y Auditoría. Puede colocar configuraciones, conversaciones, recordatorios, tratamientos/prótesis y `archivos_clinicos` en un subdiagrama técnico/legacy, pero debe respetar nombres de tabla, PK/FK reales y señalar relaciones semánticas sin constraint.

## Diccionario de datos

**Diccionario coherente: NO.** La sección actual resume entidades y combina `odontograma`/`odontograma_meta`; además inventa una `configuracion` genérica. No consigna sistemáticamente tipo, nulabilidad, default, PK/FK y descripción para las 197 columnas.

Convenciones de la propuesta: `NN` = NOT NULL; `NULL` = admite nulo; `PK`/`FK`/`UQ` indican restricción física. Si se aclara “referencia lógica”, la base no declara FK.

### Propuesta corregida basada en `schema_actual.sql`

1. **archivos_clinicos** — adjuntos del modelo histórico de historias, sin consumidor runtime confirmado.
   - `id integer` NN PK — identificador; `historia_id integer` NN FK→historias_clinicas(id), cascade — historia dueña; `nombre_archivo varchar(255)` NULL — nombre; `ruta_archivo text` NN — ubicación; `tipo varchar(50)` NULL — tipo; `created_at timestamptz` NULL default now — alta.
2. **auditoria** — trazabilidad de acciones HTTP y campos legacy coexistentes.
   - `id integer` NN PK — identificador; `entidad varchar(50)` NULL — entidad legacy; `entidad_id integer` NULL — id legacy; `accion varchar(50)` NULL — acción; `descripcion text` NULL — detalle legacy; `fecha timestamptz` NULL default now — fecha legacy; `usuario_id integer` NULL referencia lógica — usuario; `recurso text` NULL — recurso HTTP; `recurso_id text` NULL — identificador del recurso; `status_code integer` NULL — resultado HTTP; `metadata jsonb` NULL — contexto; `created_at timestamptz` NULL default now — creación.
3. **cargos** — obligación interna histórica de un paciente.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes restrict; `turno_id integer` NULL FK→turnos set null; `prestacion_id integer` NULL FK→prestaciones set null; `concepto text` NN check no vacío — snapshot; `importe_total numeric(12,2)` NN check >0 — importe histórico; `fecha_cargo date` NN default current_date; `observaciones text` NULL; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now.
4. **configuracion_consultorio** — identidad y parámetros generales del consultorio/bot.
   - `id integer` NN PK; `nombre_consultorio varchar(150)` NN default Odonton; `whatsapp_numero varchar(30)` NULL; `timezone varchar(80)` NN default zona argentina; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now; `autogestion_keywords text` NN default lista de palabras — disparadores exactos configurables.
5. **configuracion_horarios_atencion** — horario general por día.
   - `id integer` NN PK; `dia_semana integer` NN UQ; `activo boolean` NN default false; `hora_desde time` NULL; `hora_hasta time` NULL; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now.
6. **configuracion_mensajes_automaticos** — plantillas de mensajes.
   - `id integer` NN PK; `tipo varchar(60)` NN UQ; `contenido text` NN; `activo boolean` NN default true; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now.
7. **documentos_paciente** — metadatos de documentos clínicos almacenados en filesystem.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes cascade; `nombre_archivo text` NN; `ruta_archivo text` NN; `tipo_archivo varchar(100)` NN; `descripcion text` NULL; `fecha_subida timestamptz` NN default now.
8. **historias_clinicas** — evoluciones clínicas existentes; la ficha solo las lee.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes restrict; `turno_id integer` NULL FK→turnos set null; `descripcion text` NN; `created_at timestamptz` NULL default now.
9. **odontograma** — estado por paciente, diente y cara.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes cascade; `diente smallint` NN; `cara varchar(20)` NN; `estado varchar(50)` NN; `fecha timestamp` NULL default current_timestamp; UQ(`paciente_id`,`diente`,`cara`).
10. **odontograma_meta** — metadatos generales del odontograma.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes cascade UQ; `sarro boolean` NN default false; `periodontal boolean` NN default false; `updated_at timestamp` NULL default current_timestamp; `observaciones text` NULL.
11. **pacientes** — datos personales y clínicos generales.
   - `id integer` NN PK; `nombre varchar(100)` NN; `apellido varchar(100)` NN; `dni varchar(20)` NN UQ; `nacionalidad varchar(50)` NULL; `domicilio varchar(255)` NULL; `telefono varchar(30)` NULL; `email varchar(150)` NULL; `fecha_nacimiento date` NULL; `observaciones text` NULL; `created_at timestamptz` NULL default now; `updated_at timestamptz` NULL default now; `alergias text` NULL; `condiciones text` NULL; `estado_tratamiento text` NULL.
12. **pagos** — aplicaciones monetarias a cargos, con anulación lógica.
   - `id integer` NN PK; `cargo_id integer` NN FK→cargos restrict; `importe numeric(12,2)` NN check >0; `metodo_pago varchar(30)` NN check efectivo/tarjeta/transferencia; `fecha_pago date` NN default current_date; `observaciones text` NULL; `estado varchar(10)` NN default activo check activo/anulado; `fecha_anulacion timestamptz` NULL; `motivo_anulacion text` NULL; `anulado_por_usuario_id integer` NULL FK→usuarios restrict; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now. Un check exige datos de anulación completos solo en estado anulado.
13. **prestaciones** — catálogo clínico y duración prevista.
   - `id integer` NN PK; `nombre varchar(100)` NN; `duracion_minutos integer` NN check >0; `precio_base numeric(10,2)` NULL — referencia, no ingreso; `activa boolean` NULL default true — flag legacy coexistente; `activo boolean` NULL default true — flag usado; `updated_at timestamptz` NULL.
14. **profesionales_horarios_atencion** — agenda semanal por profesional.
   - `id integer` NN PK; `profesional_id integer` NN referencia lógica a usuario/profesional, sin FK; `dia_semana integer` NN; `activo boolean` NN default false; `hora_desde time` NULL; `hora_hasta time` NULL; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now; UQ(`profesional_id`,`dia_semana`).
15. **protesis_fijas** — registro clínico de prótesis fija; backend existente, UI final no accesible.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes cascade; `tipo varchar(50)` NN; `dientes smallint[]` NN; `descripcion text` NULL; `fecha timestamptz` NN default now.
16. **protesis_removibles** — registro clínico de prótesis removible; backend existente, UI final no accesible.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes cascade; `tipo varchar(50)` NN; `arcada varchar(20)` NN; `descripcion text` NULL; `fecha timestamptz` NN default now.
17. **tratamientos** — tratamiento por pieza; backend existente, UI final no accesible.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes cascade; `diente smallint` NN; `tipo varchar(50)` NN; `observaciones text` NULL; `fecha timestamptz` NN default now.
18. **turno_solicitudes** — solicitudes supervisadas de alta/cambio de turno.
   - `id bigint` NN PK; `tipo_solicitud varchar(40)` NN; `estado varchar(30)` NN default pendiente; `paciente_id integer` NULL referencia lógica sin FK; `nombre_apellido text` NULL; `dni varchar(20)` NN; `telefono varchar(30)` NN; `motivo text` NULL; `preferencia_horaria text` NULL; `turno_id integer` NULL referencia lógica sin FK; `observaciones text` NULL; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now.
19. **turnos** — agenda y ciclo de vida del turno.
   - `id integer` NN PK; `paciente_id integer` NN FK→pacientes restrict; `prestacion_id integer` NULL FK→prestaciones restrict; `fecha_hora_inicio timestamptz` NULL; `fecha_hora_fin timestamptz` NULL check fin>inicio; `estado varchar(30)` NN default programado; `origen varchar(30)` NN default interno; `observaciones text` NULL; `created_at timestamptz` NULL default now; `updated_at timestamptz` NN default now; `fecha_cancelacion timestamptz` NULL; `recordatorio_procesado_at timestamptz` NULL; `recordatorio_enviado_at timestamptz` NULL; `recordatorio_estado text` NULL; `recordatorio_error text` NULL; `respuesta_paciente text` NULL; `respuesta_paciente_at timestamptz` NULL; `reprogramacion_token text` NULL legacy; `reprogramacion_token_expira_at timestamptz` NULL legacy; `profesional_id integer` NULL referencia lógica sin FK; `solicitud_preferencia text` NULL; `solicitud_confirmada_at timestamptz` NULL; `solicitud_rechazada_at timestamptz` NULL; `recordatorio_habilitado boolean` NN default true.
20. **usuarios** — autenticación del personal.
   - `id integer` NN PK; `nombre varchar(100)` NN; `email varchar(150)` NN UQ; `password_hash text` NN; `activo boolean` NULL default true; `created_at timestamptz` NULL default now.
21. **whatsapp_conversations** — sesión persistida de la máquina de estados del bot.
   - `id bigint` NN PK; `phone varchar(30)` NN; `status varchar(30)` NN default active; `step varchar(80)` NN; `paciente_id integer` NULL referencia lógica; `prestacion_id integer` NULL referencia lógica; `profesional_id integer` NULL referencia lógica; `turno_id integer` NULL referencia lógica; `data jsonb` NN default `{}`; `expires_at timestamptz` NN; `created_at timestamptz` NN default now; `updated_at timestamptz` NN default now.
22. **whatsapp_reminders** — registro de recordatorios enviados y respuestas.
   - `id integer` NN PK; `appointment_id integer` NN referencia lógica a turno, sin FK; `patient_id integer` NULL referencia lógica a paciente, sin FK; `phone varchar(30)` NN; `status varchar(50)` NN default pending_response; `sent_at timestamp` NULL default current_timestamp; `responded_at timestamp` NULL; `response_text text` NULL; `channel varchar(30)` NN default whatsapp; `created_at timestamp` NULL default current_timestamp.

## Prototipos

| Caso | Clasificación | Motivo |
|---|---|---|
| 2.1 | 🔴 NO REPRESENTA EL SISTEMA ACTUAL | Formulario sintético con nombre completo y datos clínicos inexistentes en el alta |
| 2.2 | 🔴 NO REPRESENTA EL SISTEMA ACTUAL | Repite formulario anterior, no la edición real |
| 2.3 | 🔴 NO REPRESENTA EL SISTEMA ACTUAL | Muestra ficha, no lista/búsqueda de pacientes |
| 2.4 | ✅ APTO | Corresponde a la ficha actual, con la salvedad textual sobre su alcance |
| 2.5 | ✅ APTO | Odontograma actual |
| 2.6 | ✅ APTO | Documentos actuales |
| 3.1 | ✅ APTO | Alta de turno actual |
| 3.2 | ✅ APTO | Edición actual |
| 3.3 | 🔴 NO REPRESENTA EL SISTEMA ACTUAL | Copia literal de 3.2; no evidencia reprogramación específica |
| 3.4 | ✅ APTO | Cancelación actual |
| 3.5 | ✅ APTO | Vista actual de agenda/disponibilidad |
| 3.6 | 🔴 NO REPRESENTA EL SISTEMA ACTUAL | Capturas del submenú WhatsApp retirado |
| 3.7 | ✅ APTO | Configuración/recordatorio actual |
| 4.1 | 🟡 REEMPLAZAR CAPTURA | Concepto aparece siempre obligatorio, pero es condicional a prestación |
| 4.2 | 🟡 REEMPLAZAR CAPTURA | Incluye un “estado esperado” demostrativo ausente del modal final |
| 4.3 | ✅ APTO | Representa anulación lógica e historial |
| 4.4 | ✅ APTO | Representa historial/constancia no fiscal |

Los reemplazos deben capturarse desde la interfaz real y con datos ficticios cargados, sin exponer datos personales reales.

## Terminología

- Usar como nombre final: **Gestión interna de cargos y pagos/cobros**.
- Usar: **Constancia interna de pago — no fiscal**.
- Usar en reportes: **ingresos reales**, calculados con pagos activos.
- No presentar `precio_base` como ingreso ni saldo/estado del cargo como columnas persistidas.
- Las menciones a Google Calendar en antecedentes son válidas si quedan claramente como contexto histórico; la solución final no lo integra.
- En la página 28, “constancias fuera de alcance” debe precisar “constancias para obras sociales/reintegros”, porque sí existe la constancia interna de pago.
- En la página 14, “facturación/recibo” debe quedar como descripción del problema o expectativa inicial, no como funcionalidad fiscal implementada.
- No se encontraron afirmaciones de integración con ARCA/CAE, factura electrónica, Mercado Pago o contabilidad profesional en el alcance final.

## Inconsistencias críticas

1. No existe un DER relacional independiente.
2. El diccionario actual no documenta las 22 tablas/197 columnas y usa entidades genéricas inexistentes.
3. El diagrama de clases integrado conserva atributos y modelos anteriores.
4. 2.3 documenta una consulta detallada/navegación no accesible desde la UI.
5. 2.4 atribuye a la ficha tratamientos, odontograma y evoluciones no mostrados.
6. 3.1 hace opcional la prestación y mezcla el estado `solicitado` con el alta interna.
7. 3.2 permite editar estado y describe incorrectamente el aviso WhatsApp.
8. 3.3 duplica íntegramente los artefactos visuales de 3.2.
9. 3.5 dice que `solicitado` ocupa agenda.
10. 3.6 documenta un flujo WhatsApp anterior y una preferencia de reprogramación que no se solicita.
11. Varios diagramas de secuencia usan services inexistentes o ubican autenticación, auditoría y WhatsApp en capas incorrectas.

## Ajustes menores

1. Actualizar campos/prototipo de 2.1.
2. Actualizar campos/prototipo de 2.2.
3. Precisar diente/caras y observación general en 2.5.
4. Precisar metadatos, formatos, 10 MB y descarga autenticada en 2.6.
5. Corregir el orden transacción/WhatsApp/auditoría de 3.4.
6. Precisar flags y reintento tras fallo en 3.7.
7. Aclarar concepto condicional y snapshot en 4.1.
8. Actualizar el prototipo demostrativo de 4.2.
9. Simplificar los diagramas de asociación demasiado técnicos.
10. Desambiguar “constancia” e “ingresos” en alcance/terminología.

## Elementos correctos

- Arquitectura predominante frontend → API → route → controller → service/domain → PostgreSQL.
- JWT, hash de contraseña, `.env` ignorado y manejo de errores sin stack en producción.
- DNI único y validaciones básicas de paciente.
- Lectura de ficha clínica sin creación automática de historias.
- Documentos con descarga autenticada y sin exposición pública de `/uploads`.
- Modelo actual de odontograma por cara más metadatos.
- Control de disponibilidad por profesional y prevención de superposición.
- WhatsApp supervisado: el paciente solicita y el odontólogo decide horario final.
- Paciente nuevo limitado a Primera Consulta y una solicitud activa por paciente.
- Recordatorios opcionales, con control global/individual y respuestas transaccionales.
- Modelo Paciente → Cargo → Pago(s), importe/concepto históricos y pagos parciales.
- Sobrepago bloqueado con transacción/lock y anulación lógica.
- Constancia interna no fiscal e ingresos reales en reportes.
- Separación explícita de Google Calendar y de la facturación fiscal del alcance final.

## Matriz final

| Elemento | Tesis | Sistema | Estado | Acción |
|---|---|---|---|---|
| 2.1 Registrar paciente | Incluye datos clínicos en alta | Alta general sin alergias/condiciones | 🟡 | Ajustar campos, secuencia y captura |
| 2.2 Actualizar paciente | Edición general/clínica | Edición de campos generales visibles | 🟡 | Ajustar texto y captura |
| 2.3 Consultar pacientes | Vista detalle y navegación amplia | Lista/búsqueda con Ficha/Odonto/Editar | 🔴 | Reescribir caso y reemplazar artefactos |
| 2.4 Ficha clínica | Consolida tratamientos/odonto/evoluciones | Datos/turnos/documentos; odonto separado | 🔴 | Reducir alcance y regenerar secuencia |
| 2.5 Odontograma | Varios dientes/observaciones clínicas | Diente seleccionado, caras y meta general | 🟡 | Precisar reglas y participantes |
| 2.6 Documentos | Tipo/observaciones ingresados | MIME derivado, descripción, 10 MB, auth | 🟡 | Ajustar campos y secuencia |
| 3.1 Registrar turno | Prestación opcional; programado/solicitado | Prestación obligatoria; programado | 🔴 | Corregir ficha y diagramas |
| 3.2 Editar turno | Edita estado; aviso condicional | Estado por operaciones; intento WA posterior | 🔴 | Corregir reglas y secuencia |
| 3.3 Reprogramar | Artefactos copiados de editar | Operación específica y cierre de solicitud | 🔴 | Regenerar asociación, secuencia y prototipo |
| 3.4 Cancelar | Flujo principal correcto | Transacción y WhatsApp opcional post-commit | 🟡 | Corregir responsabilidades |
| 3.5 Disponibilidad | `solicitado` ocupa agenda | Solo programado/confirmado/reprogramado | 🔴 | Corregir estados y service |
| 3.6 WhatsApp | Submenú y preferencia al reprogramar | Detección por DNI; no pide nueva preferencia | 🔴 | Reescribir y reemplazar capturas |
| 3.7 Recordatorios | Uno por turno, intentado/enviado | Uno exitoso; fallos pueden reintentarse | 🟡 | Precisar flags y fallos |
| 4.1 Crear cargo | Concepto siempre obligatorio en captura | Concepto condicional; snapshot NN en DB | 🟡 | Ajustar redacción/captura |
| 4.2 Registrar pago | Pago parcial/total y saldo | Coincide, con lock y estado calculado | ✅ | Conservar; captura opcional |
| 4.3 Anular pago | Anulación lógica | Coincide | ✅ | Conservar |
| 4.4 Historial/constancia | Interna, no fiscal, ingresos reales | Coincide | ✅ | Conservar |
| Arquitectura | Capas web | Predomina y coincide | ✅ | Afinar diagramas, no reescribir arquitectura |
| Diagrama de clases | Dominio con atributos persistentes antiguos | Dominio/esquema actual difieren | 🔴 | Regenerar como modelo conceptual |
| DER | No identificable como artefacto separado | 22 tablas y 16 FK físicas | 🔴 | Crear DER independiente |
| Diccionario | Resumen de entidades | 22 tablas/197 columnas | 🔴 | Reemplazar por diccionario completo |
| Prototipos | 17 imágenes | 5 no representan y 2 requieren actualización | 🔴 | Reemplazar capturas indicadas |
| Terminología | Mayormente correcta | Gestión interna no fiscal | 🟡 | Desambiguar dos menciones |

## Conclusión

- **DER coherente:** NO.
- **Diccionario coherente:** NO.
- **Diagrama de clases coherente:** NO.
- **Tesis coherente con el sistema:** SÍ CON AJUSTES.
- **Listo para corrección documental:** SÍ.

Las correcciones no requieren reabrir módulos congelados ni cambiar la base: consisten en alinear texto, diagramas, prototipos y estructura de datos con el sistema ya implementado.
