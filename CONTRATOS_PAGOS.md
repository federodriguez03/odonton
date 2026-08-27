# Contratos HTTP propuestos — Cargos y Pagos

Fecha: 2026-08-27
Estado: contrato de diseño para fases posteriores. Estos endpoints todavía no están implementados.

## Convenciones comunes

- Base: `/api`.
- Acceso: JWT válido y rol `odontologo` en todos los endpoints.
- Cuerpo: JSON.
- Fechas administrativas: texto `YYYY-MM-DD`.
- Importes canónicos en requests y responses: texto decimal positivo con hasta dos decimales, por ejemplo `"30000.00"`.
- El backend puede aceptar números JSON por compatibilidad, pero los normaliza inmediatamente a centavos enteros y responde importes con dos decimales.
- Moneda del alcance inicial: ARS; no se envía una moneda por operación.
- Estados de cobro calculados: `PENDIENTE`, `PARCIAL`, `PAGADO`.
- Estados persistidos de pago: `activo`, `anulado`.
- Métodos admitidos: `efectivo`, `tarjeta`, `transferencia`.
- Las fechas omitidas toman la fecha administrativa actual del servidor.
- Se permiten fechas históricas. No se permiten fechas futuras ni un pago anterior a su cargo.

Respuesta de error conceptual:

```json
{
  "mensaje": "Descripción comprensible",
  "codigo": "CODIGO_ESTABLE"
}
```

No deben enviarse stacks, SQL ni datos internos en producción.

## Resumen de endpoints

| Método | Endpoint | Responsabilidad | Éxito |
|---|---|---|---:|
| POST | `/api/cargos` | Crear un cargo histórico | 201 |
| GET | `/api/cargos` | Listar cargos y saldos | 200 |
| GET | `/api/cargos/:id` | Consultar cargo, saldo y pagos | 200 |
| POST | `/api/pagos` | Registrar dinero recibido | 201 |
| POST | `/api/pagos/:id/anular` | Anular un pago con trazabilidad | 200 |
| GET | `/api/pagos` | Consultar historial de pagos | 200 |

No se diseña `PUT/PATCH /api/pagos/:id` ni `DELETE /api/pagos/:id`. Un pago económico incorrecto se anula y se registra nuevamente.

## POST /api/cargos

Crea una obligación económica y congela su concepto e importe.

### Payload

```json
{
  "paciente_id": 25,
  "turno_id": 310,
  "prestacion_id": 8,
  "concepto": "Limpieza dental",
  "importe_total": "30000.00",
  "fecha_cargo": "2026-08-25",
  "observaciones": "Importe acordado con el paciente"
}
```

Campos:

| Campo | Requerido | Regla |
|---|---:|---|
| `paciente_id` | Sí | Entero positivo; el paciente debe existir. |
| `turno_id` | No | Entero positivo; debe existir y pertenecer al paciente. |
| `prestacion_id` | No | Entero positivo; debe existir y ser coherente con el turno cuando ambos se informan. |
| `concepto` | Condicional | Puede derivarse de la prestación. Sin prestación debe ser texto no vacío. |
| `importe_total` | Sí | Mayor que cero, máximo dos decimales y dentro de `NUMERIC(12,2)`. |
| `fecha_cargo` | No | Valor inicial: hoy. Admite fechas anteriores, no futuras. |
| `observaciones` | No | Texto interno opcional. |

`precio_base` puede servir de sugerencia, pero no forma parte del payload persistido. `importe_total` es el valor acordado definitivo.

### Respuesta 201

```json
{
  "mensaje": "Cargo registrado",
  "cargo": {
    "id": 501,
    "paciente_id": 25,
    "turno_id": 310,
    "prestacion_id": 8,
    "concepto": "Limpieza dental",
    "importe_total": "30000.00",
    "fecha_cargo": "2026-08-25",
    "observaciones": "Importe acordado con el paciente",
    "total_abonado": "0.00",
    "saldo": "30000.00",
    "estado_cobro": "PENDIENTE",
    "created_at": "2026-08-27T14:30:00.000Z",
    "updated_at": "2026-08-27T14:30:00.000Z"
  }
}
```

### Errores esperados

- 400: forma del payload, importe, concepto, ID o fecha inválidos.
- 404: paciente, turno o prestación inexistente.
- 409: turno de otro paciente o prestación contradictoria con el turno.
- 500: error inesperado.

## GET /api/cargos

Lista cargos con totales derivados. Todos los filtros son opcionales.

