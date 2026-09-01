/**
 * Prueba de integración real de Cargos/Pagos.
 *
 * Requiere PostgreSQL y el backend Odonton activos. Crea datos temporales,
 * siempre intenta eliminarlos por sus IDs exactos y no ejecuta migraciones.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
  quiet: true,
});

const { pool } = require('../src/config/db');
const { generarToken } = require('../src/utils/jwt');

const API_BASE = process.env.ODONTON_INTEGRATION_API || 'http://127.0.0.1:3000';
const MARCA = `PRUEBA TECNICA 4C.4 - NO REAL - ${randomUUID()}`;
const cargoIds = [];

async function request(ruta, token, { method = 'GET', body } = {}) {
  const response = await fetch(`${API_BASE}${ruta}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`Respuesta no JSON en ${method} ${ruta}: HTTP ${response.status}`);
    }
  }

  return { status: response.status, data };
}

function registrarCargoSiFueCreado(response) {
  const id = Number(response?.data?.cargo?.id);
  if (response?.status === 201 && Number.isSafeInteger(id) && id > 0) {
    cargoIds.push(id);
  }
}

async function obtenerConteos() {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM cargos) AS cargos,
      (SELECT COUNT(*)::INTEGER FROM pagos) AS pagos
  `);
  return {
    cargos: Number(rows[0].cargos),
    pagos: Number(rows[0].pagos),
  };
}

async function teardown() {
  const ids = [...new Set(cargoIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (!ids.length) return { pagosEliminados: 0, cargosEliminados: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pagos = await client.query(
      'DELETE FROM pagos WHERE cargo_id = ANY($1::INTEGER[])',
      [ids],
    );
    const cargos = await client.query(
      'DELETE FROM cargos WHERE id = ANY($1::INTEGER[])',
      [ids],
    );
    await client.query('COMMIT');
    return {
      pagosEliminados: pagos.rowCount,
      cargosEliminados: cargos.rowCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  const resultado = {
    marca: MARCA,
    cargoPendiente: false,
    pagoParcial: false,
    pagoTotal: false,
    sobrepago: false,
    historial: false,
    anulacion: false,
    dobleAnulacion: false,
    concurrencia: false,
    pacienteTurno: 'NO EJECUTADO',
    rollback: false,
    ids: { cargos: [], pagos: [] },
  };

  const conteoInicial = await obtenerConteos();
  resultado.conteoInicial = conteoInicial;
  assert.deepEqual(conteoInicial, { cargos: 0, pagos: 0 }, 'La prueba exige cargos=0 y pagos=0');

  const health = await fetch(`${API_BASE}/health`);
  assert.equal(health.status, 200, 'El backend no responde correctamente en /health');

  const referencias = await pool.query(`
    SELECT
      (SELECT id FROM pacientes ORDER BY id LIMIT 1) AS paciente_id,
      (SELECT id FROM usuarios WHERE activo IS TRUE ORDER BY id LIMIT 1) AS usuario_id
  `);
  const pacienteId = Number(referencias.rows[0].paciente_id);
  const usuarioId = Number(referencias.rows[0].usuario_id);
  assert.ok(Number.isSafeInteger(pacienteId) && pacienteId > 0, 'No hay paciente de referencia');
  assert.ok(Number.isSafeInteger(usuarioId) && usuarioId > 0, 'No hay usuario activo para autenticar');

  const token = generarToken({ userId: usuarioId, rol: 'odontologo' });

  let teardownResultado = null;
  try {
    const cargoResponse = await request('/api/cargos', token, {
      method: 'POST',
      body: {
        paciente_id: pacienteId,
        concepto: `${MARCA} - PRINCIPAL`,
        importe_total: '30000.00',
      },
    });
    registrarCargoSiFueCreado(cargoResponse);
    assert.equal(cargoResponse.status, 201);
    const cargoId = Number(cargoResponse.data.cargo.id);
    resultado.ids.cargos.push(cargoId);
    assert.equal(cargoResponse.data.cargo.total_abonado, '0.00');
    assert.equal(cargoResponse.data.cargo.saldo, '30000.00');
    assert.equal(cargoResponse.data.cargo.estado_cobro, 'PENDIENTE');
    resultado.cargoPendiente = true;

    const detalleInicial = await request(`/api/cargos/${cargoId}`, token);
    assert.equal(detalleInicial.status, 200);
    assert.equal(detalleInicial.data.cargo.importe_total, '30000.00');
    assert.equal(detalleInicial.data.cargo.total_abonado, '0.00');
    assert.equal(detalleInicial.data.cargo.saldo, '30000.00');
    assert.equal(detalleInicial.data.cargo.estado_cobro, 'PENDIENTE');
    assert.deepEqual(detalleInicial.data.pagos, []);

    const pagoParcial = await request('/api/pagos', token, {
      method: 'POST',
      body: {
        cargo_id: cargoId,
        importe: '10000.00',
        metodo_pago: 'transferencia',
        observaciones: MARCA,
      },
    });
    assert.equal(pagoParcial.status, 201);
    const pagoParcialId = Number(pagoParcial.data.pago.id);
    resultado.ids.pagos.push(pagoParcialId);
    assert.equal(pagoParcial.data.resumen_cargo.total_abonado, '10000.00');
    assert.equal(pagoParcial.data.resumen_cargo.saldo, '20000.00');
    assert.equal(pagoParcial.data.resumen_cargo.estado_cobro, 'PARCIAL');
    resultado.pagoParcial = true;

    const pagoTotal = await request('/api/pagos', token, {
      method: 'POST',
      body: {
        cargo_id: cargoId,
        importe: '20000.00',
        metodo_pago: 'efectivo',
        observaciones: MARCA,
      },
    });
    assert.equal(pagoTotal.status, 201);
    const pagoTotalId = Number(pagoTotal.data.pago.id);
    resultado.ids.pagos.push(pagoTotalId);
    assert.equal(pagoTotal.data.resumen_cargo.total_abonado, '30000.00');
    assert.equal(pagoTotal.data.resumen_cargo.saldo, '0.00');
    assert.equal(pagoTotal.data.resumen_cargo.estado_cobro, 'PAGADO');
    resultado.pagoTotal = true;

    const pagosAntesSobrepago = await pool.query(
      'SELECT COUNT(*)::INTEGER AS cantidad FROM pagos WHERE cargo_id = $1',
      [cargoId],
    );
    const sobrepago = await request('/api/pagos', token, {
      method: 'POST',
      body: {
        cargo_id: cargoId,
        importe: '1.00',
        metodo_pago: 'efectivo',
      },
    });
    assert.equal(sobrepago.status, 409);
    assert.equal(sobrepago.data.codigo, 'SOBREPAGO');
    const pagosDespuesSobrepago = await pool.query(
      'SELECT COUNT(*)::INTEGER AS cantidad FROM pagos WHERE cargo_id = $1',
      [cargoId],
    );
    assert.equal(pagosDespuesSobrepago.rows[0].cantidad, pagosAntesSobrepago.rows[0].cantidad);
    resultado.sobrepago = true;

    const historialActivo = await request(`/api/pagos?cargo_id=${cargoId}`, token);
    assert.equal(historialActivo.status, 200);
    assert.equal(historialActivo.data.pagos.length, 2);
    assert.ok(historialActivo.data.pagos.every((pago) => pago.estado === 'activo'));
    assert.deepEqual(
      new Set(historialActivo.data.pagos.map((pago) => Number(pago.id))),
      new Set([pagoParcialId, pagoTotalId]),
    );
    resultado.historial = true;

    const anulacion = await request(`/api/pagos/${pagoTotalId}/anular`, token, {
      method: 'POST',
      body: { motivo: 'Prueba técnica de anulación 4C.4' },
    });
    assert.equal(anulacion.status, 200);
    assert.equal(anulacion.data.pago.estado, 'anulado');
    assert.equal(anulacion.data.resumen_cargo.total_abonado, '10000.00');
    assert.equal(anulacion.data.resumen_cargo.saldo, '20000.00');
    assert.equal(anulacion.data.resumen_cargo.estado_cobro, 'PARCIAL');
    resultado.anulacion = true;

    const dobleAnulacion = await request(`/api/pagos/${pagoTotalId}/anular`, token, {
      method: 'POST',
      body: { motivo: 'Segundo intento técnico 4C.4' },
    });
    assert.equal(dobleAnulacion.status, 409);
    assert.equal(dobleAnulacion.data.codigo, 'PAGO_YA_ANULADO');
    resultado.dobleAnulacion = true;

    const detalleAnulado = await request(`/api/cargos/${cargoId}`, token);
    assert.equal(detalleAnulado.status, 200);
    assert.equal(detalleAnulado.data.pagos.length, 2);
    const activo = detalleAnulado.data.pagos.find((pago) => Number(pago.id) === pagoParcialId);
    const anulado = detalleAnulado.data.pagos.find((pago) => Number(pago.id) === pagoTotalId);
    assert.equal(activo.estado, 'activo');
    assert.equal(anulado.estado, 'anulado');
    assert.equal(detalleAnulado.data.cargo.total_abonado, '10000.00');
    assert.equal(detalleAnulado.data.cargo.saldo, '20000.00');
    assert.equal(detalleAnulado.data.cargo.estado_cobro, 'PARCIAL');

    const cargoConcurrenciaResponse = await request('/api/cargos', token, {
      method: 'POST',
      body: {
        paciente_id: pacienteId,
        concepto: `${MARCA} - CONCURRENCIA`,
        importe_total: '10000.00',
      },
    });
    registrarCargoSiFueCreado(cargoConcurrenciaResponse);
    assert.equal(cargoConcurrenciaResponse.status, 201);
    const cargoConcurrenciaId = Number(cargoConcurrenciaResponse.data.cargo.id);
    resultado.ids.cargos.push(cargoConcurrenciaId);

    const payloadConcurrente = {
      cargo_id: cargoConcurrenciaId,
      importe: '10000.00',
      metodo_pago: 'transferencia',
      observaciones: MARCA,
    };
    const respuestasConcurrentes = await Promise.all([
      request('/api/pagos', token, { method: 'POST', body: payloadConcurrente }),
      request('/api/pagos', token, { method: 'POST', body: payloadConcurrente }),
    ]);
    const estadosConcurrentes = respuestasConcurrentes.map((item) => item.status).sort();
    assert.deepEqual(estadosConcurrentes, [201, 409]);
    const aceptado = respuestasConcurrentes.find((item) => item.status === 201);
    const rechazado = respuestasConcurrentes.find((item) => item.status === 409);
    assert.equal(rechazado.data.codigo, 'SOBREPAGO');
    resultado.ids.pagos.push(Number(aceptado.data.pago.id));

    const resumenConcurrente = await pool.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE estado = 'activo')::INTEGER AS pagos_activos,
          COALESCE(SUM(importe) FILTER (WHERE estado = 'activo'), 0)::NUMERIC(12,2) AS total
        FROM pagos
        WHERE cargo_id = $1
      `,
      [cargoConcurrenciaId],
    );
    assert.equal(resumenConcurrente.rows[0].pagos_activos, 1);
    assert.equal(resumenConcurrente.rows[0].total, '10000.00');
    const detalleConcurrente = await request(`/api/cargos/${cargoConcurrenciaId}`, token);
    assert.equal(detalleConcurrente.data.cargo.saldo, '0.00');
    assert.equal(detalleConcurrente.data.cargo.estado_cobro, 'PAGADO');
    resultado.concurrencia = true;

    const relacion = await pool.query(`
      SELECT p.id AS paciente_id, t.id AS turno_id
      FROM turnos t
      JOIN LATERAL (
        SELECT id
        FROM pacientes
        WHERE id <> t.paciente_id
        ORDER BY id
        LIMIT 1
      ) p ON TRUE
      ORDER BY t.id
      LIMIT 1
    `);
    if (relacion.rows.length) {
      const relacionResponse = await request('/api/cargos', token, {
        method: 'POST',
        body: {
          paciente_id: Number(relacion.rows[0].paciente_id),
          turno_id: Number(relacion.rows[0].turno_id),
          concepto: `${MARCA} - RELACION INVALIDA`,
          importe_total: '100.00',
        },
      });
      registrarCargoSiFueCreado(relacionResponse);
      assert.equal(relacionResponse.status, 409);
      assert.equal(relacionResponse.data.codigo, 'TURNO_PACIENTE_INCOMPATIBLE');
      resultado.pacienteTurno = '409 TURNO_PACIENTE_INCOMPATIBLE';
    } else {
      resultado.pacienteTurno = 'SIN DATOS ADECUADOS';
    }

    const conteoAntesRollback = await obtenerConteos();
    const idInexistenteRes = await pool.query(`
      SELECT candidate
      FROM (VALUES (2147483647), (2147483646), (2147483645)) AS candidatos(candidate)
      WHERE NOT EXISTS (SELECT 1 FROM pacientes WHERE id = candidate)
      LIMIT 1
    `);
    assert.equal(idInexistenteRes.rows.length, 1, 'No se encontró un ID técnico inexistente seguro');
    const rollbackResponse = await request('/api/cargos', token, {
      method: 'POST',
      body: {
        paciente_id: Number(idInexistenteRes.rows[0].candidate),
        concepto: `${MARCA} - ROLLBACK`,
        importe_total: '100.00',
      },
    });
    registrarCargoSiFueCreado(rollbackResponse);
    assert.equal(rollbackResponse.status, 404);
    assert.equal(rollbackResponse.data.codigo, 'PACIENTE_NO_ENCONTRADO');
    assert.deepEqual(await obtenerConteos(), conteoAntesRollback);
    resultado.rollback = true;
  } finally {
    teardownResultado = await teardown();
  }

  const conteoFinal = await obtenerConteos();
  resultado.conteoFinal = conteoFinal;
  resultado.teardown = teardownResultado;
  assert.deepEqual(conteoFinal, conteoInicial, 'El teardown no restauró los conteos iniciales');

  console.log(`RESULTADO_4C4=${JSON.stringify(resultado)}`);
}

run()
  .catch((error) => {
    console.error(`ERROR_4C4=${error.code || error.name}: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
