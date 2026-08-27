# Diagnóstico del módulo Pagos / Facturación

Fecha de revisión: 2026-08-25  
Alcance: análisis estático de `backend/`, `frontend/` y `database/`, más consultas agregadas de solo lectura sobre `public.pagos`.  
No se ejecutaron operaciones de escritura sobre PostgreSQL.

## ESTADO GENERAL

El proyecto posee un módulo activo de **gestión interna de pagos** con recorrido completo desde la interfaz hasta PostgreSQL. Permite seleccionar un paciente, consultar conceptos pendientes calculados desde sus turnos, registrar un pago, listarlo con filtros y editar algunos de sus datos.

El módulo está **parcialmente implementado y todavía no es estable para presentarlo como terminado**. La conexión técnica entre capas existe, pero faltan garantías básicas de integridad: el backend puede asociar un pago al paciente de un turno ajeno, admite sobrepagos, la deuda se calcula usando el precio actual de la prestación y el propio servicio intenta crear o alterar la tabla durante peticiones normales.

La tabla `public.pagos` existe y al momento de la auditoría contiene **0 filas**. Por esa razón se confirmó el diseño y el recorrido estático, pero **NO SE PUEDE CONFIRMAR CON EL CÓDIGO DISPONIBLE** que registrar y editar pagos haya sido validado manualmente de extremo a extremo con datos reales.

Valoración: **PARCIAL / requiere estabilización acotada**. No hace falta construir un sistema fiscal; sí hace falta definir y proteger un registro interno de cobros coherente.

## ARQUITECTURA ACTUAL

El flujo predominante respeta la arquitectura esperada:

```text
frontend/index.html
  -> frontend/src/js/views/pagosView.js
  -> frontend/src/js/api.js
  -> /api/pagos
  -> backend/src/routes/pagosRoutes.js
  -> backend/src/controllers/pagosController.js
  -> backend/src/services/pagosService.js
  -> PostgreSQL: pagos + pacientes + turnos + prestaciones
```

Responsabilidades actuales:

- La vista administra formulario, filtros, tabla, selección de conceptos y estado de edición.
- `api.js` concentra las peticiones HTTP autenticadas.
- Las rutas aplican autenticación, autorización para odontólogo y auditoría.
- El controller traduce entrada/salida HTTP y delega al service.
- El service concentra validaciones, SQL, cálculo de deuda y también DDL de inicialización.
- PostgreSQL conserva los movimientos en `pagos`; el concepto se obtiene indirectamente a través de `turnos.prestacion_id`.

La separación route -> controller -> service se respeta. La ruptura principal es `asegurarTablaPagos()` en `pagosService.js`: una capa de negocio ejecuta `CREATE TABLE`, `ALTER TABLE`, `UPDATE` y `CREATE INDEX` al atender peticiones. La estructura debería estar estabilizada mediante una migración versionada, no repararse durante un GET o POST.

## FRONTEND

### Conexión e inicialización

- `frontend/index.html` contiene el botón visible `Pagos` y la sección `#section-pagos`.
- `frontend/src/js/main.js` importa `initPagosView()` y la ejecuta durante la inicialización autenticada.
- `frontend/src/js/views/pagosView.js` está consumida y no es un archivo aislado.

### Formulario existente

El formulario `#pago-form` solicita:

- paciente obligatorio;
- turno opcional, ingresado como ID de texto;
- monto positivo;
- método: `efectivo`, `tarjeta` o `transferencia`;
- estado: `pagado`, `pendiente` o `parcial`;
- fecha de pago opcional;
- observaciones opcionales.

Al seleccionar un paciente, la vista solicita un resumen y muestra turnos con saldo pendiente. Elegir uno copia su ID, propone el saldo completo como monto, cambia el estado a `pagado` y agrega una observación sugerida.

### Listado y acciones

La tabla muestra fecha, paciente, DNI, concepto, monto, método, estado, saldo y una acción de edición. Puede filtrarse por paciente y rango de fechas.

Acciones presentes:

