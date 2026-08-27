# Diseño definitivo del modelo de Pagos / Cobros internos

Fecha de diseño: 2026-08-25  
Referencia: `DIAGNOSTICO_PAGOS_FACTURACION.md`  
Alcance de esta fase: análisis y diseño. No se modificó código ni PostgreSQL.

## ALCANCE

Odonton implementará un módulo de **gestión administrativa interna de cargos y cobros**. No será un sistema de facturación fiscal, caja contable ni contabilidad profesional.

El alcance definitivo contempla:

- registrar una obligación económica del paciente como cargo;
- asociar el cargo opcionalmente con un turno y una prestación;
- congelar concepto e importe al crear el cargo;
- registrar uno o varios pagos reales sobre el cargo;
- obtener total abonado, saldo y estado de cobro;
- impedir sobrepagos, incluso ante solicitudes concurrentes;
- anular pagos sin borrarlos;
- consultar el historial del paciente;
- permitir posteriormente una constancia interna no fiscal y reportes basados en cobros reales.

Quedan fuera del alcance: ARCA/AFIP, CAE, factura electrónica, Mercado Pago, pasarelas externas, contabilidad profesional, caja compleja, cuotas financieras, stock y múltiples monedas.

## CONCEPTOS

### Cargo

Es una obligación económica concreta de un paciente. Conserva el concepto y el importe acordado en el momento de su creación. Puede originarse en un turno/prestación o en una razón administrativa válida sin turno.

Un cargo no representa dinero recibido y no se crea automáticamente por el solo hecho de programar un turno.

### Pago

Es un movimiento de dinero efectivamente recibido y aplicado a un cargo. Un cargo puede recibir cero, uno o varios pagos.

No existirán “pagos pendientes”: si todavía no ingresó dinero, existe un cargo con saldo pendiente, no un pago.

### Saldo

Es un dato derivado:

```text
total_abonado = suma de pagos activos del cargo
saldo = importe_total del cargo - total_abonado
```

No se almacena como columna para evitar que quede desactualizado frente a nuevos pagos o anulaciones.

### Anulación

Es el cambio irreversible de un pago de `activo` a `anulado`. Conserva el movimiento original y agrega quién, cuándo y por qué se anuló. Un pago anulado deja de computar inmediatamente para el saldo.

## MODELO PROPUESTO

```text
pacientes 1 ─── N cargos 1 ─── N pagos
                     │
                     ├── 0..1 turnos
                     └── 0..1 prestaciones

usuarios 1 ─── N pagos anulados (anulado_por_usuario_id)
```

Decisiones principales:

- Crear `cargos` como entidad nueva.
- Recrear `pagos`, actualmente vacía, con una estructura canónica vinculada a `cargos`.
- No duplicar `paciente_id` en `pagos`; se obtiene de su cargo.
- Guardar `concepto` e `importe_total` en el cargo como snapshot histórico.
- No guardar `saldo`, `total_abonado` ni `estado_cobro`.
- Mantener en el pago solo el estado operativo `activo`/`anulado`.
- Usar `DATE` para fechas administrativas y `TIMESTAMPTZ` para trazabilidad técnica.
- Usar `NUMERIC(12,2)` y validar como máximo dos decimales.
- Considerar ARS como moneda única del alcance inicial; no agregar una columna de moneda mientras no exista un requisito multimoneda.

## TABLA CARGOS

Tabla propuesta: `public.cargos`.

