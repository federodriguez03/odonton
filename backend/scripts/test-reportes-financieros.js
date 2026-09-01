const assert = require('node:assert/strict');

function cents(value) {
  const [integer, decimal = ''] = String(value).split('.');
  return (BigInt(integer) * 100n) + BigInt(decimal.padEnd(2, '0').slice(0, 2));
}

function decimal(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

function createFakeDatabase() {
  let state = { cargos: [], pagos: [] };
  let log = [];

  function inRange(date, from, to) {
    return date >= from && date <= to;
  }

  function activeTotal(cargoId) {
    return state.pagos
      .filter((payment) => payment.cargo_id === cargoId && payment.estado === 'activo')
      .reduce((total, payment) => total + cents(payment.importe), 0n);
  }

  async function query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, ' ').trim();
    const lower = text.toLowerCase();
    log.push({ text, params: [...params] });

    if (lower.includes('as total_turnos') && lower.includes('from turnos t')) {
      return { rows: [{
        total_turnos: 0,
        total_realizados: 0,
        total_cancelados: 0,
        total_reprogramados: 0,
        total_confirmados: 0,
      }] };
    }
    if (lower.includes('as prestacion_id') && lower.includes("t.estado = 'realizado'")) {
      return { rows: [] };
    }
    if (lower.includes('as ingresos_reales') && lower.includes('from pagos p')) {
      const [from, to] = params;
      const periodPayments = state.pagos.filter((payment) => inRange(payment.fecha_pago, from, to));
      const active = periodPayments.filter((payment) => payment.estado === 'activo');
      const sum = (method = null) => active
        .filter((payment) => !method || payment.metodo_pago === method)
        .reduce((total, payment) => total + cents(payment.importe), 0n);
      return { rows: [{
        ingresos_reales: decimal(sum()),
        efectivo: decimal(sum('efectivo')),
        tarjeta: decimal(sum('tarjeta')),
        transferencia: decimal(sum('transferencia')),
        pagos_anulados: periodPayments.filter((payment) => payment.estado === 'anulado').length,
      }] };
    }
    if (lower.includes('with cargos_con_saldo as')) {
      const [from, to] = params;
      const balances = state.cargos
        .filter((charge) => inRange(charge.fecha_cargo, from, to))
        .map((charge) => ({
          total: cents(charge.importe_total),
          balance: cents(charge.importe_total) - activeTotal(charge.id),
        }));
      const debt = balances
        .filter((item) => item.balance > 0n)
        .reduce((total, item) => total + item.balance, 0n);
      return { rows: [{
        total_adeudado: decimal(debt),
        pendientes: balances.filter((item) => item.balance === item.total).length,
        parciales: balances.filter((item) => item.balance > 0n && item.balance < item.total).length,
        pagados: balances.filter((item) => item.balance === 0n).length,
      }] };
    }
    throw new Error(`Consulta no contemplada: ${text}`);
  }

  return {
    pool: { query },
    reset(nextState) {
      state = JSON.parse(JSON.stringify(nextState));
      log = [];
    },
    queryLog() {
      return [...log];
    },
  };
}

const fakeDb = createFakeDatabase();
const dbModulePath = require.resolve('../src/config/db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { pool: fakeDb.pool },
};
const reportesService = require('../src/services/reportesService');

const RANGE = { fechaDesde: '2026-08-01', fechaHasta: '2026-08-31', incluirDetalle: false };
const cargo = (changes = {}) => ({ id: 1, importe_total: '100.00', fecha_cargo: '2026-08-10', ...changes });
const payment = (changes = {}) => ({
  id: 1,
  cargo_id: 1,
  importe: '40.00',
  metodo_pago: 'efectivo',
  fecha_pago: '2026-08-15',
  estado: 'activo',
  ...changes,
});

const tests = [];
function test(name, callback) {
  tests.push({ name, callback });
}

async function generate(cargos, pagos, range = RANGE) {
  fakeDb.reset({ cargos, pagos });
  return reportesService.generarReporteClinicoFinanciero(range);
}

