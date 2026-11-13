const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const TARGET_DATABASE = 'odonton_demo_2026';
if (process.env.DB_NAME !== TARGET_DATABASE) {
  throw new Error(`Prueba rechazada: DB_NAME debe ser ${TARGET_DATABASE}.`);
}

const { pool } = require('../src/config/db');
const { registrarAtencion } = require('../src/services/pacientesService');

const turnosTemporales = [];

async function crearTurno({ estado, hora }) {
  const base = await pool.query(`
    SELECT pa.id AS paciente_id, pr.id AS prestacion_id, pf.id AS profesional_perfil_id
    FROM pacientes pa
    CROSS JOIN LATERAL (SELECT id FROM prestaciones WHERE COALESCE(activo, true) = true ORDER BY id LIMIT 1) pr
    CROSS JOIN LATERAL (SELECT id FROM profesionales WHERE activo = true AND vinculo_confirmado_at IS NOT NULL ORDER BY id LIMIT 1) pf
    ORDER BY pa.id LIMIT 1
  `);
  assert.equal(base.rowCount, 1, 'La demo debe tener paciente, prestación y profesional habilitado');
  const fixture = base.rows[0];
  const inicio = `2026-11-12T${hora}:00-03:00`;
  const result = await pool.query(`
    INSERT INTO turnos
      (paciente_id, prestacion_id, profesional_perfil_id, fecha_hora_inicio, fecha_hora_fin,
       estado, origen, recordatorio_habilitado, created_at, updated_at)
    VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz + interval '30 minutes',
            $5, 'prueba_estado_atencion', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, paciente_id
  `, [fixture.paciente_id, fixture.prestacion_id, fixture.profesional_perfil_id, inicio, estado]);
  turnosTemporales.push(result.rows[0].id);
  return result.rows[0];
}

async function limpiar() {
  if (!turnosTemporales.length) return;
  await pool.query('DELETE FROM historias_clinicas WHERE turno_id = ANY($1::int[])', [turnosTemporales]);
  await pool.query('DELETE FROM turno_prestaciones WHERE turno_id = ANY($1::int[])', [turnosTemporales]);
  await pool.query('DELETE FROM turnos WHERE id = ANY($1::int[])', [turnosTemporales]);
}

(async () => {
  const database = await pool.query('SELECT current_database() AS nombre');
  assert.equal(database.rows[0].nombre, TARGET_DATABASE);

  try {
    const confirmado = await crearTurno({ estado: 'confirmado', hora: '03:00' });
    await registrarAtencion({ pacienteId: confirmado.paciente_id, turnoId: confirmado.id, observaciones: 'Fixture temporal de prueba' });
    const guardado = await pool.query(`
      SELECT t.estado, COUNT(hc.id)::int AS atenciones
      FROM turnos t LEFT JOIN historias_clinicas hc ON hc.turno_id = t.id
      WHERE t.id = $1 GROUP BY t.estado
    `, [confirmado.id]);
    assert.equal(guardado.rows[0].estado, 'realizado');
    assert.equal(guardado.rows[0].atenciones, 1);

    const cancelado = await crearTurno({ estado: 'cancelado', hora: '04:00' });
    await assert.rejects(
      registrarAtencion({ pacienteId: cancelado.paciente_id, turnoId: cancelado.id, observaciones: 'No debe guardarse' }),
      /Solo se puede registrar una atención/,
    );
    const rechazado = await pool.query(`
      SELECT t.estado, COUNT(hc.id)::int AS atenciones
      FROM turnos t LEFT JOIN historias_clinicas hc ON hc.turno_id = t.id
      WHERE t.id = $1 GROUP BY t.estado
    `, [cancelado.id]);
    assert.equal(rechazado.rows[0].estado, 'cancelado');
    assert.equal(rechazado.rows[0].atenciones, 0);

    console.log('OK: atención y estado de turno verificados en odonton_demo_2026');
  } finally {
    await limpiar();
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