| Columna | Tipo propuesto | Obligatoria | Propósito / restricción |
|---|---|---:|---|
| `id` | `INTEGER` autogenerado | Sí | PK e identificador interno del cargo. |
| `paciente_id` | `INTEGER` | Sí | FK a `pacientes(id)`, con `ON DELETE RESTRICT`. Todo cargo pertenece a un paciente. |
| `turno_id` | `INTEGER` | No | FK a `turnos(id)`. Conserva el origen cuando el cargo proviene de un turno. |
| `prestacion_id` | `INTEGER` | No | FK a `prestaciones(id)`. Conserva la prestación tomada como referencia. |
| `concepto` | `TEXT` | Sí | Snapshot descriptivo; no vacío después de aplicar `TRIM`. |
| `importe_total` | `NUMERIC(12,2)` | Sí | Importe acordado e histórico; `CHECK (importe_total > 0)`. |
| `fecha_cargo` | `DATE` | Sí | Fecha administrativa del cargo; admite fechas anteriores, nunca futuras; valor inicial `CURRENT_DATE`. |
| `observaciones` | `TEXT` | No | Aclaración interna opcional. |
| `created_at` | `TIMESTAMPTZ` | Sí | Momento técnico de creación; valor inicial `NOW()`. |
| `updated_at` | `TIMESTAMPTZ` | Sí | Momento de la última corrección permitida; valor inicial `NOW()`. |

### Decisiones sobre las relaciones

- `turno_id` no es obligatorio. Un cargo administrativo puede existir sin turno.
- `prestacion_id` tampoco es obligatorio. Si no existe prestación, `concepto` describe la razón del cargo.
- Cuando exista `turno_id`, el service debe comprobar al crear el cargo que el turno pertenece a `paciente_id`.
- Si el turno tiene prestación y `prestacion_id` no fue informado, el backend puede tomarla del turno.
- Si ambos existen, deben coincidir en el momento de crear el cargo. No se confiará únicamente en valores enviados por el frontend.
- `concepto` se copia desde el nombre vigente de la prestación cuando corresponda, pero queda independiente de cambios posteriores.
- `importe_total` puede precargarse desde `precio_base`, pero el valor aceptado por el usuario autorizado es el importe acordado que quedará congelado.

Antes de crear el cargo, el odontólogo puede modificar el importe precargado. Una vez creado, ese valor deja de depender del catálogo de prestaciones.

Los datos principales del cargo solo pueden corregirse mientras nunca haya tenido pagos. Desde el primer pago histórico —aunque luego sea anulado— quedan inmutables `paciente_id`, `turno_id`, `prestacion_id`, `concepto` e `importe_total`.

Se recomienda `ON DELETE SET NULL` para las FKs opcionales a turno y prestación: si en el futuro se retirara físicamente una referencia, el cargo conserva paciente, concepto, importe y fechas. La aplicación debería seguir prefiriendo bajas lógicas o restricciones antes que borrar información clínica.

### Estado del cargo

No se propone una columna `estado` para `pendiente`, `parcial` o `pagado`. Esos estados se calculan a partir de sus pagos activos y almacenar ambos valores permitiría contradicciones.

La anulación de cargos no forma parte del alcance mínimo solicitado. Si posteriormente se necesita corregir un cargo creado por error, debe diseñarse como un ciclo administrativo separado (`activo`/`anulado` más motivo y fecha), no mezclarse con el estado de cobro.

### Índices mínimos

- índice por `paciente_id, fecha_cargo DESC` para el historial;
- índice por `turno_id` cuando no sea nulo;
- índice por `prestacion_id` cuando no sea nulo.

No se propone `UNIQUE(turno_id)`: un mismo turno podría justificar más de un cargo explícito. Evitar duplicados accidentales corresponde al caso de uso y a la confirmación del usuario, no a una restricción que impida cargos legítimos.

## TABLA PAGOS

Tabla propuesta: nueva definición canónica de `public.pagos`.