- registrar: sí;
- consultar/listar: sí;
- filtrar: sí;
- editar: sí, pero solo se persisten monto, método, estado, fecha y observaciones;
- eliminar: no;
- anular: no;
- emitir comprobante: no.

### Problemas de interfaz

- El campo turno acepta un ID manual. No ofrece un selector validado y facilita errores de asociación.
- Durante edición se cargan paciente y turno, pero `actualizarPago()` no los actualiza. La interfaz aparenta permitir cambios que el backend ignora.
- Después de guardar, `resetForm()` limpia el paciente antes de volver a pedir el resumen; por ello se pierde el estado de cuenta que el usuario estaba consultando.
- `loadPacientes()` carga solo la primera página de 100 pacientes. Los restantes no pueden seleccionarse desde este módulo.
- El filtro `hasta` parece incluir el día elegido, pero el backend compara contra su medianoche y puede excluir pagos posteriores de ese mismo día.
- Se insertan nombres, DNI, prestación, método y estado mediante `innerHTML` sin una función de escape local. Conviene sanear esa salida aunque la pantalla esté autenticada.

### Endpoints consumidos

| Función en `api.js` | Método y endpoint | Consumidor |
|---|---|---|
| `getPagos(params)` | `GET /api/pagos` | `loadPagos()` |
| `createPago(payload)` | `POST /api/pagos` | envío en modo creación |
| `updatePago(id, payload)` | `PUT /api/pagos/:id` | envío en modo edición |
| `getResumenPagosPaciente(id)` | `GET /api/pagos/resumen/:pacienteId` | `loadResumenPaciente()` |

No se encontró una petición frontend de borrado, anulación, comprobante o PDF.

## BACKEND

### Rutas

`backend/src/app.js` monta `pagosRoutes` en `/api/pagos`.

`backend/src/routes/pagosRoutes.js` expone:

| Método | Ruta | Controller | Protección |
|---|---|---|---|
| GET | `/api/pagos` | `listarPagos` | JWT + rol odontólogo + auditoría |
| GET | `/api/pagos/resumen/:pacienteId` | `resumenPaciente` | JWT + rol odontólogo + auditoría |
| POST | `/api/pagos` | `crearPago` | JWT + rol odontólogo + auditoría |
| PUT | `/api/pagos/:id` | `actualizarPago` | JWT + rol odontólogo + auditoría |

No hay endpoints de DELETE, anulación ni comprobantes. No se hallaron rutas de pagos sin controller ni funciones exportadas del service sin route.

### Controllers

`backend/src/controllers/pagosController.js` contiene wrappers breves y delega correctamente al service. Como debilidad, cualquier excepción se traduce a HTTP 400, incluso errores inesperados de PostgreSQL que deberían diferenciarse de una validación del usuario.

### Service y SQL

`backend/src/services/pagosService.js` implementa:

- `listarPagos()`: lista y filtra movimientos; une paciente, turno y prestación; calcula saldo por turno.
- `obtenerResumenPaciente()`: arma conceptos pendientes desde turnos y precio base de la prestación.
- `crearPago()`: inserta un movimiento.
- `actualizarPago()`: modifica monto, método, estado, fecha y observaciones.
- `validarPago()`: exige paciente, monto mayor que cero, método no vacío y uno de tres estados.
- `asegurarTablaPagos()`: crea/altera/rellena la tabla e índice durante la ejecución normal.

Validaciones que sí existen:

- paciente requerido;
- monto numérico y mayor que cero;
- método no vacío;
- estado limitado en el service a `pendiente`, `parcial` o `pagado`;
- existencia de paciente y turno protegida indirectamente por claves foráneas al insertar.

Validaciones que faltan:

- comprobar que el turno pertenezca al paciente indicado;
- comprobar que el turno tenga una prestación/concepto cobrable;
- impedir que la suma cobrada supere el importe del concepto;
- validar IDs como enteros positivos antes de consultar;
- limitar el método a los valores admitidos por la interfaz;
- validar fecha y normalizar su zona horaria;
- definir qué significa guardar un pago `pendiente` con monto positivo;
- validar paciente/turno durante edición o impedir que parezcan editables.

