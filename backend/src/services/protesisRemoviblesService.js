const { pool } = require('../config/db');

async function crearTabla() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS protesis_removibles (
      id SERIAL PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
      tipo VARCHAR(50) NOT NULL,
      arcada VARCHAR(20) NOT NULL,
      descripcion TEXT,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function crear({ paciente_id, tipo, arcada, descripcion, fecha }, actor) {
  await crearTabla();
  if (!paciente_id) throw new Error('paciente_id requerido');
  if (!tipo) throw new Error('tipo requerido');
  if (!arcada || !['superior', 'inferior'].includes(String(arcada))) throw new Error('arcada invalida');
  const { rows } = await pool.query(
    `INSERT INTO protesis_removibles (paciente_id,tipo,arcada,descripcion,fecha,registrado_por_usuario_id,profesional_perfil_id)
     VALUES ($1,$2,$3,$4,COALESCE($5,NOW()),$6,$7) RETURNING *`,
    [paciente_id, tipo, arcada, descripcion || null, fecha || null, actor.usuario_id, actor.profesional_perfil_id]
  );
  return rows[0];
}

module.exports = { crear };
async function listar({ pacienteId }) {
  await crearTabla();
  const where = [];
  const vals = [];
  if (pacienteId) {
    where.push('paciente_id = $1');
    vals.push(pacienteId);
  }
  const sql = `SELECT * FROM protesis_removibles ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY fecha DESC`;
  const { rows } = await pool.query(sql, vals);
  return rows;
}

module.exports.listar = listar;
