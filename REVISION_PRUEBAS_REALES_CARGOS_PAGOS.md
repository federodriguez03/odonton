# Revisión de pruebas reales Cargos / Pagos

Fecha: 2026-08-31

Fase: 4C.4 — pruebas funcionales reales del backend contra PostgreSQL.

## ALCANCE

La prueba utilizó exclusivamente los endpoints nuevos de Cargos/Pagos y consultas de control. No usó la pantalla frontend legacy, no envió WhatsApp, no ejecutó migraciones ni modificó estructura PostgreSQL.

Se creó el script reproducible `backend/scripts/test-cargos-pagos-integration.js`. Requiere backend y PostgreSQL reales, genera una marca única, registra todos los IDs creados y ejecuta teardown en `finally`.

## RESULTADOS FUNCIONALES

**CARGO PENDIENTE: CORRECTO**

- `POST /api/cargos`: HTTP 201.
- Importe: `30000.00`.
- Total abonado: `0.00`.
- Saldo: `30000.00`.
- Estado calculado: `PENDIENTE`.
- `GET /api/cargos/:id` devolvió historial vacío.

**PAGO PARCIAL: CORRECTO**

- Primer pago: `10000.00`, transferencia.
- HTTP 201.
- Total abonado: `10000.00`.
- Saldo: `20000.00`.
- Estado calculado: `PARCIAL`.

**PAGO TOTAL: CORRECTO**

- Segundo pago: `20000.00`, efectivo.
- HTTP 201.
- Total abonado: `30000.00`.
- Saldo: `0.00`.
- Estado calculado: `PAGADO`.

**SOBREPAGO: CORRECTO**

- Intento adicional: `1.00`.
- HTTP 409, código `SOBREPAGO`.
- El conteo de pagos del cargo no cambió.

**HISTORIAL: CORRECTO**

- Antes de la anulación aparecieron exactamente los dos pagos aceptados.
- Ambos figuraban activos.
- El intento de sobrepago no apareció.

**ANULACIÓN: CORRECTA**

- `POST /api/pagos/:id/anular`: HTTP 200.
- El segundo pago pasó a `anulado` y permaneció visible.
- Total abonado: `10000.00`.
- Saldo: `20000.00`.
- Estado calculado: `PARCIAL`.

**DOBLE ANULACIÓN: CORRECTA**

- Segundo intento: HTTP 409.
- Código: `PAGO_YA_ANULADO`.
- El primer pago continuó activo y el segundo permaneció anulado.

**CONCURRENCIA: CORRECTA**

- Cargo temporal: `10000.00`.
- Se enviaron dos requests independientes y concurrentes por `10000.00`.
- Resultado exacto: un HTTP 201 y un HTTP 409 `SOBREPAGO`.
- PostgreSQL conservó un único pago activo por `10000.00`.
- Saldo final del cargo: `0.00`, estado `PAGADO`.

El resultado demuestra que `SELECT ... FOR UPDATE` serializó las dos operaciones: la segunda solicitud recalculó el saldo después del commit de la primera y fue rechazada. Nunca ocurrió `201 + 201`.

**PACIENTE/TURNO: CORRECTO**

- Existían datos de referencia adecuados sin modificar información clínica.
- Se combinó un paciente con un turno perteneciente a otro paciente.
- Resultado: HTTP 409, código `TURNO_PACIENTE_INCOMPATIBLE`.
- El turno no fue modificado y no se creó cargo.

**ROLLBACK: CORRECTO**

- Se intentó crear un cargo con un ID de paciente inexistente.
- La validación falló después de iniciar la operación transaccional.
- Resultado: HTTP 404, código `PACIENTE_NO_ENCONTRADO`.
- Los conteos de Cargos/Pagos anteriores y posteriores fueron idénticos.

## DATOS TEMPORALES Y TEARDOWN

Marca única utilizada: `PRUEBA TECNICA 4C.4 - NO REAL - 99d27f1d-b69e-40ce-80c3-84dedd65a988`.

IDs técnicos creados y luego eliminados:

- cargos: `1`, `2`;
- pagos: `1`, `2`, `3`.

Teardown ejecutado dentro de una transacción:

1. `DELETE FROM pagos WHERE cargo_id = ANY(ids_cargos_prueba)`;
2. `DELETE FROM cargos WHERE id = ANY(ids_cargos_prueba)`;
3. `COMMIT`.

Filas eliminadas:

- pagos: 3;
- cargos: 2.

La comprobación independiente posterior confirmó:

- `cargos = 0`;
- `pagos = 0`;
- cargos con marca 4C.4 = 0.

Las secuencias no se reiniciaron, porque hacerlo no forma parte de un teardown seguro y no afecta la integridad. La auditoría técnica normal de los endpoints se conserva como trazabilidad del sistema.

**CONTEO INICIAL CARGOS: 0**

**CONTEO FINAL CARGOS: 0**

**CONTEO INICIAL PAGOS: 0**

**CONTEO FINAL PAGOS: 0**

**DATOS TEMPORALES ELIMINADOS: SÍ**

## REGRESIÓN

**PRUEBA DOMAIN: CORRECTA** — 25 escenarios.

**PRUEBA SERVICE: CORRECTA** — 13 escenarios aislados.

**REGRESIÓN: CORRECTA** — nueve pruebas de Turnos/WhatsApp.

**NODE CHECK: CORRECTO** — 79 archivos JavaScript.

**BUILD: CORRECTO** — Vite transformó 89 módulos.

**DIFF CHECK: CORRECTO**.

## ESTADO DE LA FASE

**FRONTEND PAGOS UTILIZADO: NO**

**TURNOS MODIFICADO: NO**

**WHATSAPP MODIFICADO: NO**

**WHATSAPP REAL ENVIADO: NO**

**BASE ESTRUCTURAL MODIFICADA: NO**

**MIGRACIONES EJECUTADAS: NINGUNA**

**COMMIT: NO**

## CONCLUSIÓN

El backend Cargos/Pagos cumple el flujo funcional completo, conserva historial, rechaza conflictos y evita sobrepagos bajo concurrencia real. El teardown restauró los conteos iniciales.

**FASE 4C.4: APROBADA**
