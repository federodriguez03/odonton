const { pool } = require('../config/db');

function validarNombre(nombre) {
  const value = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('El nombre es obligatorio');
  if (value.length > 120) throw new Error('El nombre es demasiado largo');
  return value;
}

function validarColor(color) {
  const value = String(color || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('El color debe tener formato hexadecimal');
  return value.toLowerCase();
}

function codigoBase(nombre) {
  const slug = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `ref_${slug || 'odontograma'}`.slice(0, 70);
}

async function listar({ incluirInactivas = false, pacienteId = null } = {}) {
  const valores = [];
  let where = incluirInactivas ? 'TRUE' : 'r.activo = TRUE';
  let utilizada = 'FALSE';
  if (pacienteId) {
    valores.push(Number(pacienteId));
    utilizada = `EXISTS (SELECT 1 FROM odontograma o WHERE o.paciente_id = $1 AND o.estado = r.codigo)`;
    if (!incluirInactivas) where = `(r.activo = TRUE OR ${utilizada})`;
  }
  const { rows } = await pool.query(
    `SELECT r.id, r.codigo, r.nombre, r.color, r.alcance, r.activo, ${utilizada} AS utilizada
     FROM odontograma_referencias r
     WHERE ${where}
     ORDER BY r.activo DESC, r.nombre ASC`,
    valores,
  );
  return rows;
}

async function crear({ nombre, color }) {
  const nombreFinal = validarNombre(nombre);
  const colorFinal = validarColor(color);
  const base = codigoBase(nombreFinal);
  for (let intento = 0; intento < 20; intento += 1) {
    const codigo = intento === 0 ? base : `${base}_${intento + 1}`;
    try {
      const { rows } = await pool.query(
        `INSERT INTO odontograma_referencias (codigo, nombre, color, alcance, activo)
         VALUES ($1, $2, $3, 'cara', TRUE)
         RETURNING id, codigo, nombre, color, alcance, activo`,
        [codigo, nombreFinal, colorFinal],
      );
      return rows[0];
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'uq_odontograma_referencias_nombre') throw new Error('Ya existe una referencia con ese nombre');
      if (error.code !== '23505') throw error;
    }
  }
  throw new Error('No se pudo generar un codigo unico para la referencia');
}

async function actualizar(id, { nombre, color, activo }) {
  const refId = Number(id);
  if (!Number.isInteger(refId) || refId <= 0) throw new Error('Referencia invalida');
  try {
    const { rows } = await pool.query(
      `UPDATE odontograma_referencias
       SET nombre = $2, color = $3, activo = $4, updated_at = NOW()
       WHERE id = $1
       RETURNING id, codigo, nombre, color, alcance, activo`,
      [refId, validarNombre(nombre), validarColor(color), Boolean(activo)],
    );
    if (!rows.length) throw new Error('Referencia no encontrada');
    return rows[0];
  } catch (error) {
    if (error.code === '23505') throw new Error('Ya existe una referencia con ese nombre');
    throw error;
  }
}

async function validarParaGuardar({ codigo, pacienteId, diente, cara }) {
  const { rows } = await pool.query('SELECT codigo, nombre, color, alcance, activo FROM odontograma_referencias WHERE codigo = $1', [codigo]);
  if (!rows.length) throw new Error('Referencia de odontograma inexistente');
  const referencia = rows[0];
  if (referencia.activo) return referencia;
  const existente = await pool.query(
    'SELECT 1 FROM odontograma WHERE paciente_id = $1 AND diente = $2 AND cara = $3 AND estado = $4',
    [pacienteId, diente, cara, codigo],
  );
  if (!existente.rowCount) throw new Error('La referencia esta inactiva y no puede aplicarse a una cara nueva');
  return referencia;
}

module.exports = { listar, crear, actualizar, validarParaGuardar };
