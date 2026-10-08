# FASE 4F — Cierre del módulo Cargos / Pagos

Fecha de cierre: 2026-09-01

## ESTADO GENERAL

El módulo de Cargos/Pagos internos está completo para el alcance académico definido. La implementación conserva el valor histórico de cada cargo, permite pagos parciales y totales, calcula saldo y estado de cobro, bloquea sobrepagos, mantiene anulaciones e historial, genera constancias internas y presenta reportes basados en pagos reales.

La fase 4F no cambió lógica ni PostgreSQL. Se limitó a consolidar evidencia, repetir validaciones aisladas y documentar la decisión de freeze.

Evidencia consolidada por fase:

- **4A — Diseño:** `DISENO_MODELO_PAGOS.md` y commit `590efe3`.
- **4B — Dominio y contratos:** `CONTRATOS_PAGOS.md` y commit `e8f5e52`.
- **4C — Migración, backend y pruebas reales:** `REVISION_MIGRACION_CARGOS_PAGOS.md`, este cierre y commits `d4d8edd`, `9c1c47e`, `1dc06d5`, `6aef5cd`.
- **4D — Frontend:** implementación consolidada en este cierre y commit `a9972ef`.
- **4E — Constancia y reportes:** implementación consolidada en este cierre y commits `4d5076b`, `681770c`.

El repositorio estaba limpio al iniciar 4F. La rama local estaba 32 commits por delante de `origin/main`.

## ARQUITECTURA

El recorrido funcional predominante es:

`pagosView.js → api.js → cargosRoutes/pagosRoutes → controllers → services + pagosRules → PostgreSQL`

Los reportes siguen:

`reportesView.js / dashboard.js → api.js → reportesRoutes → reportesController → reportesService → PostgreSQL`

Responsabilidades finales:

- el frontend captura datos, presenta respuestas y no recalcula reglas monetarias;
- las rutas aplican autenticación, autorización y auditoría;
- los controllers traducen HTTP sin contener cálculos monetarios;
- los services coordinan consultas y transacciones;
- `pagosRules.js` centraliza importes en centavos, estados y validaciones puras;
- PostgreSQL conserva cargos, pagos, relaciones, constraints e índices.

El registro y la anulación de pagos usan transacciones y bloqueos `FOR UPDATE` para tomar decisiones sobre un cargo o pago consistente. Saldo, total abonado y estado de cobro se calculan desde pagos activos y no se almacenan como datos derivados.

## FUNCIONALIDADES FINALES

- alta y consulta de cargos;
- concepto e importe histórico guardados en el cargo;
- asociación opcional con turno y prestación;
- registro de pagos parciales y totales;
- métodos efectivo, tarjeta y transferencia;
- saldo calculado desde pagos activos;
- estados calculados `PENDIENTE`, `PARCIAL` y `PAGADO`;
- bloqueo de sobrepago, incluida concurrencia;
- anulación lógica con motivo, fecha y usuario;
- rechazo de doble anulación;
- historial de pagos activos y anulados;
- filtros y paginación;
- constancia interna de pago;
- resumen financiero con ingresos reales y deuda;
- reporte clínico separado de los importes cobrados.

## PRUEBAS AUTOMÁTICAS

Validación final de 4F:

- `test-pagos-domain.js`: **25 escenarios correctos**;
- `test-cargos-pagos-service.js`: **20 escenarios correctos**;
- `test-reportes-financieros.js`: **9 escenarios correctos**;
- nueve suites de Turnos/WhatsApp: **correctas**;
- `node --check`: **81 archivos JavaScript correctos**;
- frontend Vite: **90 módulos compilados correctamente**;
- `git diff --check`: **correcto**.

Las pruebas de Pagos/Reportes son aisladas y no utilizaron PostgreSQL ni WhatsApp real. No se repitió `test-cargos-pagos-integration.js`, porque crea datos temporales y la evidencia real aprobada de 4C.4 ya era suficiente.

## PRUEBAS REALES

La ejecución aprobada contra PostgreSQL incluyó:

- cargo pendiente;
- pago parcial;
- pago total;
- sobrepago;
- historial;
- anulación y doble anulación;
- concurrencia con un único pago aceptado;
- coherencia paciente/turno;
- rollback ante error.

Los datos temporales de aquella prueba fueron retirados mediante su teardown controlado. No se crearon datos reales nuevos durante 4F.

## CHECKLIST MANUAL

