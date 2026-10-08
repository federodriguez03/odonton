# Plan de corrección documental de la tesis Odonton

Orden basado en la paginación actual de `Tesis_Odonton_revision_profesor_FINAL.docx`. Los números pueden desplazarse al aplicar cambios anteriores. Este archivo contiene únicamente cambios a realizar en el Word.

---

SECCIÓN: Página 14 — Situación problemática / facturación

PROBLEMA: “Facturación” y “recibo” pueden interpretarse como una promesa de funcionalidad fiscal final.

REEMPLAZAR: Las expresiones que presentan facturación/recibo sin distinguir contexto o alcance.

POR: “La situación inicial evidenció la necesidad de registrar internamente cargos y pagos y emitir una constancia interna no fiscal. La solución no implementa facturación electrónica ni integración fiscal.”

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 23–30 — Alcance, módulos y requisitos de Pacientes

PROBLEMA: Se atribuyen a la ficha clínica tratamientos, evoluciones y odontograma integrados que la interfaz final no muestra; tratamientos/prótesis tienen backend pero no acceso desde la navegación final.

REEMPLAZAR: Toda afirmación de que la ficha consolida o permite gestionar tratamientos, prótesis, odontograma y evoluciones.

POR: “La ficha clínica consulta datos generales y clínicos existentes, última visita, próximo turno, historial paginado de turnos y documentos. El odontograma se gestiona desde una acción independiente. Consultar la ficha es una lectura y no crea historias clínicas.” Retirar tratamientos/prótesis del alcance visible final o identificarlos expresamente como backend no expuesto y fuera de la demo.

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Página 28 — Exclusiones sobre constancias

PROBLEMA: “Constancias fuera de alcance” contradice de forma aparente la constancia interna de pago implementada.

REEMPLAZAR: La exclusión genérica de reintegros o constancias.

POR: “Quedan fuera de alcance las gestiones con obras sociales, reintegros y constancias destinadas a terceros. El sistema solo genera una constancia interna de pago, no fiscal.”

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 44–48 — 2.1 Registrar paciente

PROBLEMA: La ficha/prototipo incluye “nombre completo”, antecedentes y alergias; el alta real usa nombre y apellido separados y no expone campos clínicos. La secuencia ubica autenticación y auditoría en capas incorrectas.

REEMPLAZAR: Campos y curso que indiquen antecedentes/alergias en alta; participantes actuales del diagrama.

POR: Campos obligatorios `nombre`, `apellido`, `dni`; opcionales `teléfono`, `email`, `nacionalidad`, `domicilio`, `fecha de nacimiento`, `observaciones`. DNI de 7–10 dígitos y único. Flujo: Vista → api.js → route + middlewares JWT/validación → controller → pacientesService → PostgreSQL → auditoría middleware.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: SÍ

---

SECCIÓN: Páginas 48–53 — 2.2 Actualizar paciente

PROBLEMA: Repite campos clínicos no visibles y un prototipo que no corresponde al formulario final; autenticación/auditoría están mal ubicadas.

REEMPLAZAR: Alcance de campos y artefactos del modelo anterior.

POR: Edición de los campos generales visibles del paciente, conservando validación y unicidad de DNI. Flujo por route/middlewares/controller/service/DB.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: SÍ

---

SECCIÓN: Páginas 53–58 — 2.3 Consultar / visualizar pacientes

PROBLEMA: Describe una vista detalle con navegación a tratamientos, pagos y documentos; la UI real ofrece lista/búsqueda y acciones Ficha, Odonto y Editar. El prototipo es de ficha clínica.

REEMPLAZAR: Nombre, objetivo, curso y acciones que suponen un detalle independiente.

POR: “Listar y buscar pacientes”. El usuario filtra por nombre/apellido o DNI y abre Ficha, Odonto o Editar desde la tabla. No afirmar que `GET /api/pacientes/:id` tiene una vista consumidora propia.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: SÍ

---

SECCIÓN: Páginas 58–63 — 2.4 Consultar ficha clínica

PROBLEMA: La ficha se presenta como agregador de tratamientos, odontograma, documentos y evoluciones; la secuencia muestra una orquestación inexistente.

REEMPLAZAR: Curso, postcondiciones y secuencia que incluyan escritura o módulos no visibles.

POR: “La consulta es de lectura pura. Muestra datos generales/clínicos, última visita, próximo turno e historial paginado. La vista consulta documentos por un endpoint separado. No muestra historias existentes, tratamientos ni odontograma; este último se abre aparte.” Flujo: View → ficha route/controller/pacientesService → DB; y View → documentos API/stack → DB/filesystem.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 63–68 — 2.5 Gestionar odontograma

PROBLEMA: Se afirma selección múltiple y observaciones por tratamiento/evolución; la secuencia pasa por capas de Pacientes.

REEMPLAZAR: “uno o varios dientes” y el flujo PacientesController/PacientesService.