| Columna | Tipo propuesto | Obligatoria | Propósito / restricción |
|---|---|---:|---|
| `id` | `INTEGER` autogenerado | Sí | PK y número interno del pago. |
| `cargo_id` | `INTEGER` | Sí | FK a `cargos(id)`, con `ON DELETE RESTRICT`. |
| `importe` | `NUMERIC(12,2)` | Sí | Dinero efectivamente recibido; `CHECK (importe > 0)`. |
| `metodo_pago` | `VARCHAR(30)` | Sí | Medio utilizado. Restricción inicial: `efectivo`, `tarjeta` o `transferencia`. |
| `fecha_pago` | `DATE` | Sí | Fecha administrativa del cobro; admite fechas anteriores, nunca futuras ni anteriores al cargo; valor inicial `CURRENT_DATE`. |
| `observaciones` | `TEXT` | No | Aclaración interna opcional. |
| `estado` | `VARCHAR(10)` | Sí | Solo `activo` o `anulado`; valor inicial `activo`. |
| `fecha_anulacion` | `TIMESTAMPTZ` | No | Momento técnico de la anulación; obligatorio cuando el estado es `anulado`. |
| `motivo_anulacion` | `TEXT` | No | Justificación; obligatoria y no vacía al anular. |
| `anulado_por_usuario_id` | `INTEGER` | No | FK a `usuarios(id)`; obligatorio al anular para identificar al responsable. |
| `created_at` | `TIMESTAMPTZ` | Sí | Momento técnico del registro; valor inicial `NOW()`. |
| `updated_at` | `TIMESTAMPTZ` | Sí | Coincide inicialmente con creación y se actualiza al anular. |

No se incluye `paciente_id`: el paciente se obtiene de `pagos.cargo_id -> cargos.paciente_id`. Duplicarlo permitiría que pago y cargo señalaran pacientes diferentes y no mejora la consulta si existen índices adecuados.

Se recomienda una restricción que mantenga coherentes los datos de anulación:

- `activo`: fecha, motivo y usuario de anulación deben ser nulos;
- `anulado`: fecha, motivo y usuario deben estar informados.

### Inmutabilidad del pago

Después de registrarse, importe, cargo, método y fecha no deberían sobrescribirse. Ante un error material se anula el pago y se registra uno nuevo. Esta regla hace que el historial sea explicable y evita que una edición reescriba dinero ya informado.

Las observaciones también se conservan con el movimiento. Si se habilita su corrección futura, debe quedar auditada y no permitir alterar los datos económicos.

### Índices mínimos

- índice por `cargo_id`;
- índice parcial por `cargo_id` para filas con `estado = 'activo'`;
- índice por `fecha_pago DESC, estado` para reportes de cobros.

## RELACIONES

### Paciente y cargo

Todo cargo pertenece a un paciente. La eliminación física del paciente debe restringirse mientras existan cargos, porque el historial financiero interno perdería su titular.

### Cargo y turno

La relación es opcional. Si existe, se valida solo al crear el cargo que el turno corresponda al mismo paciente. Un cambio posterior en Turnos no debe modificar el snapshot financiero ni requiere modificar el módulo Turnos.

### Cargo y prestación

La relación es opcional y sirve para trazabilidad y reportes. El nombre de la prestación no se consulta después para reconstruir el concepto histórico: `cargos.concepto` es la fuente del texto congelado.

### Cargo y pagos

Un cargo tiene cero o muchos pagos. Todo pago tiene exactamente un cargo. No existen pagos sueltos ni pagos directamente asociados a un turno.

### Pago y usuario anulador

La relación identifica quién realizó la anulación. Además, la ruta debe registrar una acción de auditoría con el ID técnico del pago y sin datos personales innecesarios.

## REGLAS DE NEGOCIO

**R1.** `importe_total` del cargo debe ser mayor que cero y tener como máximo dos decimales.

**R2.** `importe` del pago debe ser mayor que cero y tener como máximo dos decimales.

**R3.** Todo pago debe referenciar un cargo existente. En el alcance inicial, los cargos no tienen un estado almacenado.

**R4.** Si el cargo tiene turno, el turno debe existir y pertenecer al mismo paciente en el momento de creación.

**R5.** Si hay turno y prestación, deben ser coherentes. El backend precarga la prestación del turno y rechaza una relación contradictoria.

**R6.** La suma de pagos activos nunca puede superar `cargos.importe_total`.

**R7.** Un pago anulado no computa para total abonado ni saldo.

