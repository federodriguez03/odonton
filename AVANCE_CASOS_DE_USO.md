## Ficha Reescrita 2.5 Visualizar/consultar pacientes (alineada a implementacion)

Caso de uso: 2.5 Visualizar/consultar pacientes  
Actor principal: Odontologo  
Objetivo: listar pacientes, aplicar filtros/orden y consultar detalle.

Precondiciones:
- Odontologo autenticado.
- Servicio de base de datos operativo.

Postcondiciones:
- Se muestra listado filtrado/paginado o detalle solicitado.
- Se registra auditoria de consulta.

Curso normal:
1. El odontologo accede al modulo Pacientes.
2. El sistema muestra listado paginado (orden por apellido asc por defecto).
3. El odontologo puede:
- Navegar paginas.
- Ordenar por columnas permitidas.
- Filtrar por nombre/apellido parcial y DNI exacto.
4. El odontologo selecciona un paciente.
5. El sistema muestra ficha detallada con todos los campos.

Curso alternativo:
1. No hay coincidencias de filtro:
- El sistema informa "No se encontraron pacientes".
2. Parametros invalidos en consulta:
- El sistema responde 400 con detalle de error.
3. Paciente inexistente en consulta de detalle:
- El sistema responde 404.

Reglas de negocio:
- Solo usuarios con rol odontologo pueden listar/consultar.
- DNI unico por paciente.
- Se respeta paginacion y limite maximo para proteger rendimiento.

Validaciones:
- page >= 1.
- limit entre 1 y 100.
- sort solo en columnas permitidas y direccion sc/desc.
- q texto libre para nombre/apellido.
- dni exacto con formato valido.
- Sanitizacion por queries parametrizadas (sin concatenacion insegura).

---

## Ficha Reescrita 2.6 Gestionar odontograma (alineada a implementacion)

CASO DE USO 2.6: Gestionar odontograma  
Actor principal: Odontologo  
Objetivo: Registrar y actualizar el estado clinico vigente de cada pieza dental (FDI) por caras, con meta (sarro, periodontal, observaciones) y exportar evidencia en PDF.

Precondiciones
- Odontologo autenticado.
- Paciente existe y esta seleccionado.
- Base de datos operativa.

Postcondiciones
- Estado por cara del odontograma del paciente actualizado en BD.
- Metadatos de sarro/periodontal/observaciones guardados.
- (Opcional) PDF generado con leyenda y estado actual.

Curso normal / alternativo
1. El odontologo selecciona un paciente y abre odontograma.  
   1.1 Sin paciente seleccionado: se bloquea el guardado y se informa.  
2. El sistema carga estado por cara y meta (sarro, periodontal, observaciones) desde BD.  
3. Odontologo elige denticion a mostrar (permanente/temporal/mixta).  
4. Odontologo selecciona un diente y un estado:  
   - Si el estado afecta a toda la pieza (sano, protesis fija/removible, ausente), se aplican todas las caras.  
   - Si es un estado por cara, se aplica solo a la cara clickeada.  
5. Odontologo actualiza meta: sarro, periodontal y observaciones generales.  
6. Odontologo pulsa Guardar:  
   - El sistema envia todas las caras de todos los dientes cargados mas la meta.  
   - El sistema valida FDI, caras y estados y persiste en odontograma y odontograma_meta.  
   6.1 Validacion falla (FDI/cara/estado): se informa y no se guarda.  
   6.2 Sin cambios: se informa que no hay cambios.  
7. Odontologo opcionalmente exporta PDF:  
   - El sistema genera vista imprimible con leyenda de colores, datos del paciente, denticion, sarro/periodontal, observaciones y el SVG del odontograma.  
8. El sistema confirma guardado.  
   8.1 Si ocurre un error al guardar los datos, el sistema informa el error y no actualiza el odontograma.

Reglas de negocio
- Sistema de numeracion FDI: permanente (11-48) y temporal (51-85).
- Caras validas: vestibular, mesial, distal, oclusal, lingual.
- Estados permitidos: sano (blanco), prestacion existente (rojo), prestacion requerida (azul), corona (amarillo), protesis fija (celeste), protesis removible (verde agua), ausente o a extraer (gris oscuro).
- Estados que afectan pieza completa: sano, protesis fija, protesis removible, ausente.
- No se almacenan historicos aqui: el odontograma representa solo el estado actual.