test('1. suma como ingreso un pago activo', async () => {
  const report = await generate([cargo()], [payment()]);
  assert.equal(report.financiero.ingresos_reales, '40.00');
});

test('2. excluye los pagos anulados de ingresos y deuda', async () => {
  const report = await generate([cargo()], [
    payment({ id: 1, importe: '40.00' }),
    payment({ id: 2, importe: '60.00', estado: 'anulado' }),
  ]);
  assert.equal(report.financiero.ingresos_reales, '40.00');
  assert.equal(report.financiero.total_adeudado, '60.00');
  assert.equal(report.financiero.pagos_anulados, 1);
});

test('3. acumula varios pagos parciales activos', async () => {
  const report = await generate([cargo()], [
    payment({ id: 1, importe: '25.00' }),
    payment({ id: 2, importe: '25.00', metodo_pago: 'tarjeta' }),
  ]);
  assert.equal(report.financiero.ingresos_reales, '50.00');
  assert.equal(report.financiero.cargos_parciales, 1);
});

test('4. calcula correctamente el saldo pendiente', async () => {
  const report = await generate([cargo()], [payment({ importe: '35.00' })]);
  assert.equal(report.financiero.total_adeudado, '65.00');
});

test('5. clasifica un cargo con saldo cero como pagado', async () => {
  const report = await generate([cargo()], [payment({ importe: '100.00' })]);
  assert.equal(report.financiero.total_adeudado, '0.00');
  assert.equal(report.financiero.cargos_pagados, 1);
});

test('6. suma el total adeudado de varios cargos', async () => {
  const report = await generate(
    [cargo({ id: 1, importe_total: '100.00' }), cargo({ id: 2, importe_total: '80.00' })],
    [payment({ cargo_id: 1, importe: '30.00' })],
  );
  assert.equal(report.financiero.total_adeudado, '150.00');
  assert.equal(report.financiero.cargos_pendientes, 1);
  assert.equal(report.financiero.cargos_parciales, 1);
});

test('7. incluye movimientos exactamente en ambas fechas limite', async () => {
  const report = await generate(
    [cargo({ id: 1, fecha_cargo: '2026-08-01' }), cargo({ id: 2, fecha_cargo: '2026-08-31' })],
    [
      payment({ id: 1, cargo_id: 1, importe: '10.00', fecha_pago: '2026-08-01' }),
      payment({ id: 2, cargo_id: 2, importe: '20.00', fecha_pago: '2026-08-31' }),
    ],
  );
  assert.equal(report.financiero.ingresos_reales, '30.00');
  assert.equal(report.financiero.cargos_parciales, 2);
});

test('8. separa fecha_pago para ingresos y fecha_cargo para saldos', async () => {
  const report = await generate(
    [
      cargo({ id: 1, fecha_cargo: '2026-07-20' }),
      cargo({ id: 2, fecha_cargo: '2026-08-10' }),
    ],
    [
      payment({ id: 1, cargo_id: 1, importe: '30.00', fecha_pago: '2026-08-10' }),
      payment({ id: 2, cargo_id: 2, importe: '40.00', fecha_pago: '2026-07-25' }),
    ],
  );
  assert.equal(report.financiero.ingresos_reales, '30.00');
  assert.equal(report.financiero.total_adeudado, '60.00');
  assert.equal(report.rango.ingresos_por, 'fecha_pago');
  assert.equal(report.rango.cargos_por, 'fecha_cargo');
});

test('9. ninguna consulta del reporte usa precio_base como ingreso', async () => {
  await generate([cargo()], [payment()]);
  const sql = fakeDb.queryLog().map((entry) => entry.text).join(' ');
  assert.doesNotMatch(sql, /precio_base/i);
  assert.match(sql, /p\.importe/i);
});

async function run() {
  for (const item of tests) {
    await item.callback();
    console.log(`OK: ${item.name}`);
  }
  console.log(`OK: reportes financieros (${tests.length} escenarios, sin PostgreSQL ni WhatsApp)`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
