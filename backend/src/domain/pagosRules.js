const ESTADOS_COBRO = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  PARCIAL: 'PARCIAL',
  PAGADO: 'PAGADO',
});

const METODOS_PAGO = Object.freeze([
  'efectivo',
  'tarjeta',
  'transferencia',
]);

const MAX_IMPORTE_CENTAVOS = 999_999_999_999;

function crearError(codigo, mensaje) {
  const error = new Error(mensaje);
  error.code = codigo;
  return error;
}

function normalizarImporteACentavos(value, { campo = 'importe' } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw crearError('IMPORTE_INVALIDO', `${campo} debe ser un importe monetario valido`);
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw crearError('IMPORTE_INVALIDO', `${campo} debe ser un importe monetario valido`);
  }

  const texto = String(value).trim();
  const coincidencia = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!coincidencia) {
    throw crearError(
      'IMPORTE_INVALIDO',
      `${campo} debe ser positivo y tener como maximo dos decimales`,
    );
  }

  const parteEntera = BigInt(coincidencia[1]);
  const parteDecimal = BigInt((coincidencia[2] || '').padEnd(2, '0'));
  const centavos = (parteEntera * 100n) + parteDecimal;

  if (centavos <= 0n) {
    throw crearError('IMPORTE_INVALIDO', `${campo} debe ser mayor que cero`);
  }

  if (centavos > BigInt(MAX_IMPORTE_CENTAVOS)) {
    throw crearError('IMPORTE_INVALIDO', `${campo} excede NUMERIC(12,2)`);
  }

  return Number(centavos);
}

function normalizarMetodoPago(value) {
  const metodo = String(value || '').trim().toLowerCase();
  if (!METODOS_PAGO.includes(metodo)) {
    throw crearError('METODO_PAGO_INVALIDO', 'metodo_pago invalido');
  }
  return metodo;
}

function validarCentavosNoNegativos(value, campo) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw crearError('IMPORTE_INVALIDO', `${campo} debe expresarse en centavos enteros no negativos`);
  }
}

function calcularEstadoCobro({ importeTotalCentavos, totalAbonadoCentavos }) {
  validarCentavosNoNegativos(importeTotalCentavos, 'importeTotalCentavos');
  validarCentavosNoNegativos(totalAbonadoCentavos, 'totalAbonadoCentavos');

  if (importeTotalCentavos === 0) {
    throw crearError('IMPORTE_INVALIDO', 'importeTotalCentavos debe ser mayor que cero');
  }
  if (totalAbonadoCentavos > importeTotalCentavos) {
    throw crearError('SOBREPAGO', 'El total abonado no puede superar el importe del cargo');
  }
  if (totalAbonadoCentavos === 0) return ESTADOS_COBRO.PENDIENTE;
  if (totalAbonadoCentavos === importeTotalCentavos) return ESTADOS_COBRO.PAGADO;
  return ESTADOS_COBRO.PARCIAL;
}

function validarPagoNoExcedeSaldo({ importePagoCentavos, saldoCentavos }) {
  validarCentavosNoNegativos(importePagoCentavos, 'importePagoCentavos');
  validarCentavosNoNegativos(saldoCentavos, 'saldoCentavos');

  if (importePagoCentavos === 0) {
    throw crearError('IMPORTE_INVALIDO', 'El importe del pago debe ser mayor que cero');
  }
  if (importePagoCentavos > saldoCentavos) {
    throw crearError('SOBREPAGO', 'El importe del pago supera el saldo disponible');
  }
  return true;
}

function normalizarFechaAdministrativa(value, { campo = 'fecha' } = {}) {
  const texto = String(value || '').trim();
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!coincidencia) {
    throw crearError('FECHA_INVALIDA', `${campo} debe usar el formato YYYY-MM-DD`);
  }

  const year = Number(coincidencia[1]);
  const month = Number(coincidencia[2]);
  const day = Number(coincidencia[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw crearError('FECHA_INVALIDA', `${campo} no es una fecha valida`);
  }

  return texto;
}

function obtenerFechaAdministrativaActual(hoy = new Date()) {
  if (typeof hoy === 'string') {
    return normalizarFechaAdministrativa(hoy, { campo: 'hoy' });
  }
  if (!(hoy instanceof Date) || Number.isNaN(hoy.getTime())) {
    throw crearError('FECHA_INVALIDA', 'hoy no es una fecha valida');
  }

  const year = hoy.getFullYear();
  const month = String(hoy.getMonth() + 1).padStart(2, '0');
  const day = String(hoy.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validarFechaNoFutura(value, { campo = 'fecha', hoy = new Date() } = {}) {
  const fecha = normalizarFechaAdministrativa(value, { campo });
  const fechaActual = obtenerFechaAdministrativaActual(hoy);
  if (fecha > fechaActual) {
    throw crearError('FECHA_FUTURA', `${campo} no puede ser futura`);
  }
  return fecha;
}

function validarFechasAdministrativas({ fechaCargo, fechaPago, hoy = new Date() }) {
  const cargo = validarFechaNoFutura(fechaCargo, { campo: 'fecha_cargo', hoy });
  const pago = validarFechaNoFutura(fechaPago, { campo: 'fecha_pago', hoy });

  if (pago < cargo) {
    throw crearError('FECHA_PAGO_ANTERIOR', 'fecha_pago no puede ser anterior a fecha_cargo');
  }

  return { fechaCargo: cargo, fechaPago: pago };
}

function crearSnapshotCargo({ concepto, importeTotal }) {
  const conceptoNormalizado = String(concepto || '').trim();
  if (!conceptoNormalizado) {
    throw crearError('CONCEPTO_INVALIDO', 'concepto requerido');
  }

  return Object.freeze({
    concepto: conceptoNormalizado,
    importeTotalCentavos: normalizarImporteACentavos(importeTotal, { campo: 'importe_total' }),
  });
}

function validarDatosPrincipalesCargoEditables({ cantidadPagosHistoricos }) {
  if (!Number.isSafeInteger(cantidadPagosHistoricos) || cantidadPagosHistoricos < 0) {
    throw crearError('CANTIDAD_PAGOS_INVALIDA', 'cantidadPagosHistoricos debe ser un entero no negativo');
  }
  if (cantidadPagosHistoricos > 0) {
    throw crearError(
      'CARGO_INMUTABLE',
      'El cargo no puede cambiar sus datos principales porque tiene pagos historicos',
    );
  }
  return true;
}

module.exports = {
  ESTADOS_COBRO,
  MAX_IMPORTE_CENTAVOS,
  METODOS_PAGO,
  calcularEstadoCobro,
  crearSnapshotCargo,
  normalizarFechaAdministrativa,
  normalizarImporteACentavos,
  normalizarMetodoPago,
  obtenerFechaAdministrativaActual,
  validarDatosPrincipalesCargoEditables,
  validarFechaNoFutura,
  validarFechasAdministrativas,
  validarPagoNoExcedeSaldo,
};