Validaciones
- paciente_id requerido.
- Diente FDI: regex ^(?:[1-4][1-8]|[5-8][1-5])$.
- Cara en {vestibular, mesial, distal, oclusal, lingual}
- Estado en catalogo permitido.
- Meta: sarro/periodontal booleanos; observaciones texto.
- Guardar sin diente solo permite meta (sarro/periodontal/observaciones).

---

## Ficha Reescrita 2.7 Consultar ficha clinica (alineada a implementacion)

Caso de uso: 2.7 Consultar ficha clinica  
Actor principal: Odontologo  
Objetivo: visualizar la ficha clinica completa de un paciente con datos personales ampliados, resumen clinico y historial de turnos con filtros.

Precondiciones
- Odontologo autenticado.
- Paciente existe en la base.
- Servicio de BD operativo.

Postcondiciones
- Se muestra la ficha actualizada del paciente.
- La consulta queda registrada en auditoria (historias_clinicas).
- Datos sensibles visibles solo con autorizacion.

Curso normal / alternativo
1. Odontologo abre modulo Pacientes y selecciona un paciente.  
   1.1 Paciente inexistente: el sistema devuelve 404 "Paciente no encontrado".  
2. El sistema obtiene y muestra la ficha con:  
   - Datos personales: nombre, apellido, DNI, nacionalidad, edad calculada, domicilio, contacto.  
   - Datos medicos: alergias, condiciones, estado de tratamiento, observaciones clinicas.  
   - Resumen clinico: ultima visita (realizado), proximo turno programado, prestacion mas reciente.  
   - Historial de turnos paginado.  
   2.1 Si el paciente no tiene turnos, se muestra "Sin historial de turnos".  
3. El odontologo puede filtrar historial por estado (programado, realizado, cancelado, reprogramado) y ordenar por fecha asc/desc.  
4. Al cambiar filtros/pagina el sistema recarga la tabla de turnos.  
5. El sistema registra en auditoria la consulta de ficha clinica.

Reglas de negocio
- Solo usuarios con rol odontologo pueden consultar fichas.
- La ficha corresponde al paciente autenticado/seleccionado.
- Historial es inmutable; turnos pasados no se editan (solo pueden cancelarse si aplica).
- Edad se calcula desde echa_nacimiento.

Validaciones
- paciente_id numerico y existente.
- Parametros opcionales: estado_turno en {programado, realizado, cancelado, reprogramado}; sort en {fecha:asc, fecha:desc}; page >= 1; limit <= 50.
- Responder 400 ante parametros invalidos, 401/403 si no esta autenticado/autorizado, 404 si el paciente no existe.

---

## Ficha Reescrita 2.8 Adjuntar documento a paciente (integrado en ficha clinica)

Caso de uso: 2.8 Adjuntar documento a paciente  
Actor principal: Recepcionista / Odontologo  
Objetivo: subir, consultar, descargar y eliminar documentos clinicos asociados a un paciente.

Precondiciones
- Usuario autenticado.
- Paciente existe.
- Carpeta de uploads disponible.

Postcondiciones
- Documento almacenado en el servidor y asociado al paciente.
- Registro creado en base de datos (documentos_paciente).

Curso normal
1. El usuario accede a la ficha clinica del paciente.
2. En la seccion "Documentos del paciente" selecciona el archivo (PDF/JPG/PNG).
3. (Opcional) Ingresa una descripcion.
4. Presiona "Subir".
5. El sistema valida tipo y tamanio del archivo.
6. El sistema guarda el archivo en /uploads/documentos.
7. El sistema registra el documento en la base de datos.
8. El sistema lista el documento en la grilla con acciones de descargar/eliminar.

Curso alternativo
1. Archivo invalido:
- El sistema informa "Tipo de archivo no permitido".
2. Archivo demasiado grande:
- El sistema informa el limite permitido.
3. Error de subida o almacenamiento:
- El sistema informa el error y no registra el documento.
4. Paciente inexistente:
- El sistema informa "Paciente no encontrado".

Reglas de negocio
- Tipos permitidos: PDF, JPG, PNG.
- Tamanio maximo por archivo: 10MB.
- Solo usuarios autenticados pueden gestionar documentos.