### Query params mínimos

| Filtro | Uso |
|---|---|
| `paciente_id` | Historial de un paciente. |
| `estado_cobro` | `PENDIENTE`, `PARCIAL` o `PAGADO`, calculado después de agregar pagos activos. |
| `desde` | `fecha_cargo >= desde`. |
| `hasta` | `fecha_cargo <= hasta`; incluye el día completo porque es una columna `DATE`. |
| `page` | Página, por defecto 1. |
| `limit` | Tamaño, por defecto 20 y máximo 100. |

No se necesita filtrar por precio actual de prestación.

### Respuesta 200

```json
{
  "cargos": [
    {
      "id": 501,
      "paciente_id": 25,
      "paciente_nombre": "Paciente",
      "paciente_apellido": "Ejemplo",
      "turno_id": 310,
      "prestacion_id": 8,
      "concepto": "Limpieza dental",
      "importe_total": "30000.00",
      "total_abonado": "10000.00",
      "saldo": "20000.00",
      "estado_cobro": "PARCIAL",
      "fecha_cargo": "2026-08-25"
    }
  ],
  "paginacion": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

Errores: 400 para filtros inválidos; 500 para fallo inesperado.

## GET /api/cargos/:id

Devuelve el cargo, su resumen calculado y todos sus pagos, incluidos los anulados.

### Respuesta 200

```json
{
  "cargo": {
    "id": 501,
    "paciente_id": 25,
    "turno_id": 310,
    "prestacion_id": 8,
    "concepto": "Limpieza dental",
    "importe_total": "30000.00",
    "fecha_cargo": "2026-08-25",
    "observaciones": null,
    "total_abonado": "10000.00",
    "saldo": "20000.00",
    "estado_cobro": "PARCIAL"
  },
  "pagos": []
}
```

Errores: 400 para ID inválido; 404 si el cargo no existe; 500 para fallo inesperado.

## POST /api/pagos

Registra dinero efectivamente recibido. La validación de saldo y el INSERT deben ocurrir dentro de una transacción que bloquee el cargo con `SELECT ... FOR UPDATE`.

### Payload

```json
{
  "cargo_id": 501,
  "importe": "10000.00",
  "metodo_pago": "transferencia",
  "fecha_pago": "2026-08-25",
  "observaciones": "Primera entrega"
}
```

| Campo | Requerido | Regla |
|---|---:|---|
| `cargo_id` | Sí | Entero positivo; el cargo debe existir. |
| `importe` | Sí | Mayor que cero, máximo dos decimales y no superior al saldo bloqueado. |
| `metodo_pago` | Sí | `efectivo`, `tarjeta` o `transferencia`. |
| `fecha_pago` | No | Valor inicial: hoy; no futura ni anterior a `fecha_cargo`. |
| `observaciones` | No | Texto interno opcional. |

El cliente no envía `paciente_id`, `estado`, `saldo` ni `total_abonado`.

### Respuesta 201

```json
{
  "mensaje": "Pago registrado",
  "pago": {
    "id": 900,
    "cargo_id": 501,
    "importe": "10000.00",
    "metodo_pago": "transferencia",
    "fecha_pago": "2026-08-25",
    "observaciones": "Primera entrega",
    "estado": "activo",
    "created_at": "2026-08-27T14:40:00.000Z"
  },
  "resumen_cargo": {
    "importe_total": "30000.00",
    "total_abonado": "10000.00",
    "saldo": "20000.00",
    "estado_cobro": "PARCIAL"
  }
}
```

### Errores esperados

- 400: payload, importe, método o fecha inválidos.
- 404: cargo inexistente.
- 409: sobrepago o conflicto concurrente de negocio.
- 500: error inesperado; la transacción debe hacer rollback.

## POST /api/pagos/:id/anular

Anula lógicamente un pago existente. No elimina ni modifica sus datos económicos.

### Payload

```json
{
  "motivo": "Se registró un importe incorrecto"
}
```

El motivo es obligatorio y no puede quedar vacío. La fecha y el usuario anulador se toman del servidor y del JWT, respectivamente.

### Respuesta 200

```json
{
  "mensaje": "Pago anulado",
  "pago": {
    "id": 900,
    "cargo_id": 501,
    "importe": "10000.00",
    "estado": "anulado",
    "fecha_anulacion": "2026-08-27T15:00:00.000Z",
    "motivo_anulacion": "Se registró un importe incorrecto",
    "anulado_por_usuario_id": 1
  },
  "resumen_cargo": {
    "importe_total": "30000.00",
    "total_abonado": "0.00",
    "saldo": "30000.00",
    "estado_cobro": "PENDIENTE"
  }
}
```

Errores: 400 para ID/motivo inválido; 404 si no existe; 409 si ya estaba anulado; 500 con rollback para fallo inesperado.

## GET /api/pagos

Consulta movimientos reales y anulaciones.

### Query params mínimos

| Filtro | Uso |
|---|---|
| `paciente_id` | Pagos de los cargos de un paciente. |
| `cargo_id` | Pagos de un cargo específico. |
| `estado` | `activo` o `anulado`. |
| `desde` | `fecha_pago >= desde`. |
| `hasta` | `fecha_pago <= hasta`. |
| `page` | Página, por defecto 1. |
| `limit` | Tamaño, por defecto 20 y máximo 100. |

### Respuesta 200

```json
{
  "pagos": [
    {
      "id": 900,
      "cargo_id": 501,
      "paciente_id": 25,
      "concepto": "Limpieza dental",
      "importe": "10000.00",
      "metodo_pago": "transferencia",
      "fecha_pago": "2026-08-25",
      "estado": "activo",
      "observaciones": "Primera entrega",
      "fecha_anulacion": null,
      "motivo_anulacion": null
    }
  ],
  "paginacion": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "total_pages": 1
  }
}
```

`paciente_id` de la respuesta se obtiene mediante el cargo; no se almacena en `pagos`.

Errores: 400 para filtros inválidos; 500 para fallo inesperado.

## Regla de corrección del cargo

Esta fase no define todavía un endpoint de edición de cargos, pero fija su precondición de dominio:

- cero pagos históricos: pueden corregirse paciente, turno, prestación, concepto o importe;
- uno o más pagos históricos: esos datos son inmutables, aunque todos los pagos estén anulados.

La comprobación futura contará todos los pagos del cargo sin filtrar por estado. Una infracción responde 409 `CARGO_INMUTABLE`.

No se implementa anulación de cargos en el alcance inicial.

## Responsabilidad por capa

### Frontend

- marca campos requeridos y limita selecciones conocidas;
- permite ingresar como máximo dos decimales;
- muestra solo los tres métodos admitidos;
- impide seleccionar fechas futuras y advierte si el pago precede al cargo;
- solicita confirmación y motivo al anular;
- trata los importes recibidos como textos decimales, sin sumar dinero con floats;
- estas comprobaciones mejoran la experiencia, pero no son una barrera de seguridad.

### Controller

- extrae params, query y body;
- verifica la forma básica del JSON y la presencia del usuario autenticado;
- pasa datos y usuario al service;
- traduce errores conocidos a 400, 404 o 409;
- responde 500 ante errores inesperados sin exponer detalles internos;
- no ejecuta SQL ni decide saldo, coherencia o estado de cobro.

### Service y dominio

- son la validación autoritativa;
- normalizan importes a centavos y métodos a valores canónicos;
- validan fechas administrativas;
- verifican existencia y coherencia de paciente, turno y prestación;
- crean el snapshot de concepto/importe;
- bloquean el cargo y calculan saldo dentro de la transacción;
- impiden sobrepagos y doble anulación;
- calculan `PENDIENTE`, `PARCIAL` o `PAGADO` sin almacenarlos;
- aplican la inmutabilidad basada en cualquier pago histórico.

### PostgreSQL

- garantiza PK, FK, nulabilidad, estados/métodos permitidos e importes positivos;
- conserva `NUMERIC(12,2)` como representación monetaria;
- no almacena saldo ni estado de cobro derivados;
- no puede garantizar con un `CHECK` simple la suma agregada de pagos: esa regla se protege mediante transacción y bloqueo en el service.

## Códigos HTTP

| Código | Uso |
|---:|---|
| 200 | Consulta o anulación correcta. |
| 201 | Cargo o pago creado. |
| 400 | Entrada o filtro inválido. |
| 401 | JWT ausente o inválido. |
| 403 | Usuario sin rol autorizado. |
| 404 | Paciente, turno, prestación, cargo o pago inexistente. |
| 409 | Conflicto de negocio: sobrepago, relación incompatible, doble anulación o cargo inmutable. |
| 500 | Error inesperado. |

## Fuera de esta fase

Este documento no activa endpoints. En la FASE 4B no se crean routes, controllers, services, SQL, migraciones, UI, PDF ni reportes.