El estado `pendiente` no suma como cobrado; `parcial` y `pagado` sí. La condición de pago parcial depende simultáneamente del estado y del monto, lo cual permite combinaciones contradictorias, por ejemplo un saldo completo marcado `parcial` o un importe pequeño marcado `pagado`.

No existen pruebas específicas de Pagos entre los nueve scripts `backend/scripts/test-*.js`, ni se encontraron referencias a pagos en `backend/test-db.js`.

## BASE DE DATOS

La revisión de `database/schema_actual.sql` y una consulta agregada de solo lectura confirmó que `public.pagos` existe y contiene 0 filas.

### Tabla principal

**TABLA:** `public.pagos`  
**COLUMNAS RELEVANTES:** `id`, `paciente_id`, `turno_id`, `monto`, `metodo_pago`, `estado`, `created_at`, `fecha_pago`, `updated_at`, `metodo`, `observaciones`.  
**PK:** `pagos_pkey (id)`.  
**FK:** `paciente_id -> pacientes(id) ON DELETE RESTRICT`; `turno_id -> turnos(id) ON DELETE SET NULL`.  
**ESTADOS:** no hay restricción de base de datos; el service admite `pendiente`, `parcial`, `pagado`.  
**RELACIONES:** directa con paciente y turno; indirecta con prestación a través del turno.  
**UTILIZADA POR CÓDIGO:** SÍ.

La tabla tiene `CHECK (monto > 0)` e índices por paciente y por paciente/fecha.

### Tablas relacionadas

| Tabla | Relación con Pagos | PK/FK relevante | Utilizada por el flujo |
|---|---|---|---|
| `pacientes` | titular del pago y filtro de historial | PK `id`; referenciada por `pagos.paciente_id` | SÍ |
| `turnos` | concepto opcional al que se aplica el pago | PK `id`; FK propia a paciente y prestación | SÍ |
| `prestaciones` | aporta nombre y `precio_base` mediante el turno | PK `id`; referenciada por `turnos.prestacion_id` | SÍ |
| `auditoria` | registra solicitudes exitosas de las rutas | PK `id`; middleware compartido | SÍ, de forma transversal |

No se encontraron tablas `facturas`, `comprobantes`, `presupuestos`, `cobros`, `deudas`, `saldos` ni equivalentes fiscales.

### Inconsistencias del esquema

- `metodo_pago` y `metodo` representan el mismo dato. El código actual solo lee y escribe `metodo`; `metodo_pago` es aparentemente legacy.
- El DDL de `asegurarTablaPagos()` declara `paciente_id ON DELETE CASCADE`, mientras el esquema real usa `ON DELETE RESTRICT`.
- El service declara `NUMERIC(12,2)`; el esquema real tiene `NUMERIC(10,2)`.
- El DDL inicial del service declara método, estado, fecha y timestamps como `NOT NULL`, pero las columnas reales admiten nulos en varios casos.
- La base solo controla monto positivo. No controla estados ni métodos permitidos.
- No existe FK directa a prestación ni una columna que preserve el nombre/precio acordado al realizar el tratamiento.
- No hay una migración `2026-*.sql` específica para la estructura actual de pagos. El historial versionado no explica la incorporación de `metodo`, `fecha_pago`, `observaciones` y `updated_at`.

Como la tabla está vacía, no hay hoy filas con métodos legacy, asociaciones paciente/turno inconsistentes ni sobrepagos. Esto no elimina la posibilidad de generarlos cuando empiece a utilizarse.

## FLUJO ACTUAL

### Inicializar la pantalla

```text
main.js: initAppOnce()
  -> pagosView.js: initPagosView()
  -> loadPacientes() + loadPagos()
  -> api.js: getPacientes() + getPagos()
  -> GET /api/pacientes + GET /api/pagos
```

### Consultar deuda/conceptos