**R8.** Un pago ya anulado no puede volver a anularse; el intento devuelve conflicto sin modificar datos.

**R9.** Los pagos no se eliminan físicamente ni se sobrescriben para corregir importes.

**R10.** Cambios en `prestaciones.nombre` o `prestaciones.precio_base` no modifican concepto ni importe de cargos existentes.

**R11.** Se permiten fechas administrativas anteriores, pero `fecha_cargo` y `fecha_pago` no pueden ser futuras y `fecha_pago` no puede ser anterior a `fecha_cargo`. `created_at` conserva cuándo se registró realmente.

**R12.** No se permite cambiar paciente, turno, prestación, concepto ni importe de un cargo que haya tenido cualquier pago histórico, incluso si todos fueron anulados. Solo un cargo sin pagos históricos puede corregirse.

**R13.** Programar, confirmar, reprogramar o realizar un turno no crea deuda automáticamente. El cargo se genera mediante una acción administrativa explícita.

**R14.** Un pago se registra como `activo`; el cliente no puede elegir su estado inicial.

**R15.** La anulación exige autenticación, rol autorizado, motivo no vacío y fecha generada por el servidor.

**R16.** Todos los importes del alcance inicial se interpretan en ARS. Múltiples monedas quedan fuera del alcance.

**R17.** Los reportes y constancias usan únicamente movimientos persistidos, nunca el precio vigente del catálogo para reconstruir valores históricos.

Restricciones de base de datos cubrirán valores positivos, estados, métodos, nulabilidad y FKs. Las reglas que dependen de varias filas —especialmente R6— se validarán dentro de una transacción de service.

## ESTADOS

### Estado de cobro del cargo: calculado

```text
PENDIENTE: total_abonado = 0
PARCIAL:   0 < total_abonado < importe_total
PAGADO:    total_abonado = importe_total
```

No existe un estado `reprogramado`, `cancelado` ni equivalente de Turnos dentro de Cargos. Son ciclos distintos.

### Estado del pago: almacenado

```text
ACTIVO:   computa para el saldo
ANULADO:  no computa y conserva fecha, motivo y usuario responsable
```

No existe `pendiente` ni `parcial` en Pagos. La parcialidad pertenece al cargo y se deriva de la suma recibida.

## CÁLCULO DE SALDO

Para un cargo concreto:

```text
total_abonado = COALESCE(SUM(pagos.importe WHERE pagos.estado = 'activo'), 0)
saldo = cargos.importe_total - total_abonado
```

Cuando no hay pagos, `total_abonado` es 0, el saldo equivale a `importe_total` y el estado calculado es `PENDIENTE`.

El total y el saldo se calculan en la consulta mediante agregación. No se almacenan en `cargos`, no se actualizan por triggers y no se mantienen en el frontend. Así existe una sola fuente de verdad: los cargos y pagos persistidos.

La regla transaccional de sobrepago garantiza que el saldo nunca sea negativo. Una expresión defensiva como `GREATEST(saldo, 0)` puede ocultar corrupción y no debe reemplazar esa garantía.

## CONCURRENCIA

Todas las operaciones que cambian pagos de un cargo deben usar el mismo bloqueo y orden:

1. iniciar transacción;
2. obtener el cargo mediante `SELECT ... FOR UPDATE`;
3. sumar dentro de la transacción sus pagos activos;
4. calcular el saldo disponible;
5. rechazar y hacer rollback si el nuevo importe supera el saldo;
6. insertar el pago activo;
7. hacer commit;
8. responder con total abonado y saldo recalculados.

En el ejemplo de saldo $10.000, la operación A bloquea la fila del cargo. La operación B espera. Si A confirma un pago de $10.000, B toma luego el bloqueo, vuelve a sumar y encuentra saldo 0, por lo que se rechaza sin insertar.

La anulación debe bloquear primero la misma fila de cargo y luego el pago objetivo. Con este orden, registrar y anular pagos concurrentemente no puede producir decisiones basadas en saldos desactualizados.