Validaciones
- paciente_id requerido y numerico (obtenido desde la ficha clinica activa).
- archivo requerido.
- descripcion opcional (texto).

---

## Ficha Reescrita 1.1 Autenticacion de usuarios (login, sesion y acceso)

Caso de uso: 1.1 Autenticacion de usuarios  
Actor principal: Odontologo  
Objetivo: permitir el ingreso seguro al sistema mediante credenciales, emitir JWT, proteger rutas y consultar el usuario autenticado.

Precondiciones
- Usuario registrado en tabla usuarios y activo.
- Backend disponible y base de datos operativa.
- JWT_SECRET configurado en el entorno.

Postcondiciones
- Usuario autenticado con token JWT valido por 8 horas.
- Token almacenado en el frontend y enviado en Authorization.
- Acceso habilitado a modulos protegidos.

Curso normal
1. El usuario abre la pantalla de login.
2. Ingresa email y contraseña y envia el formulario.
3. El backend valida credenciales:
   - Busca usuario por email.
   - Verifica password con bcrypt.
4. Si las credenciales son correctas, el backend emite JWT con userId y email y expiracion 8h.
5. El frontend guarda el token y consulta /api/auth/me.
6. El sistema muestra el panel y el nombre del usuario en el header.

Curso alternativo
1. Credenciales invalidas:
   - El backend responde 401 "Credenciales invalidadas".
   - El frontend muestra mensaje de error y no habilita el panel.
2. Token invalido o expirado:
   - El backend responde 401 en rutas protegidas.
   - El frontend borra token y vuelve a login con mensaje "Sesion expirada".

Reglas de negocio
- El token se envia en Authorization: Bearer TOKEN.
- Expiracion de token configurada en 8 horas.
- Solo usuarios autenticados pueden acceder a pacientes, turnos, documentos, etc.

Validaciones
- Email requerido y con formato valido.
- Password requerido.
- Respuestas en JSON con mensaje claro.

Endpoints
- POST /api/auth/login
- GET /api/auth/me

---

## Ficha Reescrita 1.2 Gestionar agenda de turnos (alineada a implementacion)

Caso de uso: 1.2 Gestionar agenda de turnos  
Actor principal: Odontologo  
Objetivo: crear, editar, reprogramar, cancelar y consultar turnos desde la agenda, con validaciones de horarios y solapamientos.

Precondiciones
- Usuario autenticado con rol odontologo.
- Paciente y prestacion existen.
- Base de datos operativa.
- Horario de atencion configurado (WORKDAY_START_HOUR / WORKDAY_END_HOUR).

Postcondiciones
- Turno registrado/actualizado/cancelado segun la accion.
- Agenda actualizada en la vista diaria/semanal.
- Auditoria registrada.
- Agenda interna actualizada y notificacion WhatsApp si corresponde.

Curso normal
1. El odontologo abre la agenda (modulo Turnos).
2. El sistema lista turnos con filtros (estado, paciente, rango de fechas) y orden.
3. El odontologo puede:
   - Crear un turno indicando paciente, prestacion, fecha/hora y observaciones.
   - Editar un turno programado/reprogramado/confirmado.
   - Cancelar un turno programado/reprogramado/confirmado.
4. El sistema valida:
   - Fecha/hora no en el pasado.
   - Duracion valida (>= 15 min).
   - Horario dentro de la jornada.
   - No hay solapamientos con turnos activos.
5. El sistema guarda el turno y actualiza la agenda.
6. Si corresponde, registra el cambio en la agenda interna y procesa notificacion WhatsApp.
7. El sistema devuelve mensaje de exito y la agenda refleja el cambio.

Curso alternativo
1. Datos incompletos o invalidos:
   - El sistema responde 400 con el motivo (faltan datos, fecha invalida, duracion invalida).
2. Paciente o prestacion inexistente:
   - El sistema responde 400 "No existe".
3. Horario fuera de jornada:
   - El sistema responde 400 con mensaje de horario invalido.
4. Solapamiento con otro turno activo:
   - El sistema responde 400 "Horario no disponible".
5. Estado no editable/cancelable:
   - El sistema responde 400 indicando el estado que no permite la accion.

