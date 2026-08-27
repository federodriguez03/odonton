const assert = require('node:assert/strict');

const {
  ESTADOS_COBRO,
  calcularEstadoCobro,
  centavosAImporteDecimal,
  crearSnapshotCargo,
  normalizarImporteACentavos,
  normalizarImporteNoNegativoACentavos,
  normalizarMetodoPago,
  validarDatosPrincipalesCargoEditables,
  validarFechaNoFutura,
  validarFechasAdministrativas,
  validarPagoNoExcedeSaldo,
} = require('../src/domain/pagosRules');

function run() {
  assert.equal(normalizarImporteACentavos(100), 10_000);
  assert.equal(normalizarImporteACentavos('100.25'), 10_025);
  assert.throws(() => normalizarImporteACentavos(0), /mayor que cero/);
  assert.throws(() => normalizarImporteACentavos(-1), /debe ser positivo/);
  assert.throws(() => normalizarImporteACentavos('10.001'), /dos decimales/);
  assert.equal(normalizarImporteACentavos('0.30'), 30);
  assert.throws(() => normalizarImporteACentavos(0.1 + 0.2), /dos decimales/);
  assert.equal(normalizarImporteNoNegativoACentavos('0.00'), 0);
  assert.equal(centavosAImporteDecimal(10_025), '100.25');

  assert.equal(normalizarMetodoPago('efectivo'), 'efectivo');
  assert.equal(normalizarMetodoPago(' TARJETA '), 'tarjeta');
  assert.equal(normalizarMetodoPago('transferencia'), 'transferencia');
  assert.throws(() => normalizarMetodoPago('cheque'), /metodo_pago invalido/);

  assert.equal(
    calcularEstadoCobro({ importeTotalCentavos: 30_000, totalAbonadoCentavos: 0 }),
    ESTADOS_COBRO.PENDIENTE,
  );
  assert.equal(
    calcularEstadoCobro({ importeTotalCentavos: 30_000, totalAbonadoCentavos: 10_000 }),
    ESTADOS_COBRO.PARCIAL,
  );
  assert.equal(
    calcularEstadoCobro({ importeTotalCentavos: 30_000, totalAbonadoCentavos: 30_000 }),
    ESTADOS_COBRO.PAGADO,
  );

  assert.throws(
    () => validarPagoNoExcedeSaldo({ importePagoCentavos: 10_001, saldoCentavos: 10_000 }),
    /supera el saldo/,
  );
  assert.equal(
    validarPagoNoExcedeSaldo({ importePagoCentavos: 10_000, saldoCentavos: 10_000 }),
    true,
  );

  assert.throws(
    () => validarFechasAdministrativas({
      fechaCargo: '2026-08-25',
      fechaPago: '2026-08-24',
      hoy: '2026-08-27',
    }),
    /no puede ser anterior/,
  );
  assert.throws(
    () => validarFechaNoFutura('2026-08-28', { campo: 'fecha_cargo', hoy: '2026-08-27' }),
    /no puede ser futura/,
  );
  assert.throws(
    () => validarFechasAdministrativas({
      fechaCargo: '2026-08-25',
      fechaPago: '2026-08-28',
      hoy: '2026-08-27',
    }),
    /no puede ser futura/,
  );
  assert.throws(
    () => validarFechaNoFutura(['2026-08-25'], {
      campo: 'fecha_cargo',
      hoy: '2026-08-27',
    }),
    /formato YYYY-MM-DD/,
  );

  const prestacion = { nombre: 'Limpieza dental', precio_base: '30000.00' };
  const snapshot = crearSnapshotCargo({
    concepto: prestacion.nombre,
    importeTotal: prestacion.precio_base,
  });
  prestacion.nombre = 'Limpieza actualizada';
  prestacion.precio_base = '45000.00';
  assert.deepEqual(snapshot, {
    concepto: 'Limpieza dental',
    importeTotalCentavos: 3_000_000,
  });

  assert.equal(validarDatosPrincipalesCargoEditables({ cantidadPagosHistoricos: 0 }), true);
  const pagosHistoricos = [{ estado: 'anulado' }];
  assert.throws(
    () => validarDatosPrincipalesCargoEditables({
      cantidadPagosHistoricos: pagosHistoricos.length,
    }),
    /tiene pagos historicos/,
  );

  console.log('OK: dominio de Cargos/Pagos (25 escenarios, sin PostgreSQL ni WhatsApp)');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