```text
pagosView.js: loadResumenPaciente()
  -> api.js: getResumenPagosPaciente()
  -> GET /api/pagos/resumen/:pacienteId
  -> pagosRoutes.js: resumenPaciente
  -> pagosController.js: resumenPaciente()
  -> pagosService.js: obtenerResumenPaciente()
  -> turnos + prestaciones + pagos
```

El service toma turnos `programado`, `confirmado`, `reprogramado` y `realizado`, usa el `precio_base` vigente y resta pagos `parcial`/`pagado`. Incluye incluso turnos futuros no realizados. Por ello el resultado es una estimación dinámica, no una deuda contable histórica confiable.

### Registrar un pago

```text
pagosView.js: submit en modo create
  -> api.js: createPago()
  -> POST /api/pagos
  -> pagosRoutes.js: crearPago
  -> pagosController.js: crearPago()
  -> pagosService.js: crearPago()
  -> INSERT INTO pagos
```

### Listar pagos

```text
pagosView.js: loadPagos()
  -> api.js: getPagos()
  -> GET /api/pagos
  -> pagosRoutes.js: listarPagos
  -> pagosController.js: listarPagos()
  -> pagosService.js: listarPagos()
  -> SELECT sobre pagos/pacientes/turnos/prestaciones
```

### Editar un pago

```text
pagosView.js: botón Editar + submit en modo edit
  -> api.js: updatePago()
  -> PUT /api/pagos/:id
  -> pagosRoutes.js: actualizarPago
  -> pagosController.js: actualizarPago()
  -> pagosService.js: actualizarPago()
  -> UPDATE pagos
```

## FUNCIONALIDADES QUE YA EXISTEN

- Sección de Pagos visible e inicializada.
- Autenticación y autorización de todas las rutas de pagos.
- Auditoría transversal de respuestas exitosas.
- Registro de importe, método, estado, fecha y observaciones.
- Asociación obligatoria con paciente.
- Asociación opcional con turno y, por éste, con prestación.
- Consulta de historial con filtro por paciente y fechas.
- Edición de los datos económicos básicos del movimiento.
- Cálculo de pagos acumulados por turno.
- Presentación de conceptos con saldo estimado.
- Soporte técnico de pagos parciales mediante varios movimientos que suman al mismo turno.
- Claves foráneas e índice para paciente/fecha.

Estas funciones están conectadas estáticamente. Con 0 filas y sin ejecutar escrituras durante esta auditoría, su operación real completa permanece pendiente de una prueba controlada.

## FUNCIONALIDADES INCOMPLETAS

- Integridad paciente-turno: no se valida que ambos pertenezcan a la misma relación.
- Control de sobrepago y concurrencia.
- Definición coherente de estado del pago y pago parcial.
- Precio histórico/acordado del concepto.
- Deuda/saldo consistente: hoy es una estimación sobre tarifa vigente y estados de turno amplios.
- Selección segura del turno; actualmente admite un ID libre.
- Edición coherente de paciente/turno o bloqueo explícito de esos campos.
- Anulación trazable de pagos erróneos.
- Comprobante o constancia interna imprimible.
- Historial paginado y selección de más de 100 pacientes.
- Tratamiento inclusivo del día final del filtro.
- Validaciones y restricciones equivalentes entre frontend, backend y BD.
- Migración versionada que represente el esquema vigente.
- Pruebas automatizadas específicas de creación, edición, filtros, parcialidad, sobrepago e integridad.

## CÓDIGO DESCONECTADO/LEGACY

- `pagos.metodo_pago`: aparentemente legacy. Ningún archivo ejecutable de backend/frontend lo lee o escribe; el flujo actual usa `pagos.metodo`. Como la tabla está vacía no requiere migración de datos hoy, pero cualquier retiro futuro debe hacerse mediante migración controlada.
- `frontend/src/js/views/reportesView.js`: contiene una interfaz de “atención y facturación”, pero no está importada ni inicializada por `main.js`. Es una UI desconectada, no un componente de pagos activo.
- `GET /api/reportes/atencion-facturacion`: el backend sí lo monta, pero calcula `ingresos_estimados` desde turnos realizados y `prestaciones.precio_base`; no consulta `pagos`. No debe presentarse como reporte de cobros reales.
- `asegurarTablaPagos()`: no es código muerto; todos los métodos del service lo llaman. Es una inicialización legacy activa que debe retirarse solo después de crear y aplicar una migración equivalente.

