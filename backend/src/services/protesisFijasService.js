const { pool } = require('../config/db');
const FDI_REGEX = /^(?:[1-4][1-8]|[5-8][1-5])$/;

async function crearTabla() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS protesis_fijas (
      id SERIAL PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
      tipo VARCHAR(50) NOT NULL,
      dientes SMALLINT[] NOT NULL,
      descripcion TEXT,
      fecha TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function validarDientes(dientes) {
  if (!Array.isArray(dientes) || dientes.length === 0) throw new Error('dientes requerido (array)');
  return dientes.map((d) => {
    const n = Number.parseInt(d, 10);
    if (!Number.isInteger(n) || !FDI_REGEX.test(String(n))) throw new Error('Diente FDI invalido');
    return n;
  });
}

async function crear({ paciente_id, tipo, dientes, descripcion, fecha }, actor) {
  await crearTabla();
  if (!paciente_id) throw new Error('paciente_id requerido');
  if (!tipo) throw new Error('tipo requerido');
  const list = validarDientes(dientes);
  const { rows } = await pool.query(
    `INSERT INTO protesis_fijas (paciente_id,tipo,dientes,descripcion,fecha,registrado_por_usuario_id,profesional_perfil_id)
     VALUES ($1,$2,$3,$4,COALESCE($5,NOW()),$6,$7) RETURNING *`,
    [paciente_id, tipo, list, descripcion || null, fecha || null, actor.usuario_id, actor.profesional_perfil_id]
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