POR: “Se selecciona un diente y se asignan estados a sus caras. Sarro, periodontal y observaciones son metadatos generales.” Usar estados `sano`, `existente`, `requerido`, `corona`, `protesis_fija`, `protesis_removible`, `ausente`. Flujo `/api/odontograma` → odontogramaRoutes → odontogramaController → odontogramaService → `odontograma`/`odontograma_meta`.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 68–73 — 2.6 Adjuntar documentos

PROBLEMA: Se documentan tipo y observaciones ingresados por usuario y capas de Pacientes inexistentes en el flujo.

REEMPLAZAR: Campos y participantes incorrectos.

POR: Archivo PDF/JPEG/PNG hasta 10 MB y descripción opcional; tipo derivado del MIME. JWT obligatorio para subir, listar, descargar y eliminar. Flujo: View/FormData → documentos route + auth + Multer → controller → documentosService → PostgreSQL/filesystem. No existe acceso público `/uploads`.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 73–78 — 3.1 Registrar turno

PROBLEMA: Presenta prestación como opcional y estado inicial `programado` o `solicitado`; usa services separados que no participan.

REEMPLAZAR: Reglas de prestación/estado y secuencia actual.

POR: En alta interna, paciente, prestación y fecha/hora son obligatorios; la duración puede derivarse de la prestación. Se valida horario profesional y superposición y se crea `programado`, origen `interno`. `solicitado` pertenece a solicitudes WhatsApp. La disponibilidad se resuelve en turnosService.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 79–84 — 3.2 Editar turno

PROBLEMA: Permite editar estado arbitrariamente y presenta WhatsApp como selección previa/condicional; incluye `DisponibilidadService` inexistente.

REEMPLAZAR: Campos editables, regla de estado y orden del aviso.

POR: La edición conserva el estado; confirmar, reprogramar y cancelar son operaciones específicas. Tras persistir la edición se intenta WhatsApp; su fallo no revierte. La validación de disponibilidad está en turnosService.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 84–89 — 3.3 Reprogramar turno

PROBLEMA: Vista estática, secuencia y prototipo son copias literales de 3.2.

REEMPLAZAR: Los tres artefactos visuales duplicados y cualquier texto que no distinga la operación específica.

POR: Artefactos propios que muestren nuevo intervalo, validación de disponibilidad, transición a `reprogramado`, resolución atómica de solicitud pendiente cuando corresponda, commit y notificación posterior.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: SÍ

---

SECCIÓN: Páginas 89–94 — 3.4 Cancelar turno

PROBLEMA: La secuencia atribuye WhatsApp/auditoría al service y no representa con claridad commit previo al aviso.

REEMPLAZAR: Orden y responsabilidades del flujo dinámico.

POR: Controller → cancelarTurno transaccional (`FOR UPDATE`, turno cancelado y solicitudes cerradas) → commit → notificación WhatsApp opcional. Auditoría mediante middleware. Un fallo de WhatsApp no revierte la cancelación.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 94–100 — 3.5 Controlar disponibilidad

PROBLEMA: Incluye `solicitado` entre estados que ocupan agenda y un `DisponibilidadService` inexistente.

REEMPLAZAR: Lista de estados y participante de negocio.

POR: Solo `programado`, `confirmado` y `reprogramado` bloquean intervalos. Las solicitudes no tienen horario definitivo. `turnosService` valida horarios profesionales, duración y superposición por profesional.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 100–106 — 3.6 Gestionar solicitudes por WhatsApp

PROBLEMA: Documenta submenú “ya me atendí/primera vez” y preferencia nueva en reprogramación, ambos retirados. Omite la unicidad de solicitud activa.

REEMPLAZAR: Curso normal, alternativos, secuencia y capturas del flujo anterior.

POR: Inicio por palabra clave exacta o 1/2/3 desde evento entrante; menú 1 solicitar, 2 reprogramar, 3 cancelar, 0 salir. DNI detecta paciente. Nuevo: nombre/apellido y solo Primera Consulta. Solicitud nueva: motivo y preferencia libre. Reprogramación: DNI + turno futuro, sin pedir nuevo horario. Cancelación: confirmación. El odontólogo define el horario y solo puede existir una solicitud activa por paciente.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: SÍ

---

SECCIÓN: Páginas 106–112 — 3.7 Enviar recordatorios automáticos

PROBLEMA: Equipara “enviado o intentado” con máximo uno y asigna consultas a services que no participan.

REEMPLAZAR: Regla de unicidad absoluta del intento y secuencia actual.

POR: “Se envía como máximo un recordatorio exitoso por turno. Requiere habilitación global e individual, turno programado/confirmado y ventana configurable de hasta 24 horas. Un fallo se registra y puede reintentarse mientras el turno siga elegible.” Secuencia mediante scheduler/whatsappReminderService/DB/whatsappClient y turnoSolicitudesService para cambios.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 113–116 — 4.1 Crear cargo

PROBLEMA: La captura hace siempre obligatorio el concepto; el runtime permite construirlo desde la prestación, aunque la DB guarda siempre un snapshot no vacío.

REEMPLAZAR: Afirmación/asterisco de obligatoriedad absoluta.