Casos previamente validados y registrados como **APROBADOS** para el cierre:

- crear cargo: **APROBADO**;
- pago parcial: **APROBADO**;
- pago total: **APROBADO**;
- sobrepago: **APROBADO**;
- anulación: **APROBADO**;
- historial: **APROBADO**;
- constancia activa: **APROBADO**;
- constancia anulada: **APROBADO**;
- impresión / Guardar PDF: **APROBADO**;
- reportes financieros: **APROBADO**;
- reporte clínico separado: **APROBADO**.

No se repitieron operaciones reales porque existe evidencia suficiente y esta fase prohíbe modificar PostgreSQL.

## BASE DE DATOS

`database/schema_actual.sql` contiene el modelo definitivo:

- `public.cargos`, con importe positivo, paciente obligatorio y relaciones opcionales con turno y prestación;
- `public.pagos`, relacionado con cargo y con estados `activo`/`anulado`;
- constraints para importe positivo, métodos admitidos y coherencia de anulación;
- claves foráneas e índices por paciente, turno, prestación, cargo, fecha y estado.

La migración controlada y la regeneración del esquema quedaron registradas en las fases 4C.3/4C.4 y en el commit `1dc06d5`. En 4F no se ejecutaron migraciones, escrituras ni cambios estructurales.

## CONSTANCIA

La constancia se reconstruye desde datos persistidos mediante `GET /api/pagos/:id/constancia`. Incluye paciente, cargo, pago, estado y metadatos de anulación cuando corresponden.

La interfaz la identifica expresamente como **“Constancia interna de pago — no fiscal”** y **“sin validez fiscal”**. La impresión del navegador permite imprimir o guardar PDF sin convertirla en factura fiscal.

## REPORTES

El endpoint `GET /api/reportes/resumen` informa:

- ingresos reales: suma de pagos activos por `fecha_pago`;
- total adeudado: suma del saldo actual de cargos del período;
- cargos pendientes, parciales y pagados;
- ingresos por método de pago;
- cantidad informativa de pagos anulados;
- métricas clínicas en un bloque separado.

Las fechas son inclusivas. Los pagos anulados permanecen en historial, no suman ingresos y no reducen deuda. Ningún cálculo financiero usa `prestaciones.precio_base` como ingreso.

## LEGACY RETIRADO

La búsqueda final en `backend/src`, `frontend/src` y `frontend/index.html` no encontró referencias runtime a:

- `asegurarTablaPagos`;
- `pagosTableReady`;
- `pagos.monto`;
- `pagos.metodo`;
- `pagos.paciente_id`;
- `pagos.turno_id`;
- `updatePago`;
- `getResumenPagosPaciente`;
- `ingresos_estimados`;
- `/api/reportes/atencion-facturacion`.

Clasificación: **sin coincidencias runtime restantes**. Pueden existir descripciones del modelo anterior en diagnósticos o documentación histórica; no son consumidores ejecutables y se conservan como trazabilidad.

## FUERA DE ALCANCE

El módulo no implementa ni declara como funcionalidad:

- facturación fiscal;
- ARCA;
- CAE;
- factura electrónica;
- Mercado Pago;
- contabilidad profesional;
- impuestos, IVA, gastos o cierres contables.

## RIESGOS / BACKLOG

- La prueba de integración real debe ejecutarse únicamente en un entorno controlado, con PostgreSQL disponible y teardown verificado; no forma parte de la regresión cotidiana aislada.
- No existe una suite E2E de navegador automatizada para modales, impresión y descarga; actualmente están cubiertos por checklist manual.
- Si se agregan nuevos métodos de pago, deben actualizarse de forma coordinada dominio, constraint, frontend y reportes.
- La vista histórica de Estadísticas permanece sin pestaña y solo contiene información clínica; una limpieza futura puede decidir su retiro sin afectar este freeze.

Ninguno de estos puntos es bloqueante para el alcance actual.

## DECISIÓN DE FREEZE

Las reglas centrales están implementadas, el esquema definitivo está reflejado en `schema_actual.sql`, las pruebas aisladas y reales existentes son correctas, la checklist manual está aprobada y no quedan consumidores runtime del modelo legacy auditado.

Durante el freeze solo deberían aceptarse correcciones de defectos demostrables o cambios de alcance autorizados. Nuevas capacidades financieras deben abrir una fase independiente.

**MÓDULO CARGOS / PAGOS:**

**APTO PARA FREEZE: SÍ**
