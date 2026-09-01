const assert = require('node:assert/strict');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compactSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function result(rows = []) {
  return { rows: clone(rows), rowCount: rows.length };
}

function importeACentavos(value) {
  const [entera, decimal = ''] = String(value).split('.');
  return (Number(entera) * 100) + Number(decimal.padEnd(2, '0').slice(0, 2));
}

function centavosAImporte(centavos) {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

function crearBaseFalsa() {
  let live;
  let transaction = null;
  let log = [];
  let nextCargoId = 1;
  let nextPagoId = 1;
  let failAfterPaymentInsert = false;
  let paymentInsertedInTransaction = false;

  const defaults = {
    pacientes: [
      { id: 1, nombre: 'Rita', apellido: 'Quinteros', dni: '10173234' },
      { id: 2, nombre: 'Mario', apellido: 'Paz', dni: '22333444' },
    ],
    turnos: [
      { id: 10, paciente_id: 1, prestacion_id: 100 },
      { id: 20, paciente_id: 2, prestacion_id: 100 },
    ],
    prestaciones: [
      { id: 100, nombre: 'Limpieza dental', precio_base: '100.00' },
    ],
    cargos: [],
    pagos: [],
    configuracion: {
      nombre_consultorio: 'Odonton CBA',
      whatsapp_numero: '3510000000',
      timezone: 'America/Argentina/Buenos_Aires',
    },
  };

  function currentStore() {
    return transaction || live;
  }

  function findById(collection, id) {
    return collection.find((item) => Number(item.id) === Number(id));
  }

  function totalAbonado(store, cargoId) {
    const centavos = store.pagos
      .filter((pago) => Number(pago.cargo_id) === Number(cargoId) && pago.estado === 'activo')
      .reduce((total, pago) => total + importeACentavos(pago.importe), 0);
    return centavosAImporte(centavos);
  }

  async function dispatch(scope, sql, params = []) {
    const text = compactSql(sql);
    const lower = text.toLowerCase();
    log.push({ scope, text, params: clone(params) });

    if (text === 'BEGIN') {
      if (scope !== 'client') throw new Error('BEGIN fuera de un client dedicado');
      if (transaction) throw new Error('Transaccion ya iniciada');
      transaction = clone(live);
      paymentInsertedInTransaction = false;
      return result();
    }
    if (text === 'COMMIT') {
      if (!transaction) throw new Error('COMMIT sin transaccion');
      live = transaction;
      transaction = null;
      paymentInsertedInTransaction = false;
      return result();
    }
    if (text === 'ROLLBACK') {
      if (!transaction) throw new Error('ROLLBACK sin transaccion');
      transaction = null;
      paymentInsertedInTransaction = false;
      return result();
    }

    const store = currentStore();

    if (lower === 'select id from pacientes where id = $1 for share') {
      const paciente = findById(store.pacientes, params[0]);
      return result(paciente ? [{ id: paciente.id }] : []);
    }

    if (
      lower.includes('select id, paciente_id, prestacion_id')
      && lower.includes('from turnos')
      && lower.includes('where id = $1')
      && lower.endsWith('for share')
    ) {
      const turno = findById(store.turnos, params[0]);
      return result(turno ? [turno] : []);
    }

    if (
      lower.includes('select id, nombre')
      && lower.includes('from prestaciones')
      && lower.includes('where id = $1')
      && lower.endsWith('for share')
    ) {
      const prestacion = findById(store.prestaciones, params[0]);
      return result(prestacion ? [prestacion] : []);
    }

    if (lower.startsWith('insert into cargos (')) {
      if (!transaction) throw new Error('INSERT de cargo sin transaccion');
      const [
        pacienteId,
        turnoId,
        prestacionId,
        concepto,
        importeTotal,
        fechaCargo,
        observaciones,
      ] = params;
      const now = '2026-01-15T12:00:00.000Z';
      const cargo = {
        id: nextCargoId,
        paciente_id: pacienteId,
        turno_id: turnoId,
        prestacion_id: prestacionId,
        concepto,
        importe_total: importeTotal,
        fecha_cargo: fechaCargo,
        observaciones,
        created_at: now,
        updated_at: now,
      };
      nextCargoId += 1;
      store.cargos.push(cargo);
      return result([cargo]);
    }

    if (
      lower.startsWith('select id, paciente_id, turno_id, prestacion_id, concepto, importe_total')
      && lower.includes('from cargos')
      && lower.includes('where id = $1')
    ) {
      const cargo = findById(store.cargos, params[0]);
      return result(cargo ? [cargo] : []);
    }

    if (
      lower.startsWith('select coalesce(sum(importe), 0)::numeric(12,2) as total_abonado')
      && lower.includes('from pagos')
      && lower.includes("estado = 'activo'")
    ) {
      if (failAfterPaymentInsert && paymentInsertedInTransaction) {
        failAfterPaymentInsert = false;
        const error = new Error('Fallo simulado posterior al INSERT');
        error.code = 'FALLO_SIMULADO';
        throw error;
      }
      return result([{ total_abonado: totalAbonado(store, params[0]) }]);
    }

    if (lower.startsWith('insert into pagos (')) {
      if (!transaction) throw new Error('INSERT de pago sin transaccion');
      const [cargoId, importe, metodoPago, fechaPago, observaciones] = params;
      const now = '2026-01-15T12:05:00.000Z';
      const pago = {
        id: nextPagoId,
        cargo_id: cargoId,
        importe,
        metodo_pago: metodoPago,
        fecha_pago: fechaPago,
        observaciones,
        estado: 'activo',
        fecha_anulacion: null,
        motivo_anulacion: null,
        anulado_por_usuario_id: null,
        created_at: now,
        updated_at: now,
      };
      nextPagoId += 1;
      store.pagos.push(pago);
      paymentInsertedInTransaction = true;
      return result([pago]);
    }

    if (lower === 'select id, cargo_id from pagos where id = $1') {
      const pago = findById(store.pagos, params[0]);
      return result(pago ? [{ id: pago.id, cargo_id: pago.cargo_id }] : []);
    }

    if (
      lower.startsWith('select id, cargo_id, importe, metodo_pago')
      && lower.includes('from pagos')
      && lower.includes('where id = $1 and cargo_id = $2')
      && lower.endsWith('for update')
    ) {
      const pago = store.pagos.find((item) => (
        Number(item.id) === Number(params[0])
        && Number(item.cargo_id) === Number(params[1])
      ));
      return result(pago ? [pago] : []);
    }

    if (lower.startsWith("update pagos set estado = 'anulado'")) {
      if (!transaction) throw new Error('UPDATE de pago sin transaccion');
      const [motivo, usuarioId, pagoId] = params;
      const pago = findById(store.pagos, pagoId);
      if (!pago || pago.estado !== 'activo') return result();
      pago.estado = 'anulado';
      pago.fecha_anulacion = '2026-01-15T12:10:00.000Z';
      pago.motivo_anulacion = motivo;
      pago.anulado_por_usuario_id = usuarioId;
      pago.updated_at = pago.fecha_anulacion;
      return result([pago]);
    }

    if (
      lower.startsWith('select id, cargo_id, importe, metodo_pago')
      && lower.includes('from pagos')
      && lower.includes('where cargo_id = $1')
      && lower.includes('order by fecha_pago desc, id desc')
    ) {
      const pagos = store.pagos
        .filter((pago) => Number(pago.cargo_id) === Number(params[0]))
        .sort((a, b) => (
          String(b.fecha_pago).localeCompare(String(a.fecha_pago)) || Number(b.id) - Number(a.id)
        ));
      return result(pagos);
    }

    if (
      lower.includes('p.id as pago_id')
      && lower.includes('join cargos c on c.id = p.cargo_id')
      && lower.includes('join pacientes pa on pa.id = c.paciente_id')
      && lower.includes('from configuracion_consultorio')
    ) {
      const pago = findById(store.pagos, params[0]);
      if (!pago) return result();
      const cargo = findById(store.cargos, pago.cargo_id);
      const paciente = cargo ? findById(store.pacientes, cargo.paciente_id) : null;
      if (!cargo || !paciente) return result();
      return result([{
        pago_id: pago.id,
        pago_importe: pago.importe,
        metodo_pago: pago.metodo_pago,
        fecha_pago: pago.fecha_pago,
        pago_observaciones: pago.observaciones,
        pago_estado: pago.estado,
        fecha_anulacion: pago.fecha_anulacion,
        motivo_anulacion: pago.motivo_anulacion,
        cargo_id: cargo.id,
        concepto: cargo.concepto,
        importe_total: cargo.importe_total,
        fecha_cargo: cargo.fecha_cargo,
        cargo_observaciones: cargo.observaciones,
        paciente_id: paciente.id,
        paciente_nombre: paciente.nombre,
        paciente_apellido: paciente.apellido,
        paciente_dni: paciente.dni,
        nombre_consultorio: store.configuracion?.nombre_consultorio,
        consultorio_telefono: store.configuracion?.whatsapp_numero,
        consultorio_timezone: store.configuracion?.timezone,
        total_abonado: totalAbonado(store, cargo.id),
        generado_en: '2026-01-15T12:30:00.000Z',
      }]);
    }

    if (lower === 'select count(*)::integer as cantidad from pagos where cargo_id = $1') {
      const cantidad = store.pagos.filter(
        (pago) => Number(pago.cargo_id) === Number(params[0]),
      ).length;
      return result([{ cantidad }]);
    }

    throw new Error(`Consulta SQL no contemplada por la prueba: ${text}`);
  }

  const client = {
    query(sql, params) {
      return dispatch('client', sql, params);
    },
    release() {
      log.push({ scope: 'client', text: 'RELEASE', params: [] });
    },
  };

  function reset(options = {}) {
    live = clone({
      pacientes: options.pacientes || defaults.pacientes,
      turnos: options.turnos || defaults.turnos,
      prestaciones: options.prestaciones || defaults.prestaciones,
      cargos: options.cargos || defaults.cargos,
      pagos: options.pagos || defaults.pagos,
      configuracion: options.configuracion || defaults.configuracion,
    });
    transaction = null;
    log = [];
    nextCargoId = Math.max(0, ...live.cargos.map((cargo) => Number(cargo.id))) + 1;
    nextPagoId = Math.max(0, ...live.pagos.map((pago) => Number(pago.id))) + 1;
    failAfterPaymentInsert = Boolean(options.failAfterPaymentInsert);
    paymentInsertedInTransaction = false;
  }

  reset();

  return {
    pool: {
      async connect() {
        return client;
      },
      query(sql, params) {
        return dispatch('pool', sql, params);
      },
    },
    reset,
    snapshot() {
      return clone(live);
    },
    queryLog() {
      return clone(log);
    },
    updatePrestacion(id, changes) {
      const prestacion = findById(live.prestaciones, id);
      if (!prestacion) throw new Error('Prestacion inexistente en el fake');
      Object.assign(prestacion, clone(changes));
    },
  };
}

const fakeDb = crearBaseFalsa();
const dbModulePath = require.resolve('../src/config/db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { pool: fakeDb.pool },
};

const cargosService = require('../src/services/cargosService');
const pagosService = require('../src/services/pagosService');

const FECHA = '2026-01-15';

function cargoBase(changes = {}) {
  return {
    id: 1,
    paciente_id: 1,
    turno_id: 10,
    prestacion_id: 100,
    concepto: 'Limpieza dental',
    importe_total: '100.00',
    fecha_cargo: FECHA,
    observaciones: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
    ...changes,
  };
}

function pagoBase(changes = {}) {
  return {
    id: 1,
    cargo_id: 1,
    importe: '40.00',
    metodo_pago: 'efectivo',
    fecha_pago: FECHA,
    observaciones: null,
    estado: 'activo',
    fecha_anulacion: null,
    motivo_anulacion: null,
    anulado_por_usuario_id: null,
    created_at: '2026-01-15T11:00:00.000Z',
    updated_at: '2026-01-15T11:00:00.000Z',
    ...changes,
  };
}

function prepararCargoConPagos(pagos = []) {
  fakeDb.reset({ cargos: [cargoBase()], pagos });
}

function assertErrorCode(expectedCode) {
  return (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  };
}

function assertSubsequence(values, expected) {
  let cursor = 0;
  for (const value of values) {
    if (value === expected[cursor]) cursor += 1;
    if (cursor === expected.length) return;
  }
  assert.fail(`No se encontro la secuencia ${expected.join(' -> ')} en ${values.join(' -> ')}`);
}

function clasificarPaso(text) {
  const lower = text.toLowerCase();
  if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return text;
  if (lower.includes('from cargos') && lower.endsWith('for update')) return 'FOR UPDATE';
  if (lower.includes('sum(importe)') && lower.includes("estado = 'activo'")) return 'SUM';
  if (lower.startsWith('insert into pagos')) return 'INSERT';
  return null;
}

const tests = [];

function test(nombre, fn) {
  tests.push({ nombre, fn });
}

test('1. crea un cargo normal y calcula su estado inicial', async () => {
  fakeDb.reset();
  const cargo = await cargosService.crearCargo({
    paciente_id: 1,
    turno_id: 10,
    prestacion_id: 100,
    concepto: 'Control posterior',
    importe_total: '100.00',
    fecha_cargo: FECHA,
  });

  assert.equal(cargo.concepto, 'Control posterior');
  assert.equal(cargo.importe_total, '100.00');
  assert.equal(cargo.total_abonado, '0.00');
  assert.equal(cargo.saldo, '100.00');
  assert.equal(cargo.estado_cobro, 'PENDIENTE');
  assert.equal(fakeDb.snapshot().cargos.length, 1);
});

test('2. rechaza un cargo cuyo turno pertenece a otro paciente', async () => {
  fakeDb.reset();

  await assert.rejects(
    () => cargosService.crearCargo({
      paciente_id: 1,
      turno_id: 20,
      prestacion_id: 100,
      importe_total: '100.00',
      fecha_cargo: FECHA,
    }),
    assertErrorCode('TURNO_PACIENTE_INCOMPATIBLE'),
  );

  assert.equal(fakeDb.snapshot().cargos.length, 0);
  assert.ok(fakeDb.queryLog().some((entry) => entry.text === 'ROLLBACK'));
});

test('3. conserva el concepto snapshot aunque cambie la prestacion', async () => {
  fakeDb.reset();
  const creado = await cargosService.crearCargo({
    paciente_id: 1,
    turno_id: 10,
    prestacion_id: 100,
    importe_total: '100.00',
    fecha_cargo: FECHA,
  });
  fakeDb.updatePrestacion(100, { nombre: 'Nombre actualizado', precio_base: '250.00' });

  const recuperado = await cargosService.obtenerCargo(creado.id);
  assert.equal(recuperado.cargo.concepto, 'Limpieza dental');
  assert.equal(recuperado.cargo.importe_total, '100.00');
});

test('4. registra un pago parcial y calcula el saldo', async () => {
  prepararCargoConPagos();
  const respuesta = await pagosService.registrarPago({
    cargo_id: 1,
    importe: '40.00',
    metodo_pago: 'efectivo',
    fecha_pago: FECHA,
  });

  assert.equal(respuesta.pago.estado, 'activo');
  assert.deepEqual(respuesta.resumen_cargo, {
    importe_total: '100.00',
    total_abonado: '40.00',
    saldo: '60.00',
    estado_cobro: 'PARCIAL',
  });
});

test('5. registra un pago total y calcula PAGADO', async () => {
  prepararCargoConPagos();
  const respuesta = await pagosService.registrarPago({
    cargo_id: 1,
    importe: '100.00',
    metodo_pago: 'transferencia',
    fecha_pago: FECHA,
  });

  assert.equal(respuesta.resumen_cargo.total_abonado, '100.00');
  assert.equal(respuesta.resumen_cargo.saldo, '0.00');
  assert.equal(respuesta.resumen_cargo.estado_cobro, 'PAGADO');
});

test('6. rechaza un sobrepago usando el total activo recalculado', async () => {
  prepararCargoConPagos([pagoBase({ importe: '80.00' })]);

  await assert.rejects(
    () => pagosService.registrarPago({
      cargo_id: 1,
      importe: '30.00',
      metodo_pago: 'tarjeta',
      fecha_pago: FECHA,
    }),
    assertErrorCode('SOBREPAGO'),
  );

  assert.equal(fakeDb.snapshot().pagos.length, 1);
  assert.ok(fakeDb.queryLog().some((entry) => entry.text === 'ROLLBACK'));
});

test('7. revierte el INSERT si falla el recalculo posterior', async () => {
  fakeDb.reset({
    cargos: [cargoBase()],
    pagos: [],
    failAfterPaymentInsert: true,
  });

  await assert.rejects(
    () => pagosService.registrarPago({
      cargo_id: 1,
      importe: '40.00',
      metodo_pago: 'efectivo',
      fecha_pago: FECHA,
    }),
    assertErrorCode('FALLO_SIMULADO'),
  );

  const texts = fakeDb.queryLog().map((entry) => entry.text);
  assert.ok(texts.some((text) => text.toLowerCase().startsWith('insert into pagos')));
  assert.ok(texts.includes('ROLLBACK'));
  assert.equal(texts.includes('COMMIT'), false);
  assert.equal(fakeDb.snapshot().pagos.length, 0);
});

test('8. respeta BEGIN, FOR UPDATE, SUM, INSERT y COMMIT', async () => {
  prepararCargoConPagos();
  await pagosService.registrarPago({
    cargo_id: 1,
    importe: '25.00',
    metodo_pago: 'efectivo',
    fecha_pago: FECHA,
  });

  const pasos = fakeDb.queryLog()
    .filter((entry) => entry.scope === 'client')
    .map((entry) => clasificarPaso(entry.text))
    .filter(Boolean);
  assertSubsequence(pasos, ['BEGIN', 'FOR UPDATE', 'SUM', 'INSERT', 'COMMIT']);
  assert.equal(
    fakeDb.queryLog().some((entry) => (
      entry.text.toLowerCase().includes('from cargos')
      && entry.text.toLowerCase().endsWith('for update')
    )),
    true,
  );
});

test('9. un pago anulado deja de computar en el cargo', async () => {
  prepararCargoConPagos([pagoBase()]);
  const respuesta = await pagosService.anularPago(1, {
    motivo: 'Carga administrativa incorrecta',
    usuarioId: 77,
  });

  assert.equal(respuesta.pago.estado, 'anulado');
  assert.equal(respuesta.resumen_cargo.total_abonado, '0.00');
  assert.equal(respuesta.resumen_cargo.saldo, '100.00');
  assert.equal(respuesta.resumen_cargo.estado_cobro, 'PENDIENTE');
});

test('10. rechaza la doble anulacion con conflicto estable', async () => {
  prepararCargoConPagos([pagoBase()]);
  await pagosService.anularPago(1, { motivo: 'Primera anulacion', usuarioId: 77 });

  await assert.rejects(
    () => pagosService.anularPago(1, { motivo: 'Segunda anulacion', usuarioId: 77 }),
    assertErrorCode('PAGO_YA_ANULADO'),
  );

  assert.equal(fakeDb.snapshot().pagos[0].motivo_anulacion, 'Primera anulacion');
  assert.equal(
    fakeDb.queryLog().filter((entry) => entry.text.toLowerCase().startsWith('update pagos')).length,
    1,
  );
});

test('11. la anulacion persiste el usuario recibido del contexto autenticado', async () => {
  prepararCargoConPagos([pagoBase()]);
  await pagosService.anularPago(1, {
    motivo: 'Error de imputacion',
    usuarioId: 77,
    anulado_por_usuario_id: 999,
  });

  const update = fakeDb.queryLog().find(
    (entry) => entry.text.toLowerCase().startsWith('update pagos'),
  );
  assert.equal(update.params[1], 77);
  assert.equal(fakeDb.snapshot().pagos[0].anulado_por_usuario_id, 77);
});

test('12. conserva los pagos anulados en el historial', async () => {
  prepararCargoConPagos([pagoBase()]);
  await pagosService.anularPago(1, { motivo: 'Pago duplicado', usuarioId: 77 });

  const historial = await cargosService.listarPagosDelCargo(1);
  assert.equal(historial.length, 1);
  assert.equal(historial[0].id, 1);
  assert.equal(historial[0].estado, 'anulado');
  assert.equal(historial[0].motivo_anulacion, 'Pago duplicado');
});

test('13. no persiste saldo, total abonado ni estado de cobro', async () => {
  fakeDb.reset();
  const cargo = await cargosService.crearCargo({
    paciente_id: 1,
    turno_id: 10,
    prestacion_id: 100,
    importe_total: '100.00',
    fecha_cargo: FECHA,
  });
  await pagosService.registrarPago({
    cargo_id: cargo.id,
    importe: '20.00',
    metodo_pago: 'efectivo',
    fecha_pago: FECHA,
  });

  const state = fakeDb.snapshot();
  for (const row of [...state.cargos, ...state.pagos]) {
    assert.equal(Object.hasOwn(row, 'saldo'), false);
    assert.equal(Object.hasOwn(row, 'total_abonado'), false);
    assert.equal(Object.hasOwn(row, 'estado_cobro'), false);
  }

  const inserts = fakeDb.queryLog().filter((entry) => /^INSERT INTO (cargos|pagos)/i.test(entry.text));
  assert.equal(inserts.length, 2);
  for (const entry of inserts) {
    assert.doesNotMatch(entry.text, /\b(saldo|total_abonado|estado_cobro)\b/i);
  }
});

test('14. genera la constancia de un pago activo', async () => {
  prepararCargoConPagos([pagoBase()]);
  const constancia = await pagosService.obtenerConstanciaPago(1);

  assert.equal(constancia.titulo, 'Constancia interna de pago — no fiscal');
  assert.equal(constancia.pago.id, 1);
  assert.equal(constancia.pago.estado, 'activo');
  assert.equal(constancia.consultorio.nombre, 'Odonton CBA');
});

test('15. conserva estado y metadatos en la constancia de un pago anulado', async () => {
  prepararCargoConPagos([pagoBase({
    estado: 'anulado',
    fecha_anulacion: '2026-01-15T12:10:00.000Z',
    motivo_anulacion: 'Registro duplicado',
  })]);
  const constancia = await pagosService.obtenerConstanciaPago(1);

  assert.equal(constancia.pago.estado, 'anulado');
  assert.equal(constancia.pago.motivo_anulacion, 'Registro duplicado');
  assert.equal(constancia.pago.fecha_anulacion, '2026-01-15T12:10:00.000Z');
});

test('16. rechaza una constancia para un pago inexistente', async () => {
  prepararCargoConPagos();
  await assert.rejects(
    () => pagosService.obtenerConstanciaPago(999),
    assertErrorCode('PAGO_NO_ENCONTRADO'),
  );
});

test('17. calcula saldo y total abonado solo desde pagos activos', async () => {
  prepararCargoConPagos([
    pagoBase({ id: 1, importe: '25.00' }),
    pagoBase({ id: 2, importe: '40.00', estado: 'anulado', motivo_anulacion: 'Duplicado' }),
  ]);
  const constancia = await pagosService.obtenerConstanciaPago(1);

  assert.equal(constancia.cargo.total_abonado, '25.00');
  assert.equal(constancia.cargo.saldo, '75.00');
  assert.equal(constancia.cargo.estado_cobro, 'PARCIAL');
});

test('18. obtiene el paciente a traves del cargo del pago', async () => {
  prepararCargoConPagos([pagoBase()]);
  const constancia = await pagosService.obtenerConstanciaPago(1);

  assert.deepEqual(constancia.paciente, {
    id: 1,
    nombre: 'Rita',
    apellido: 'Quinteros',
    dni: '10173234',
  });
});

test('19. utiliza el concepto historico guardado en el cargo', async () => {
  prepararCargoConPagos([pagoBase()]);
  fakeDb.updatePrestacion(100, { nombre: 'Nombre nuevo' });
  const constancia = await pagosService.obtenerConstanciaPago(1);

  assert.equal(constancia.cargo.concepto, 'Limpieza dental');
});

test('20. expone el estado anulado para que la vista no presente un pago vigente', async () => {
  prepararCargoConPagos([pagoBase({ estado: 'anulado', motivo_anulacion: 'Error de carga' })]);
  const constancia = await pagosService.obtenerConstanciaPago(1);

  assert.equal(constancia.pago.estado, 'anulado');
  assert.notEqual(constancia.pago.estado, 'activo');
});

async function run() {
  for (const { nombre, fn } of tests) {
    await fn();
    console.log(`OK: ${nombre}`);
  }
  console.log(`OK: servicios de Cargos/Pagos (${tests.length} escenarios, sin PostgreSQL ni WhatsApp)`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