No se encontraron routes, controllers o funciones exportadas de Pagos sin consumidor. Tampoco se encontró una implementación duplicada completa del módulo.

## PAGOS VS FACTURACIÓN

Odonton implementa actualmente **registro interno de pagos/cobros**, no facturación fiscal ni electrónica.

El término defendible para la tesis es:

> Gestión interna de pagos asociados a pacientes y, opcionalmente, a turnos/prestaciones.

No existen numeración fiscal, tipo de comprobante, datos impositivos, impuestos, punto de venta, CAE, integración con ARCA/AFIP ni una entidad `factura`. El reporte denominado “atención y facturación” solo estima importes según las prestaciones realizadas y tampoco representa ingresos efectivamente cobrados.

Si la documentación de la tesis usa “Facturación”, debe aclarar que se refiere a **constancias internas no fiscales** o renombrarse como “Pagos/Cobros”. La facturación electrónica y las integraciones fiscales quedan fuera del alcance; solo podrían figurar como backlog futuro.

## PROBLEMAS

### 🔴 BLOQUEANTE PARA ENTREGA

- **DDL y actualización de datos en tiempo de ejecución:** `asegurarTablaPagos()` puede mutar esquema y filas durante cualquier consulta. Dificulta reproducibilidad, explicación y control de errores.
- **Asociación paciente-turno no validada:** el backend permite registrar `paciente_id` de una persona y `turno_id` de otra porque cada FK se valida por separado.
- **Saldo/deuda no histórico:** usa el precio actual de la prestación; un cambio de tarifa modifica retroactivamente saldos anteriores. También trata turnos futuros programados como deuda.
- **Sobrepagos permitidos:** no se compara el importe con el saldo ni se bloquea el concepto ante cobros concurrentes; el frontend oculta el exceso al aplicar `GREATEST(..., 0)`.
- **Ausencia de migración de Pagos:** el esquema real depende de DDL oportunista y no queda reproducible desde las migraciones fechadas.
- **Sin pruebas propias y sin datos actuales:** no hay cobertura de regresión del módulo y la tabla tiene 0 filas. Antes de declararlo terminado necesita pruebas automatizadas y una checklist manual controlada.

### 🟠 IMPORTANTE PERO PEQUEÑO

- Definir semántica de `pendiente`, `parcial` y `pagado`; actualmente pueden contradecir el importe realmente cobrado.
- Resolver la duplicación `metodo_pago` / `metodo` y las diferencias de nulabilidad/tipo entre service y esquema.
- Reemplazar el ID manual del turno por conceptos válidos del paciente.
- Alinear la edición: paciente/turno deben ser editables de verdad o quedar bloqueados visualmente.
- Corregir el filtro `hasta` para incluir todo el día seleccionado.
- Mantener el paciente seleccionado y actualizar su resumen después de guardar.
- Validar métodos de pago, IDs y fechas también en backend.
- Paginar/buscar pacientes en vez de limitar la selección a los primeros 100.
- Diferenciar errores de validación (4xx) de fallos internos (5xx).
- Escapar datos dinámicos antes de incorporarlos con `innerHTML`.
- Cambiar en UI/documentación “Caja” o “facturación” cuando sugiera capacidades contables que no existen.

### 🟢 BACKLOG

- Constancia interna imprimible/PDF con leyenda “no fiscal”, si la tesis la requiere.
- Exportación CSV de cobros reales por rango.
- Totales por medio de pago y período.
- Búsqueda/paginación avanzada del historial.
- Pagos a cuenta no asociados a turno, solo si se define una regla clara.
- Integraciones fiscales, pasarelas externas y contabilidad profesional: fuera del alcance actual.

