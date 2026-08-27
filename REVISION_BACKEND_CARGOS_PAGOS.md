# Revisión del backend Cargos / Pagos

Fecha: 2026-08-27

Fase: 4C.2 — preparación del backend para el modelo `Cargos -> Pagos`.

Esta fase preparó el código sin iniciar Odonton, conectarlo al esquema actual ni ejecutar requests reales. La activación depende de aplicar primero la migración controlada de 4C.3.

## ARCHIVOS CREADOS

- `backend/src/services/cargosService.js`
- `backend/src/controllers/cargosController.js`
- `backend/src/routes/cargosRoutes.js`
- `backend/src/utils/pagosHttp.js`
- `backend/scripts/test-cargos-pagos-service.js`
- `REVISION_BACKEND_CARGOS_PAGOS.md`

## ARCHIVOS MODIFICADOS

- `backend/src/services/pagosService.js`
- `backend/src/controllers/pagosController.js`
- `backend/src/routes/pagosRoutes.js`
- `backend/src/domain/pagosRules.js`
- `backend/scripts/test-pagos-domain.js`
- `backend/src/app.js`

No se modificaron frontend, Turnos, WhatsApp, reportes, migraciones ni `database/schema_actual.sql`.

## DDL RUNTIME RETIRADO

Se retiró por completo del módulo Pagos:

- `pagosTableReady`;
- `asegurarTablaPagos()` y todas sus invocaciones;
- `CREATE TABLE` y `ALTER TABLE` runtime de `pagos`;
- normalizaciones `UPDATE` del esquema legacy;
- creación runtime de índices de Pagos.

`cargosService.js` y `pagosService.js` solo ejecutan DML o consultas. La búsqueda final no encontró DDL en ninguno de los dos.

Existen otros services históricos fuera de esta fase que todavía contienen DDL runtime, entre ellos Auditoría, Configuración, Documentos, Odontograma, Pacientes, Prestaciones, Prótesis, Tratamientos, Turnos y servicios de WhatsApp. No se modificaron porque esta fase prohíbe tocar esos módulos. Por ello, la afirmación global “ningún service del proyecto modifica estructura SQL” **no puede confirmarse todavía**; sí se cumple para el nuevo módulo Cargos/Pagos.

## ENDPOINTS PREPARADOS

Todos usan autenticación JWT, autorización de rol `odontologo` y el middleware de auditoría administrativo vigente.

| Método | Endpoint | Operación |
|---|---|---|
| POST | `/api/cargos` | Crear cargo y snapshot histórico. |
| GET | `/api/cargos` | Listar cargos, filtros, saldos y paginación. |
| GET | `/api/cargos/:id` | Obtener cargo, resumen e historial completo. |
| POST | `/api/pagos` | Registrar un pago activo. |
| GET | `/api/pagos` | Listar pagos activos y anulados. |
| POST | `/api/pagos/:id/anular` | Anular un pago con motivo y usuario autenticado. |

No existen rutas nuevas `PUT`, `PATCH`, `DELETE`, edición económica, restauración de anulaciones ni pagos pendientes.

## TRANSACCIONES

### Crear cargo

Usa un único client y una transacción. Valida y bloquea en modo compartido las referencias vigentes, crea el snapshot y confirma solamente después de obtener el resumen inicial. Cualquier error ejecuta rollback antes de liberar el client.

### Registrar pago

Secuencia implementada:

```text
BEGIN
SELECT cargo FOR UPDATE
SUM pagos activos
validar saldo en centavos
INSERT pago activo
recalcular resumen
COMMIT
```

En cualquier error se ejecuta `ROLLBACK`; el client se libera en `finally`.

### Anular pago

Secuencia implementada:

```text
BEGIN
localizar cargo_id del pago
SELECT cargo FOR UPDATE
SELECT pago FOR UPDATE
validar que siga activo
UPDATE exclusivo de datos de anulación
recalcular resumen
COMMIT
```

La operación conserva el movimiento histórico y nunca hace `DELETE`.

### Consultar detalle

`GET /api/cargos/:id` mantiene un lock compartido breve sobre el cargo dentro de una transacción para que resumen e historial correspondan al mismo estado frente a las escrituras del módulo.

## LOCKS

