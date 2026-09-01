# FASE 4D.1 — Frontend Cargos / Pagos

Fecha: 2026-08-31  
Estado: implementación terminada y validada estáticamente; pendiente checklist manual del usuario.

## Alcance aplicado

La pantalla legacy de Pagos fue reemplazada por el recorrido administrativo:

`Paciente -> Cargo -> Pagos -> Saldo`

El frontend consume el contrato congelado de 4C.4. No se modificaron el backend, PostgreSQL, migraciones, Turnos, WhatsApp ni Reportes.

## Auditoría y legacy retirado

- Se retiró el formulario que registraba un pago directamente contra paciente/turno.
- Se retiraron `updatePago()` y el contrato inexistente `PUT /api/pagos/:id`.
- Se retiró `getResumenPagosPaciente()` y el contrato inexistente `/api/pagos/resumen/:pacienteId`.
- Se retiraron del payload de pagos los campos legacy `paciente_id`, `turno_id`, `monto`, `metodo` y el estado de cobro persistido.
- La nueva alta de pago envía únicamente `cargo_id`, `importe`, `metodo_pago`, `fecha_pago` y `observaciones`.
- No existe eliminación física, restauración ni edición de pagos en la interfaz.
- La búsqueda final no encontró `updatePago`, `getResumenPagosPaciente`, `/api/pagos/resumen`, `PUT/PATCH/DELETE /api/pagos` ni `monto` dentro del frontend de Pagos.
- Las coincidencias restantes de `estado` en otros módulos pertenecen a Turnos, Pacientes, Prestaciones, Reportes y Odontograma. En Pagos, `estado` se usa legítimamente para distinguir movimientos `activo`/`anulado` y `estado_cobro` proviene del backend.

## Contratos frontend

En `frontend/src/js/api.js` quedaron disponibles:

- `createCargo(payload)` -> `POST /api/cargos`.
- `getCargos(params)` -> `GET /api/cargos`.
- `getCargoById(id)` -> `GET /api/cargos/:id`.
- `createPago(payload)` -> `POST /api/pagos`.
- `getPagos(params)` -> `GET /api/pagos`.
- `anularPago(id, payload)` -> `POST /api/pagos/:id/anular`.

La vista usa `getCargoById()` para el detalle porque esa respuesta incluye el historial completo del cargo, incluidos los pagos anulados. `getPagos()` queda como contrato general disponible sin duplicar solicitudes en ese recorrido.

Los errores HTTP conservan ahora `codigo` y `status` como propiedades del `Error`, sin mostrar el código técnico al usuario. La pantalla traduce los conflictos de negocio solicitados y conserva el mensaje del backend para errores no mapeados, incluidos los errores 500.

## Funcionalidad implementada

### LISTADO CARGOS

Tabla principal con fecha, paciente, concepto, importe total, total abonado, saldo, estado calculado y acciones. Los estados visuales son `PENDIENTE`, `PARCIAL` y `PAGADO`, recibidos del backend.

### CREAR CARGO

Modal con paciente obligatorio; turno y prestación opcionales; concepto, importe histórico, fecha no futura y observaciones. Elegir una prestación puede sugerir concepto y precio base, pero el usuario conserva la posibilidad de modificar el importe antes del alta. No se crean cargos automáticamente desde Turnos.

### DETALLE CARGO

Consulta individual del cargo y presentación de paciente, concepto, fecha, importes, saldo, estado, observaciones y referencias opcionales a turno/prestación.

### REGISTRAR PAGO

Disponible únicamente si el saldo recibido es distinto de cero. Muestra el saldo actual, limita visualmente el importe y envía el contrato canónico. Después del éxito refresca el listado y vuelve a consultar el detalle.

### HISTORIAL

Muestra pagos activos y anulados con fecha, importe, método, estado y observaciones. Los anulados permanecen visibles, diferenciados e incluyen motivo/fecha de anulación cuando existen.

### ANULAR PAGO

Los pagos activos ofrecen una confirmación explícita en modal y requieren motivo. Después del éxito se refrescan historial, abonado, saldo y estado. No se ofrece borrado, restauración ni edición.

### FILTROS

Se implementaron solamente los soportados por `GET /api/cargos`: `paciente_id`, `estado_cobro`, `desde` y `hasta`, con acciones Aplicar y Limpiar.

### PAGINACIÓN

Se respeta `page`, `limit`, `total` y `total_pages` del backend, con navegación Anterior/Siguiente y resumen de resultados.

### MONEDA

Los importes del API permanecen como strings decimales. El formato visual ARS se construye sin convertir a float, y las comprobaciones de cero/máximo usan centavos enteros con `BigInt`.

### RESPONSIVE

La tabla usa contenedor responsive y los formularios/modal emplean la grilla Bootstrap y modo pantalla completa en móviles. No se rediseñaron otras secciones.

### INICIALIZACIÓN

`frontend/src/js/main.js` continúa importando y ejecutando `initPagosView()` dentro de la inicialización autenticada. No fue necesario modificarlo.

## Validaciones

- `node --check frontend/src/js/api.js`: correcto.
- `node --check frontend/src/js/views/pagosView.js`: correcto.
- `npm run build` del frontend: correcto; Vite transformó 89 módulos.
- Dominio Cargos/Pagos: 25 escenarios correctos, sin PostgreSQL ni WhatsApp.
- Services Cargos/Pagos: 13 escenarios correctos, con mocks y sin PostgreSQL ni WhatsApp.
- Nueve pruebas de regresión existentes: correctas.
- Integración real `test-cargos-pagos-integration.js`: no ejecutada, porque esta fase prohíbe crear datos en PostgreSQL.
- WhatsApp real: no ejecutado.
- `git diff --check`: correcto.

## Estado final solicitado

ARCHIVOS MODIFICADOS:

- `frontend/index.html`
- `frontend/src/js/api.js`
- `frontend/src/js/views/pagosView.js`

ARCHIVOS CREADOS:

- `REVISION_FRONTEND_CARGOS_PAGOS.md`

LEGACY RETIRADO: SÍ  
LISTADO CARGOS: IMPLEMENTADO  
CREAR CARGO: IMPLEMENTADO  
DETALLE CARGO: IMPLEMENTADO  
REGISTRAR PAGO: IMPLEMENTADO  
HISTORIAL: IMPLEMENTADO  
ANULAR PAGO: IMPLEMENTADO  
FILTROS: IMPLEMENTADOS  
PAGINACIÓN: IMPLEMENTADA  
RESPONSIVE: IMPLEMENTADO CON BOOTSTRAP  

BUILD: CORRECTO  
REGRESIÓN: CORRECTA  
DIFF CHECK: CORRECTO  

BACKEND MODIFICADO: NO  
BASE MODIFICADA: NO  
MIGRACIONES: NINGUNA  
TURNOS MODIFICADO: NO  
WHATSAPP MODIFICADO: NO  
REPORTES MODIFICADOS: NO  
COMMIT: NO  

FRONTEND LISTO PARA CHECKLIST MANUAL: SÍ
