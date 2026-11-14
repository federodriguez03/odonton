const { pool } = require('../config/db');
const { requireSchema } = require('./schemaValidationService');

async function crearTabla() {
  await requireSchema('protesis_removibles', ['protesis_removibles.paciente_id', 'protesis_removibles.tipo', 'protesis_removibles.arcada']);
}

async function crear({ paciente_id, tipo, arcada, descripcion, fecha }) {
  await crearTabla();
  if (!paciente_id) throw new Error('paciente_id requerido');
  if (!tipo) throw new Error('tipo requerido');
  if (!arcada || !['superior', 'inferior'].includes(String(arcada))) throw new Error('arcada invalida');
  const { rows } = await pool.query(
    `INSERT INTO protesis_removibles (paciente_id, tipo, arcada, descripcion, fecha)
     VALUES ($1,$2,$3,$4, COALESCE($5, NOW())) RETURNING *`,
    [paciente_id, tipo, arcada, descripcion || null, fecha || null]
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