Reglas de negocio
- Estados activos: programado, reprogramado, confirmado.
- Estados no editables/cancelables: cancelado y realizado.
- Duracion minima: 15 minutos.
- No se permiten turnos en el pasado.
- No se permiten solapamientos entre turnos activos.
- Horario de atencion configurable por variables de entorno.

Validaciones
- pacienteId y prestacionId requeridos.
- fechaHoraInicio valida y futura.
- duracionMinutos > 0 (si se envia) o usar duracion de prestacion.
- fechaHoraFin calculada con duracion.
- filtros de listado: page >= 1, limit <= 100, sort solo campos permitidos.

Endpoints
- GET /api/turnos
- POST /api/turnos
- PUT /api/turnos/:id
- PUT /api/turnos/:id/reprogramar
- PUT /api/turnos/:id/cancelar

---

## Ficha Reescrita 1.3 Gestionar prestaciones/tratamientos disponibles (seccion Personal)

Caso de uso: 1.3 Gestionar tratamientos clinicos disponibles  
Actor principal: Odontologo  
Objetivo: administrar el catalogo de prestaciones/tratamientos disponibles, definiendo duracion predeterminada, precio base y estado activo.

Precondiciones
- Usuario autenticado con rol odontologo.
- Base de datos operativa.

Postcondiciones
- Catalogo de prestaciones actualizado (alta/edicion/activacion/desactivacion).
- Disponibilidad reflejada en la agenda y formularios de turnos.
- Auditoria registrada.

Curso normal
1. El odontologo accede a la seccion Personal > Prestaciones/Tratamientos.
2. El sistema lista las prestaciones disponibles.
3. El odontologo puede:
   - Registrar una nueva prestacion (nombre, duracion, precio, activa).
   - Editar una prestacion existente.
   - Activar o desactivar una prestacion.
4. El sistema valida datos y guarda cambios.
5. El catalogo se actualiza y se refleja en la agenda de turnos.

Curso alternativo
1. Datos incompletos o invalidos:
   - El sistema informa el campo requerido o valor invalido.
2. Prestacion inexistente al editar:
   - El sistema informa "Prestacion no encontrada".
3. Nombre duplicado:
   - El sistema informa "Prestacion ya registrada".

Reglas de negocio
- Nombre obligatorio y unico (normalizado).
- Duracion minima 15 minutos.
- Precio base >= 0.
- Estado activo define si puede usarse al crear turnos.

Validaciones
- nombre requerido.
- duracion_minutos requerida y valida (>= 15).
- precio_base requerido y >= 0.
- activo booleano.

Endpoints (esperados)
- GET /api/prestaciones
- POST /api/prestaciones
- PUT /api/prestaciones/:id
- PUT /api/prestaciones/:id/activar
- PUT /api/prestaciones/:id/desactivar

Estado actual
- Implementado: listado, alta, edicion, activar y desactivar prestaciones.

---

## CU-5.1 Generar reportes de atencion y facturacion

Nombre del caso de uso  
Generar reportes de atencion y facturacion

Actor principal  
Usuario del sistema (operador del consultorio odontologico)

Descripcion  
Este caso de uso permite al usuario generar reportes que muestren informacion sobre las atenciones realizadas a pacientes y los pagos registrados en el sistema, dentro de un periodo determinado. Los reportes permiten analizar la actividad clinica del consultorio y los ingresos generados.

Precondiciones
- El usuario debe estar autenticado en el sistema.
- Deben existir registros de turnos, tratamientos o pagos en la base de datos.
- El usuario debe acceder al modulo de reportes del sistema.

Postcondiciones
- El sistema genera un reporte con los datos solicitados segun los filtros aplicados.
- El reporte se presenta al usuario en forma de tabla o listado en la interfaz del sistema.
- El usuario puede visualizar la informacion de atenciones realizadas y pagos registrados dentro del periodo seleccionado.
- El sistema mantiene la integridad de los datos, sin realizar modificaciones en la base de datos.

Flujo principal
1. El usuario accede al modulo de reportes del sistema.
2. El sistema muestra las opciones de generacion de reportes.
3. El usuario selecciona el reporte de atencion y facturacion.
4. El sistema solicita al usuario ingresar los criterios de filtrado (por ejemplo, rango de fechas).
5. El usuario ingresa los valores de filtrado.
6. El usuario solicita la generacion del reporte.
7. El sistema consulta la base de datos utilizando los criterios especificados.
8. El sistema procesa la informacion obtenida.
9. El sistema genera el reporte correspondiente.
10. El sistema muestra el reporte en pantalla al usuario.

