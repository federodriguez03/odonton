# FASE 4E.1 — Constancia interna de pago

Fecha: 2026-08-31  
Estado: implementación terminada y validada automáticamente; pendiente prueba manual de visualización e impresión.

## Solución implementada

Se incorporó una constancia administrativa reconstruida en cada consulta desde PostgreSQL. No se persiste la constancia, no se almacena ningún archivo y no se agregó una biblioteca de PDF.

Recorrido:

`Historial de pagos -> GET /api/pagos/:id/constancia -> route -> controller -> service -> pago/cargo/paciente/configuración -> JSON -> modal imprimible`

## Endpoint

`GET /api/pagos/:id/constancia`

- Requiere JWT y rol `odontologo`.
- Usa el middleware de auditoría con la acción `ver_constancia_pago`.
- El único dato recibido del frontend es el ID técnico del pago.
- Un ID inválido responde 400 mediante `ID_INVALIDO`.
- Un pago inexistente responde 404 mediante `PAGO_NO_ENCONTRADO`.
- Los errores inesperados responden 500 sin exponer SQL ni stack.
- El service ejecuta un único `SELECT`; no contiene `INSERT`, `UPDATE`, `DELETE` ni DDL.

## Datos incluidos

La respuesta JSON contiene:

- consultorio: nombre, teléfono configurado y zona administrativa disponible;
- paciente: ID interno, nombre, apellido y DNI, obtenidos mediante el cargo del pago;
- pago: número interno, fecha, importe, método, estado, observaciones y metadatos de anulación;
- cargo: número interno, concepto histórico, fecha, observaciones, importe total, total abonado activo, saldo y estado de cobro calculado;
- fecha/hora de generación tomada por PostgreSQL;
- título explícito `Constancia interna de pago — no fiscal`.

El total abonado se obtiene sumando únicamente pagos `activo`. Los importes se normalizan con las reglas monetarias existentes y permanecen como strings decimales.

## Pago activo

La acción `Constancia` se muestra en el historial. La vista presenta el pago como `Activo`, sus datos administrativos y el resumen vigente del cargo.

## Pago anulado

La acción también se mantiene disponible. La constancia muestra una advertencia roja y destacada `PAGO ANULADO`, además del estado, fecha y motivo de anulación. No se presenta como dinero vigente y su importe no integra el total abonado actual.

## Impresión y guardado como PDF

El botón `Imprimir / Guardar PDF` utiliza `window.print()`. El diálogo nativo permite imprimir físicamente o elegir la opción del sistema para guardar como PDF.

No se crea, sube ni almacena un archivo desde Odonton.

## Responsive y estilos de impresión

- El modal usa Bootstrap y se adapta a escritorio, tablet y móvil.
- La constancia usa una grilla de dos columnas que pasa a una columna en pantallas pequeñas.
- Los estilos `@media print` solo se activan cuando el usuario imprime esta constancia.
- Durante esa impresión se ocultan navegación, otras pantallas, fondos, botones y modales ajenos.
- La hoja usa fondo blanco, márgenes de 16 mm y contenido sin bordes decorativos innecesarios.
- La impresión normal de otras pantallas no queda afectada.

## Pruebas

Se incorporaron siete escenarios a `backend/scripts/test-cargos-pagos-service.js`:

1. constancia de pago activo;
2. pago anulado con fecha y motivo;
3. pago inexistente;
4. total abonado y saldo calculados solo desde pagos activos;
5. paciente obtenido a través del cargo;
6. conservación del concepto histórico;
7. estado anulado expuesto inequívocamente a la vista.

Resultados:

- Dominio Cargos/Pagos: 25 escenarios correctos.
- Service Cargos/Pagos: 20 escenarios correctos, incluidos los 7 nuevos.
- Nueve suites de regresión Turnos/WhatsApp: correctas.
- WhatsApp real: no ejecutado.
- PostgreSQL real: no utilizado por las pruebas.
- `node --check`: 79 archivos backend y los 2 archivos frontend afectados, correctos.
- Frontend build: correcto; Vite transformó 89 módulos.
- `git diff --check`: correcto.

## Estado final solicitado

ENDPOINT: `GET /api/pagos/:id/constancia`  
DATOS INCLUIDOS: CONSULTORIO, PACIENTE, PAGO, CARGO, SALDOS, OBSERVACIONES Y GENERACIÓN  
PAGO ACTIVO: IMPLEMENTADO  
PAGO ANULADO: IMPLEMENTADO Y DESTACADO  
IMPRESIÓN: NATIVA MEDIANTE `window.print()`  
GUARDAR COMO PDF: DISPONIBLE DESDE EL DIÁLOGO DEL NAVEGADOR/SISTEMA  
RESPONSIVE / PRINT CSS: IMPLEMENTADO Y ACOTADO A LA CONSTANCIA  

ARCHIVOS CREADOS:

- `REVISION_CONSTANCIA_PAGO.md`

ARCHIVOS MODIFICADOS:

- `backend/src/services/pagosService.js`
- `backend/src/controllers/pagosController.js`
- `backend/src/routes/pagosRoutes.js`
- `backend/scripts/test-cargos-pagos-service.js`
- `frontend/src/js/api.js`
- `frontend/src/js/views/pagosView.js`
- `frontend/src/styles/main.css`
- `frontend/index.html`

PRUEBAS: CORRECTAS  
NODE CHECK: CORRECTO  
BUILD: CORRECTO  
DIFF CHECK: CORRECTO  

BASE MODIFICADA: NO  
MIGRACIONES: NINGUNA  
TURNOS MODIFICADO: NO  
WHATSAPP MODIFICADO: NO  
REPORTES MODIFICADOS: NO  
COMMIT: NO  

CONSTANCIA LISTA PARA PRUEBA MANUAL: SÍ
