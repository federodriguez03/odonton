const { pool } = require('../config/db');
const FDI_REGEX = /^(?:[1-4][1-8]|[5-8][1-5])$/;

function validarDiente(diente) {
  const n = Number.parseInt(diente, 10);
  if (!Number.isInteger(n) || !FDI_REGEX.test(String(n))) throw new Error('Diente FDI invalido');
  return n;
}

async function crearTabla() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tratamientos (
      id SERIAL PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
      diente SMALLINT NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      observaciones TEXT,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tratamientos_paciente_fecha ON tratamientos(paciente_id, fecha DESC);
  `);
}

async function listar({ pacienteId, diente, desde, hasta }) {
  await crearTabla();
  const where = ['1=1'];
  const vals = [];
  let i = 1;
  if (pacienteId) { where.push(`paciente_id = $${i++}`); vals.push(pacienteId); }
  if (diente) { where.push(`diente = $${i++}`); vals.push(validarDiente(diente)); }
  if (desde) { where.push(`fecha >= $${i++}`); vals.push(desde); }
  if (hasta) { where.push(`fecha <= $${i++}`); vals.push(hasta); }
  const sql = `SELECT * FROM tratamientos WHERE ${where.join(' AND ')} ORDER BY fecha DESC`;
  const { rows } = await pool.query(sql, vals);
  return rows;
}

async function crear({ paciente_id, diente, tipo, observaciones, fecha }, actor) {
  await crearTabla();
  if (!paciente_id) throw new Error('paciente_id requerido');
  if (!tipo) throw new Error('tipo requerido');
  const d = validarDiente(diente);
  const { rows } = await pool.query(
    `INSERT INTO tratamientos (paciente_id,diente,tipo,observaciones,fecha,registrado_por_usuario_id,profesional_perfil_id)
     VALUES ($1,$2,$3,$4,COALESCE($5,NOW()),$6,$7) RETURNING *`,
    [paciente_id, d, tipo, observaciones || null, fecha || null, actor.usuario_id, actor.profesional_perfil_id]
  );
  return rows[0];
}

module.exports = { listar, crear };