Flujos alternativos
A1 — No existen registros en el periodo seleccionado
1. El sistema realiza la consulta de datos.
2. No se encuentran registros que coincidan con los criterios de busqueda.
3. El sistema informa al usuario que no existen datos para los filtros seleccionados.

A2 — Filtros incompletos o invalidos
1. El usuario ingresa valores de filtrado incorrectos o incompletos.
2. El sistema detecta la inconsistencia.
3. El sistema solicita al usuario corregir los valores ingresados antes de generar el reporte.

Reglas de negocio
RN1 — Los reportes deben generarse unicamente a partir de informacion registrada en el sistema.
RN2 — Los reportes de atencion se basan en la informacion de turnos y tratamientos registrados para los pacientes.
RN3 — Los reportes de facturacion se basan en los pagos registrados en el sistema.
RN4 — El usuario debe poder generar reportes para un rango de fechas especifico.
RN5 — La generacion de reportes no debe modificar la informacion almacenada en la base de datos.

Datos / Entidades involucradas
- pacientes
- turnos
- prestaciones
- tratamientos
- pagos

Validaciones
Validaciones de entrada
- La fecha inicial del reporte debe ser valida.
- La fecha final del reporte debe ser valida.
- La fecha inicial no debe ser posterior a la fecha final.
- Los campos obligatorios para la generacion del reporte deben estar completos.

Validaciones de negocio
- El sistema debe verificar que el rango de fechas ingresado sea coherente.
- El sistema debe verificar que los datos consultados correspondan al periodo seleccionado.
- El sistema debe manejar correctamente el caso en que no existan registros para los filtros aplicados.

Frecuencia de uso
- Media. El usuario puede generar reportes periodicamente para analizar la actividad clinica y financiera del consultorio.

Prioridad
- Alta, ya que permite evaluar el desempeno del consultorio y controlar los ingresos generados.

Estado actual
- No implementado (sin backend ni frontend).
- Implementado backend:
  - GET /api/reportes/atencion-facturacion?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
  - GET /api/reportes/atencion-facturacion?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD&resumen=true
- Pendiente: modulo UI para filtros/visualizacion.

Ejemplo de uso (resumen)
```
GET /api/reportes/atencion-facturacion?fecha_desde=2026-03-01&fecha_hasta=2026-03-31&resumen=true
```

Respuesta esperada (resumen)
```
{
  "rango": {
    "desde": "2026-03-01T03:00:00.000Z",
    "hasta": "2026-03-31T03:00:00.000Z"
  },
  "resumen": {
    "total_turnos": 21,
    "total_realizados": 2,
    "total_cancelados": 3,
    "total_reprogramados": 1,
    "total_confirmados": 2,
    "ingresos_estimados": 300
  },
  "por_prestacion": [
    {
      "prestacion_id": 7,
      "prestacion_nombre": "Blanqueamiento dental",
      "cantidad": 2,
      "ingresos_estimados": 300
    }
  ]
}
```

---

## CU-5.2 Visualizar estadisticas

Nombre del caso de uso  
Visualizar estadisticas del consultorio

Actor principal  
Usuario del sistema (operador del consultorio odontologico)

Descripcion  
Este caso de uso permite al usuario visualizar estadisticas generadas a partir de la informacion registrada en el sistema. Las estadisticas proporcionan una representacion grafica de los datos clinicos y administrativos del consultorio, permitiendo analizar tendencias, volumen de atenciones y comportamiento de los ingresos a lo largo del tiempo.

Precondiciones
- El usuario debe estar autenticado en el sistema.
- Deben existir registros de turnos, tratamientos o pagos en la base de datos.
- El usuario debe acceder al modulo de reportes o al panel de estadisticas del sistema.

Postcondiciones
- El sistema genera estadisticas a partir de los datos almacenados en la base de datos.
- Las estadisticas se presentan al usuario mediante graficos o indicadores visuales en la interfaz del sistema.
- El usuario puede interpretar visualmente la informacion relacionada con atenciones, tratamientos o ingresos del consultorio.
- La visualizacion de estadisticas no modifica los datos almacenados en el sistema.

