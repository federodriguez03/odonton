# FASE 4E.2 — Reportes financieros reales

Fecha: 2026-08-31

## Alcance

Se reemplazaron los importes estimados derivados de turnos y precios de prestaciones por un resumen financiero basado exclusivamente en `cargos` y `pagos`. No se modificaron el modelo Cargos/Pagos, PostgreSQL, Turnos ni WhatsApp.

## Auditoría previa

### Métricas anteriores

- `reportesService.js` calculaba `ingresos_estimados` sumando `prestaciones.precio_base` de turnos realizados.
- `estadisticasService.js` repetía ese cálculo por día y por prestación.
- Dashboard consumía `estadisticas.resumen.ingresos_estimados` como si fuera ingreso.
- La vista de Reportes mezclaba actividad clínica, precios base e ingresos estimados bajo el término “facturación”.
- `reportesView.js` y `estadisticasView.js` existían, pero ninguna se inicializaba desde `main.js`.

Ese modelo no demostraba dinero cobrado: una prestación realizada podía no tener cargo o pago, y el precio actual de la prestación no constituye un importe histórico cobrado.

## Métricas nuevas

### Ingresos reales

`SUM(pagos.importe)` exclusivamente para pagos con `estado = 'activo'`, filtrados de forma inclusiva por `pagos.fecha_pago`.

Los pagos anulados permanecen en el historial, no suman ingresos y no reducen la deuda. Se informa solamente su cantidad dentro del período.

### Total adeudado y estados de cobro

Para cada cargo del rango inclusivo de `cargos.fecha_cargo`, el saldo actual se calcula como:

`cargos.importe_total - SUM(pagos activos del cargo)`

A partir de ese saldo calculado se informa:

- total adeudado: suma de saldos mayores que cero;
- pendiente: saldo igual al importe total;
- parcial: saldo mayor que cero y menor que el importe total;
- pagado: saldo igual a cero.

No se persiste un estado de cobro ni se usan números de punto flotante para reglas monetarias. PostgreSQL devuelve los importes `NUMERIC(12,2)` como strings.

### Métodos de pago

Los ingresos reales se discriminan por los métodos admitidos por el dominio:

- efectivo;
- tarjeta;
- transferencia.

## Contrato y recorrido técnico

La pantalla usa el siguiente recorrido:

`Reportes / Dashboard → getResumenClinicoFinanciero → GET /api/reportes/resumen → reportesController.obtenerResumenClinicoFinanciero → reportesService.generarReporteClinicoFinanciero → PostgreSQL`

El endpoint conserva autenticación, autorización de odontólogo y auditoría. El rango exige fechas `YYYY-MM-DD`, valida el orden y declara expresamente que ambas fechas son inclusivas.

La respuesta separa dos bloques:

- `financiero`: ingresos reales, deuda, cantidades por estado calculado, ingresos por método y cantidad informativa de pagos anulados;
- `clinico`: resumen de turnos, prestaciones realizadas y detalle opcional de turnos.

## Reportes clínicos conservados

- total de turnos;
- turnos realizados;
- turnos cancelados;
- turnos reprogramados;
- turnos confirmados;
- prestaciones realizadas y cantidad;
- detalle opcional de turnos.

La información clínica ya no incorpora precio base ni intenta reconstruir ingresos.

## Legacy financiero retirado

- cálculo `ingresos_estimados` desde `prestaciones.precio_base`;
- suma de precio base dentro de reportes y estadísticas;
- precio base dentro del detalle financiero exportado;
- endpoint `/api/reportes/atencion-facturacion` y sus consumidores;
- helper frontend `getReporteAtencionFacturacion`;
- denominación “Reporte de atención y facturación” para esta gestión interna.

La búsqueda global previa confirmó que el endpoint y el helper retirados no tenían otros consumidores ejecutables.

## Estadísticas, Reportes y arranque

### Estadísticas

`estadisticasService.js` se conserva como fuente de métricas clínicas del Dashboard. Ya no devuelve importes ni ingresos estimados. `estadisticasView.js` también quedó limitada a información clínica y continúa sin una pestaña de navegación, evitando una segunda pantalla financiera duplicada.

### Reportes

Se conectó una única pantalla “Reportes”, con separación visible entre “Resumen financiero” y “Reporte clínico”. Muestra ARS sin recalcular métricas y permite filtrar desde/hasta. Las exportaciones internas CSV e impresión/PDF usan los mismos valores entregados por el backend y no tienen alcance fiscal.

### main.js

`main.js` inicializa `initReportesView`. No inicializa la vista duplicada de Estadísticas.

## Pruebas

Se agregó `backend/scripts/test-reportes-financieros.js`, aislado de PostgreSQL y WhatsApp, con nueve escenarios:

1. ingreso con pago activo;
2. pago anulado excluido de ingresos y deuda;
3. varios pagos parciales;
4. saldo pendiente correcto;
5. cargo pagado con saldo cero;
6. total adeudado de varios cargos;
7. fechas desde/hasta inclusivas;
8. separación entre `fecha_pago` y `fecha_cargo`;
9. ausencia de `precio_base` en los cálculos financieros.

Resultado: **9/9 correctos**.

También se ejecutaron correctamente:

- dominio Cargos/Pagos: 25 escenarios;
- servicios Cargos/Pagos: 20 escenarios;
- nueve suites de regresión de Turnos/WhatsApp existentes;
- chequeo sintáctico de los 67 archivos JavaScript de `backend/src`.

`test-cargos-pagos-integration.js` no se ejecutó porque escribe datos temporales en PostgreSQL; se respetó la prohibición de modificar la base durante esta fase. Las pruebas ejecutadas usaron dobles de base y no enviaron WhatsApp real.

## Validación

- Node check: correcto, 67 archivos.
- Pruebas aisladas: correctas, 12 archivos de prueba ejecutados.
- Build frontend: correcto, 90 módulos transformados.
- `git diff --check`: correcto.
- PostgreSQL modificado: no.
- Migraciones ejecutadas: ninguna.
- Turnos modificado: no.
- WhatsApp modificado: no.
- Commit realizado: no.

## Archivos creados

- `backend/scripts/test-reportes-financieros.js`
- `REVISION_REPORTES_FINANCIEROS.md`

## Archivos modificados

- `backend/src/controllers/reportesController.js`
- `backend/src/routes/reportesRoutes.js`
- `backend/src/services/estadisticasService.js`
- `backend/src/services/reportesService.js`
- `frontend/index.html`
- `frontend/src/js/api.js`
- `frontend/src/js/main.js`
- `frontend/src/js/views/estadisticasView.js`
- `frontend/src/js/views/reportesView.js`
- `frontend/src/pages/dashboard.js`

## Estado de checklist

Los Reportes quedan listos para una checklist manual con backend y PostgreSQL locales: autenticación, rango inclusivo, importes reales, clasificación de cargos, pagos anulados, métodos, exportación y separación clínica/financiera.