No hace falta un trigger agregado complejo si todas las escrituras pasan por estas operaciones transaccionales y las pruebas verifican la disciplina. La restricción de importe positivo sí permanece también en PostgreSQL.

## VALOR HISTÓRICO

El snapshot mínimo es:

- `cargos.concepto`: nombre/descripción aceptada al crear el cargo;
- `cargos.importe_total`: valor acordado en ese momento;
- `cargos.fecha_cargo`: fecha administrativa de origen;
- `prestacion_id` y `turno_id`: referencias opcionales para trazabilidad.

No se duplican nombre, DNI o teléfono del paciente. La constancia interna puede consultarlos desde `pacientes`; este proyecto no requiere conservar una identidad fiscal inmutable.

Tampoco se duplica `precio_base`: `importe_total` ya representa el precio aplicable al cargo, incluso si hubo un acuerdo diferente de la tarifa de catálogo.

Ejemplo:

```text
25/08/2026: cargo Limpieza dental, importe_total $30.000
01/10/2026: prestaciones.precio_base cambia a $45.000
resultado: el cargo continúa en $30.000
```

## ANULACIÓN

Operación futura recomendada: `POST /api/pagos/:id/anular`.

Proceso:

1. el odontólogo autenticado informa un motivo;
2. el service inicia una transacción;
3. bloquea cargo y pago;
4. verifica que el pago exista y siga activo;
5. cambia únicamente estado, fecha de anulación, motivo, usuario anulador y `updated_at`;
6. confirma la transacción;
7. la siguiente consulta excluye ese importe y muestra el saldo reabierto;
8. la auditoría registra la acción y el ID técnico.

Ejemplo:

```text
Cargo: $30.000
Pago activo: $30.000
Saldo antes: $0

Pago anulado: no computa
Saldo después: $30.000
```

No se expone DELETE para pagos normales. Tampoco se restaura un pago anulado: si la anulación fue un error, se registra un nuevo pago activo para mantener una secuencia comprensible.

## CONSTANCIA INTERNA

La constancia forma parte del cierre del módulo, se implementará en una fase posterior y será explícitamente **no fiscal**. Podrá generarse a partir de los datos persistidos, sin modificar el modelo.

Datos mínimos:

- nombre y datos básicos del consultorio desde configuración;
- nombre, apellido y DNI del paciente;
- número interno de pago (`pagos.id`);
- número interno de cargo (`cargos.id`);
- concepto histórico del cargo;
- importe del pago;
- método y fecha de pago;
- importe total del cargo;
- total abonado activo y saldo restante después del pago;
- fecha de generación;
- estado actual del pago;
- texto visible “Constancia interna de pago — no fiscal”.

Si el pago está anulado, una reimpresión debe marcarlo claramente como anulado y no presentarlo como vigente. En el alcance mínimo no hace falta guardar PDFs: pueden generarse bajo demanda desde los datos actuales.

## REPORTES

### Ingresos reales

Suma de `pagos.importe` donde `pagos.estado = 'activo'`, filtrada por `fecha_pago`. No usa `prestaciones.precio_base` ni el estado del turno.

### Cuentas pendientes

Cargos cuyo saldo calculado es mayor que cero. La consulta agrupa pagos activos por cargo.

### Total adeudado

Suma de los saldos positivos de los cargos. Con la regla de no sobrepago, todos los saldos deberían ser mayores o iguales a cero sin necesidad de ocultarlos.

### Historial del paciente

Une paciente -> cargos -> pagos y muestra cargos, pagos activos, anulaciones, total abonado y saldo. El historial no elimina pagos anulados; los identifica como tales.

Los reportes existentes denominados “atención y facturación” e “ingresos estimados” no representan estos conceptos. Su eventual alineación corresponde a una fase posterior y debe usar `pagos`, no precios actuales de prestaciones.

## MIGRACIÓN PROPUESTA

La opción recomendada combina:

- **C. agregar `cargos`**, porque es una entidad que hoy no existe;
- **B. recrear `pagos`**, porque la tabla tiene 0 filas y su estructura actual mezcla conceptos y contiene columnas duplicadas.

No conviene limitarse a adaptar la tabla actual: conservaría una forma centrada en paciente/turno, obligaría a interpretar antiguos estados y mantendría columnas cuyo propósito cambia. Tampoco conviene agregar cargos dejando intacta `pagos`, porque seguirían faltando `cargo_id` y la trazabilidad de anulación.

La futura migración debería:

1. ejecutarse con backend detenido y backup completo validado;
2. volver a confirmar mediante lectura que `pagos` contiene 0 filas; si no, detenerse y diseñar migración de datos;
3. ejecutarse en una única transacción;
4. crear `cargos` con PK, FKs, checks e índices;
5. retirar la tabla `pagos` vacía y recrearla con la definición canónica;
6. usar `metodo_pago` como único nombre y no volver a crear `metodo`;
7. retirar las columnas actuales `paciente_id`, `turno_id`, `monto`, `metodo`, el antiguo esquema de estados y demás columnas reemplazadas;
8. crear las restricciones de coherencia para anulación;
9. crear FKs e índices de la nueva tabla;
10. confirmar que no se modificó ninguna tabla funcional de Turnos, Pacientes o Prestaciones;
11. regenerar `database/schema_actual.sql` después de validar la migración.

La migración no debe ejecutarse mientras el backend antiguo esté activo. `asegurarTablaPagos()` volvería a agregar columnas del modelo anterior. Migración y retiro de ese DDL deben desplegarse coordinadamente.

El hecho de que `pagos` esté vacía elimina la necesidad actual de transformar movimientos y reduce considerablemente el riesgo. La precondición debe comprobarse otra vez inmediatamente antes de cualquier `DROP` futuro.

## IMPACTO EN CÓDIGO

### Backend

Archivos probablemente modificados:

- `backend/src/app.js`: montar rutas de cargos si se separan los recursos HTTP.
- `backend/src/routes/pagosRoutes.js`: registrar pago sobre cargo y anular pago.
- `backend/src/controllers/pagosController.js`: adaptar contratos y códigos HTTP.
- `backend/src/services/pagosService.js`: retirar DDL, aplicar transacciones, locks, suma activa y anulación.
- nuevos `cargosRoutes.js`, `cargosController.js` y `cargosService.js`: alta y consulta de cargos, manteniendo route -> controller -> service.
- middleware de auditoría: solo si hace falta asociar correctamente el ID creado; no cambiar su comportamiento general sin una auditoría previa.
- `backend/src/services/reportesService.js` y `estadisticasService.js`: únicamente en la fase posterior de reportes reales.

No será necesario modificar reglas de Turnos. El service de Cargos solo leerá turno/prestación para validar y copiar datos al crear el snapshot.

### Frontend

Archivos probablemente modificados:

- `frontend/index.html`: separar visualmente creación de cargo, detalle de saldo y registro/anulación de pagos.
- `frontend/src/js/api.js`: endpoints de cargos, pagos y anulación.
- `frontend/src/js/views/pagosView.js`: nuevo estado de pantalla y eliminación de “pago pendiente”.
- hoja CSS vigente: únicamente estilos necesarios para las nuevas acciones.
- `reportesView.js` o dashboard: solo en fase posterior, si vuelven a conectarse con cobros reales.

### Base de datos

- una nueva migración fechada para `cargos` y la recreación controlada de `pagos`;
- `database/schema_actual.sql`, regenerado después de ejecutar y validar la migración;
- documentación diagnóstica actualizada de forma mínima al cerrar la implementación.

### Pruebas

Agregar pruebas específicas, sin enviar WhatsApp ni modificar sus módulos:

- creación de cargo con y sin turno;
- rechazo de turno perteneciente a otro paciente;
- preservación de concepto e importe tras cambiar la prestación de referencia;
- pago total y varios pagos parciales;
- rechazo de importe mayor al saldo;
- dos pagos concurrentes contra el mismo saldo;
- anulación, reapertura de saldo y doble anulación rechazada;
- reportes que excluyen pagos anulados;
- filtros de fecha inclusivos.