Flujo principal
1. El usuario accede al modulo de reportes o estadisticas del sistema.
2. El sistema muestra las opciones disponibles para visualizar estadisticas.
3. El usuario selecciona una categoria de estadisticas a visualizar.
4. El sistema solicita los criterios de filtrado necesarios (por ejemplo, rango de fechas).
5. El usuario ingresa los valores correspondientes.
6. El usuario solicita visualizar las estadisticas.
7. El sistema consulta la base de datos utilizando los criterios indicados.
8. El sistema procesa los datos obtenidos para generar las estadisticas.
9. El sistema presenta los resultados mediante graficos o indicadores visuales.
10. El usuario analiza la informacion mostrada en la interfaz.

Flujos alternativos
A1 — No existen datos suficientes para generar estadisticas
1. El sistema consulta la base de datos utilizando los criterios especificados.
2. No se encuentran registros suficientes para generar estadisticas.
3. El sistema informa al usuario que no existen datos disponibles para los filtros seleccionados.

A2 — Filtros invalidos o incompletos
1. El usuario ingresa valores de filtrado incorrectos o incompletos.
2. El sistema detecta la inconsistencia en los datos ingresados.
3. El sistema solicita al usuario corregir los valores antes de generar las estadisticas.

Reglas de negocio
RN1 — Las estadisticas deben generarse a partir de datos registrados en el sistema.
RN2 — Las estadisticas deben reflejar informacion actualizada segun los registros existentes en la base de datos.
RN3 — El sistema debe permitir visualizar estadisticas filtradas por un rango de fechas determinado.
RN4 — La generacion de estadisticas no debe modificar la informacion almacenada en el sistema.
RN5 — Las estadisticas deben presentarse mediante elementos visuales que faciliten la interpretacion de la informacion (graficos o indicadores).

Datos / Entidades involucradas
- turnos
- tratamientos
- pagos
- pacientes
- prestaciones

Validaciones
Validaciones de entrada
- La fecha inicial debe ser valida.
- La fecha final debe ser valida.
- La fecha inicial no debe ser posterior a la fecha final.
- Los campos requeridos para generar las estadisticas deben estar completos.

Validaciones de negocio
- El sistema debe verificar que existan datos suficientes para generar estadisticas significativas.
- El sistema debe verificar que los datos utilizados correspondan al periodo seleccionado.
- El sistema debe manejar correctamente los casos en que no existan registros para los filtros aplicados.

Frecuencia de uso
- Media. El usuario puede consultar las estadisticas periodicamente para evaluar la actividad del consultorio.

Prioridad
- Media-Alta, ya que permite visualizar informacion clave del funcionamiento del consultorio y facilita la toma de decisiones.

Estado actual
- Implementado backend:
  - GET /api/estadisticas?fecha_desde=YYYY-MM-DD&fecha_hasta=YYYY-MM-DD
- Pendiente: modulo UI con graficos/indicadores.

Ejemplo de uso
```
GET /api/estadisticas?fecha_desde=2026-03-01&fecha_hasta=2026-03-31
```

Respuesta esperada (ejemplo)
```
{
  "rango": {
    "desde": "2026-03-01T03:00:00.000Z",
    "hasta": "2026-03-31T03:00:00.000Z"
  },
  "resumen": {
    "total_turnos": 21,
    "total_realizados": 2,
    "total_cancelados": 3,
    "total_reprogramados": 1,
    "total_confirmados": 2,
    "ingresos_estimados": 300
  },
  "turnos_por_dia": [
    { "dia": "2026-03-01T03:00:00.000Z", "total_turnos": 1, "total_realizados": 0, "total_cancelados": 1, "total_reprogramados": 0, "total_confirmados": 0, "ingresos_estimados": 0 }
  ],
  "top_prestaciones": [
    { "prestacion_id": 7, "prestacion_nombre": "Blanqueamiento dental", "cantidad": 17, "ingresos_estimados": 300 }
  ],
  "pacientes_nuevos_por_dia": [
    { "dia": "2026-03-04T03:00:00.000Z", "nuevos_pacientes": 1 }
  ]
}
```
