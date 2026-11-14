const { pool } = require('../config/db');
const FDI_REGEX = /^(?:[1-4][1-8]|[5-8][1-5])$/;
const { requireSchema } = require('./schemaValidationService');

async function crearTabla() {
  await requireSchema('protesis_fijas', ['protesis_fijas.paciente_id', 'protesis_fijas.tipo', 'protesis_fijas.dientes']);
}

function validarDientes(dientes) {
  if (!Array.isArray(dientes) || dientes.length === 0) throw new Error('dientes requerido (array)');
  return dientes.map((d) => {
    const n = Number.parseInt(d, 10);
    if (!Number.isInteger(n) || !FDI_REGEX.test(String(n))) throw new Error('Diente FDI invalido');
    return n;
  });
}

async function crear({ paciente_id, tipo, dientes, descripcion, fecha }) {
  await crearTabla();
  if (!paciente_id) throw new Error('paciente_id requerido');
  if (!tipo) throw new Error('tipo requerido');
  const list = validarDientes(dientes);
  const { rows } = await pool.query(
    `INSERT INTO protesis_fijas (paciente_id, tipo, dientes, descripcion, fecha)
     VALUES ($1,$2,$3,$4, COALESCE($5, NOW())) RETURNING *`,
    [paciente_id, tipo, list, descripcion || null, fecha || null]
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
  const sql = `SELECT * FROM protesis_fijas ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY fecha DESC`;
  const { rows } = await pool.query(sql, vals);
  return rows;
}

module.exports.listar = listar;