- Registro: `SELECT ... FROM cargos ... FOR UPDATE` antes de sumar o insertar.
- Anulación: orden estable `cargo -> pago` para evitar decisiones concurrentes y reducir deadlocks.
- Creación: `FOR SHARE` sobre paciente, turno y prestación durante la validación de referencias.
- Detalle: `FOR SHARE` sobre cargo mientras se leen suma e historial.

La prueba aislada verifica presencia y orden de las consultas. La espera concurrente real entre dos conexiones debe probarse con PostgreSQL después de la migración, en 4C.3.

## REGLAS IMPLEMENTADAS

- paciente obligatorio y existente;
- turno opcional, existente y perteneciente al paciente;
- prestación opcional, existente y coherente con el turno;
- concepto derivado de la prestación cuando no se informa uno;
- concepto e importe total persistidos como snapshot;
- importes normalizados a centavos enteros, sin comparaciones monetarias con `float`;
- fechas administrativas no futuras y pago no anterior al cargo;
- métodos limitados a `efectivo`, `tarjeta` y `transferencia`;
- saldo, total abonado y estado de cobro calculados solo con pagos activos;
- estados derivados `PENDIENTE`, `PARCIAL` y `PAGADO`, nunca persistidos;
- sobrepago rechazado después de recalcular el saldo bajo lock;
- pago creado siempre como `activo`;
- anulación irreversible, con motivo, fecha del servidor y usuario tomado del JWT;
- pagos anulados excluidos del saldo pero incluidos en el historial;
- inmutabilidad futura del cargo preparada mediante conteo de todos los pagos históricos, sin filtrar estado;
- errores conocidos traducidos a 400, 404 o 409 con códigos estables;
- errores inesperados responden 500 sin SQL ni stack;
- paginación conserva el total aun cuando la página solicitada no tenga filas.

## LEGACY RESTANTE

No quedan en `backend/src` consumidores del contrato anterior de Pagos: `asegurarTablaPagos`, `pagosTableReady`, `pagos.monto`, `pagos.metodo`, `pagos.paciente_id`, `pagos.turno_id`, resumen por paciente ni edición de pagos.

Las coincidencias `pendiente` que permanecen en backend corresponden a solicitudes de Turnos. `PENDIENTE`, `PARCIAL` y `PAGADO` en `pagosRules.js` son estados calculados legítimos del cargo.

El frontend permanece deliberadamente legacy hasta 4D:

- `frontend/src/js/api.js` todavía invoca `PUT /api/pagos/:id` y `/api/pagos/resumen/:pacienteId`;
- `frontend/src/js/views/pagosView.js` todavía usa `monto`, `metodo`, estado `pagado`, edición y el resumen anterior.

El build correcto no vuelve compatible ese flujo. La pantalla actual de Pagos no debe probarse contra el backend nuevo hasta adaptar el frontend en 4D.

## VALIDACIONES

**PRUEBA DOMAIN:** CORRECTA — 25 escenarios de reglas puras.

**PRUEBA SERVICE:** CORRECTA — 13 escenarios con pool/client falso, sin PostgreSQL ni WhatsApp.

**REGRESIÓN:** CORRECTA — nueve pruebas existentes de Turnos/WhatsApp.

**NODE CHECK:** CORRECTO — `backend/src` y `backend/scripts`.

**BUILD:** CORRECTO — Vite, sin modificar fuentes frontend.

**DIFF CHECK:** CORRECTO.

Las pruebas fake comprueban contratos y orquestación SQL, pero no sustituyen las constraints, tipos, locks ni concurrencia reales que se validarán después de 4C.3.

## ESTADO DE LA FASE

**BACKEND INICIADO CONTRA BD REAL: NO**

**BASE MODIFICADA: NO**

**MIGRACIÓN EJECUTADA: NO**

**SCHEMA_ACTUAL MODIFICADO: NO**

**FRONTEND MODIFICADO: NO**

**TURNOS MODIFICADO: NO**

**WHATSAPP MODIFICADO: NO**

**REPORTES MODIFICADOS: NO**

**COMMIT: NO**

## CONCLUSIÓN

El backend de Cargos/Pagos queda preparado para activarse en la misma ventana controlada que la migración 4C.3. Hasta entonces no debe iniciarse contra la base actual.

**BACKEND NUEVO LISTO PARA VENTANA 4C.3: SÍ**