POR: “Debe informarse un concepto o seleccionarse una prestación que permita construirlo. El concepto y el importe guardados son históricos. Turno y prestación son opcionales; paciente e importe positivo son obligatorios.”

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: SÍ

---

SECCIÓN: Páginas 117–120 — 4.2 Registrar pago

PROBLEMA: El prototipo incluye “estado esperado”, control demostrativo que no aparece en el modal final.

REEMPLAZAR: Captura idealizada si se exige correspondencia visual exacta.

POR: Captura del modal real con cargo/saldo, importe, fecha, método y observaciones; puede conservar el texto sobre resultado calculado en la ficha, no como campo editable.

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: SÍ

---

SECCIÓN: Páginas 113–128 — Vistas estáticas del paquete Cargos/Pagos

PROBLEMA: Las vistas estáticas convierten bloqueos, cálculos, validaciones y guardado en casos de uso incluidos.

REEMPLAZAR: Subcasos puramente técnicos como `Bloquear cargo`, `Calcular saldo` o `Guardar` cuando no representan metas del actor.

POR: Diagramas simples con odontólogo/usuario y los objetivos Crear cargo, Registrar pago, Anular pago, Consultar historial y Generar constancia. Mantener validaciones en las fichas y secuencias.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Página 128 — Implementación / módulo Pacientes

PROBLEMA: El resumen de implementación puede reiterar que ficha, tratamientos, prótesis y odontograma forman una única experiencia final.

REEMPLAZAR: Descripción que presente funciones no accesibles como parte de la navegación final.

POR: “Pacientes permite alta, edición, listado/búsqueda, ficha clínica de lectura, documentos autenticados y odontograma independiente. Tratamientos y prótesis no forman parte de la interfaz final demostrada.”

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 130–131 — Diagrama de clases integrado

PROBLEMA: Mezcla dominio y persistencia; muestra `Usuario.rol`, Configuración genérica, Odontograma agregado, `duracion_estimada`, `Turno.duracion` y nombres anteriores de solicitud/recordatorio.

REEMPLAZAR: Diagrama integrado actual.

POR: Modelo conceptual separado del DER, con Usuario, Paciente, Turno, Prestación, SolicitudTurno, DocumentoPaciente, HistoriaClinica, Odontograma/OdontogramaMeta, Cargo, Pago y Auditoría. Usar relaciones actuales Paciente→Cargo→Pago(s), atributos de dominio vigentes y cardinalidades comprobables. Omitir columnas técnicas que no aporten al dominio.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Después del diagrama de clases, antes del diccionario — DER nuevo

PROBLEMA: No existe un DER relacional independiente.

REEMPLAZAR: No aplica; es un artefacto faltante.

POR: Incorporar un DER basado en `schema_actual.sql`, con nombres de tabla, PK, FK y cardinalidades reales. Incluir núcleo clínico, turnos y cargos/pagos; separar tablas técnicas si la legibilidad lo requiere. Identificar relaciones lógicas sin FK y no presentar `archivos_clinicos` como módulo activo.

DIAGRAMA A REGENERAR: SÍ

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Página 132 — Diccionario de datos

PROBLEMA: Es un resumen de entidades, no un diccionario completo; combina odontograma/meta, usa `configuracion` inexistente y omite tablas/columnas/restricciones.

REEMPLAZAR: Tabla resumen actual como único diccionario.

POR: Diccionario de las 22 tablas y 197 columnas de `schema_actual.sql`, consignando columna, tipo/longitud/precisión, NULL/NOT NULL, PK, FK, default y significado. Separar activas relevantes, técnicas y legacy. Usar las especificaciones de `AUDITORIA_TESIS_VS_SISTEMA_FINAL.md` como base y expandirlas en formato tabular.

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Páginas 132–134 — Seguridad, despliegue y cierre

PROBLEMA: Falta reforzar dos decisiones finales importantes: documentos sin URL pública y constancia no fiscal; también conviene distinguir datos legacy del alcance activo.

REEMPLAZAR: Descripciones genéricas de archivos y facturación si no expresan estas restricciones.

POR: “Los documentos se descargan exclusivamente mediante endpoint autenticado; `/uploads` no se publica. La constancia de pago es interna y no fiscal. Google Calendar, links/token legacy, facturación electrónica, obras sociales y plataformas de pago están fuera de alcance.”

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: NO

---

SECCIÓN: Página 134 — Pendientes de validación/manual y cierre documental

PROBLEMA: La versión final debe dejar trazabilidad de que los prototipos reemplazados usan datos ficticios cargados y de que los módulos congelados fueron validados.

REEMPLAZAR: Lista de pendientes que todavía presente como no verificados casos ya cerrados, si existe.

POR: Referenciar el cierre de Turnos/WhatsApp y Cargos/Pagos y dejar como pendiente exclusivamente la corrección documental indicada en este plan. Aclarar que las capturas usan datos ficticios y no información personal real.

DIAGRAMA A REGENERAR: NO

PROTOTIPO A REEMPLAZAR: NO