## ALCANCE MÍNIMO RECOMENDADO PARA ENTREGA

El alcance mínimo defendible debería llamarse **Gestión interna de pagos** e incluir:

1. Registrar un cobro real para un paciente y un turno/prestación perteneciente a ese paciente.
2. Conservar importe, fecha, medio de pago y observación opcional.
3. Consultar el historial por paciente y rango de fechas.
4. Permitir corregir o anular un movimiento de forma trazable, sin borrado físico.
5. Impedir asociaciones cruzadas y sobrepagos.
6. Tener una única definición de columnas, estados y métodos, aplicada por migración.
7. Cubrir el flujo con pruebas de servicio/API y una checklist manual.

El saldo/deuda **no debería presentarse como contable o histórico con la estructura actual**. Hay dos alternativas de alcance:

- mínima y recomendada: mostrar historial de cobros y omitir el total de deuda formal;
- ampliada: guardar un precio acordado/inmutable para el turno o concepto y calcular el saldo desde ese valor.

La segunda alternativa requiere una decisión de negocio y una migración adicional. No es necesaria para demostrar un registro interno de pagos básico.

Una constancia interna no fiscal puede añadirse después de estabilizar los datos. No requiere AFIP/ARCA, CAE ni integración externa.

## PLAN DE CIERRE

### Fase 1: cerrar reglas y contrato

- Definir si todo pago debe vincularse a turno para el alcance de tesis.
- Definir estados y significado de pago parcial/anulado.
- Decidir si el saldo se retira del alcance mínimo o si se incorpora precio acordado.
- Documentar explícitamente “gestión interna, no facturación fiscal”.

### Fase 2: estabilizar esquema e integridad

- Crear una migración única y revisable para la tabla vigente y sus restricciones.
- Resolver `metodo_pago` frente a `metodo` aprovechando que no hay filas actuales.
- Retirar el DDL/UPDATE de `asegurarTablaPagos()` después de aplicar y validar la migración.
- Validar de manera atómica paciente, turno, prestación y saldo antes de insertar.
- Incorporar una forma trazable de anulación si se incluye en el alcance.

### Fase 3: alinear API y frontend

- Sustituir ID libre por selección de concepto válida.
- Alinear campos editables con el contrato de `PUT`.
- Corregir filtros, recarga del resumen y selección de pacientes.
- Ajustar etiquetas para no prometer caja contable/facturación fiscal.
- Agregar constancia interna solo si está incluida en la documentación de tesis.

### Fase 4: pruebas y cierre documental

- Agregar pruebas de creación, edición/anulación, filtros e integridad.
- Probar pago total, varios pagos parciales, intento de sobrepago y turno de otro paciente.
- Ejecutar checklist manual sin servicios externos.
- Alinear memoria de tesis, casos de uso y recorrido para defensa oral con el comportamiento final.

## ESTIMACIÓN

- **Cantidad aproximada de cambios:** 12 a 18 cambios acotados entre reglas, esquema, API, UI, pruebas y documentación.
- **Archivos afectados:** aproximadamente 7 a 11, incluyendo una migración nueva y pruebas; dependerá de incluir o no saldo histórico y constancia.
- **Esfuerzo estimado:** 4 a 7 jornadas para el alcance mínimo sin deuda histórica; 6 a 10 si se agrega precio acordado, saldo consistente y constancia interna.
- **Riesgo actual:** ALTO para declarar el módulo terminado sin cambios, por integridad y DDL en ejecución.
- **Riesgo del cierre incremental:** MEDIO. La tabla vacía reduce el riesgo de migración de datos, pero deben probarse cuidadosamente la relación paciente-turno y los cálculos monetarios.

## CONFIRMACIONES

**CÓDIGO MODIFICADO: NO**  
**BASE MODIFICADA: NO**  
**MIGRACIONES EJECUTADAS: NINGUNA**  
**COMMIT: NO**