## PLAN DE IMPLEMENTACIÓN

### Fase 4B — Contratos y pruebas de dominio

- fijar payloads/respuestas de cargos, pagos, saldos y anulación;
- escribir pruebas de reglas e integridad antes de reemplazar el flujo;
- preparar el código sin ejecutar escrituras reales ni mensajes externos.

### Fase 4C — Migración y backend coordinados

- detener backend, crear backup, confirmar `pagos = 0`;
- aplicar únicamente la nueva migración transaccional;
- retirar `asegurarTablaPagos()` y activar services/routes del modelo nuevo;
- verificar constraints, locks, rollback y auditoría;
- regenerar el esquema actual.

### Fase 4D — Frontend mínimo

- alta y consulta de cargos;
- selección de cargo con saldo;
- registro de pagos y visualización de total/saldo;
- anulación con confirmación y motivo;
- historial por paciente y rango de fechas.

### Fase 4E — Constancia y reportes

- generar constancia interna no fiscal;
- calcular ingresos reales, cuentas pendientes y total adeudado desde cargos/pagos;
- retirar o renombrar métricas de “facturación” basadas en precios estimados.

### Fase 4F — Validación y documentación

- ejecutar pruebas automatizadas y checklist manual;
- revisar casos límite y concurrencia;
- actualizar documentación de tesis y recorrido para defensa;
- congelar el módulo solo después de validar datos y esquema.

Las fases 4C de migración y activación del backend forman una misma ventana controlada: el backend anterior no debe ejecutarse sobre el esquema nuevo.

## EXPLICACIÓN PARA DEFENSA

**¿Por qué Odonton separa cargo y pago?**  
Porque una cosa es lo que el paciente debe y otra el dinero que efectivamente entregó. La separación permite que una deuda reciba varios pagos parciales sin inventar “pagos pendientes”.

**¿Por qué conserva el importe histórico?**  
Porque una tarifa puede cambiar. El cargo guarda el valor acordado ese día y evita que un cambio en el catálogo altere deudas o historiales anteriores.

**¿Por qué un pago se anula en vez de borrarse?**  
Porque borrar ocultaría que el movimiento existió. La anulación conserva importe, fecha, responsable y motivo, pero deja de sumarlo al saldo.

**¿Por qué el saldo se deriva de movimientos reales?**  
Porque así no hay que sincronizar una columna adicional. El sistema resta del cargo únicamente los pagos activos y siempre puede explicar de dónde salió el resultado.

**¿Cómo se evita cobrar dos veces el mismo saldo?**  
Cada cobro bloquea temporalmente la fila del cargo dentro de una transacción, vuelve a calcular el saldo y recién entonces inserta. Dos operaciones simultáneas se resuelven una después de la otra.

## DECISIONES PENDIENTES

Las decisiones funcionales de esta etapa quedaron cerradas:

- métodos iniciales: `efectivo`, `tarjeta` y `transferencia`, sin `otro`;
- el odontólogo puede ajustar el precio precargado antes de crear el cargo;
- no se implementará anulación de cargos en el alcance inicial;
- se admiten fechas anteriores, pero no futuras ni pagos anteriores al cargo;
- la constancia interna no fiscal forma parte del cierre y se implementará más adelante;
- cualquier pago histórico vuelve inmutables los datos principales del cargo.

Solo permanece una precondición operativa: reconfirmar que `pagos` siga vacía inmediatamente antes de crear y ejecutar la futura migración. Cualquier fila nueva obliga a abandonar la recreación directa y diseñar una migración de datos.

## CONFIRMACIONES

**CÓDIGO MODIFICADO: NO**  
**BASE MODIFICADA: NO**  
**MIGRACIONES EJECUTADAS: NINGUNA**  
**COMMIT: NO**
