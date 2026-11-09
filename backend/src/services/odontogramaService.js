const { pool } = require('../config/db');
const CARAS = new Set(['vestibular', 'mesial', 'distal', 'oclusal', 'lingual']);

function esDienteValido(value) {
  return /^(?:[1-4][1-8]|[5-8][1-5])$/.test(String(value));
}
function validarId(value, nombre = 'paciente_id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${nombre} inválido`);
  return id;
}
function normalizarEstado(value) {
  const estado = String(value || '').trim().toLowerCase();
  const heredados = { caries: 'existente', obturacion: 'existente', implante: 'protesis_fija', extraccion: 'ausente' };
  return heredados[estado] || estado;
}
function validarRegistro(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Registro dental inválido');
  const diente = Number(raw.diente);
  const cara = String(raw.cara || '');
  const estado = normalizarEstado(raw.estado);
  if (!esDienteValido(diente)) throw new Error('diente inválido (FDI)');
  if (!CARAS.has(cara)) throw new Error('cara inválida');
  if (!/^[a-z0-9_]{1,50}$/.test(estado)) throw new Error('estado inválido');
  return { diente, cara, estado };
}
function normalizarObservacion(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value).trim() || null;
}
async function guardarMetaDb(db, id, meta = {}, actor = {}) {
  const hs = Object.hasOwn(meta, 'sarro');
  const hp = Object.hasOwn(meta, 'periodontal');
  const ho = Object.hasOwn(meta, 'observaciones');
  if (!hs && !hp && !ho) return;
  await db.query(`INSERT INTO odontograma_meta(paciente_id,sarro,periodontal,observaciones,updated_at,actualizado_por_usuario_id,profesional_perfil_id)
    VALUES($1,$2,$3,$4,NOW(),$8,$9) ON CONFLICT(paciente_id) DO UPDATE SET
    sarro=CASE WHEN $5 THEN EXCLUDED.sarro ELSE odontograma_meta.sarro END,
    periodontal=CASE WHEN $6 THEN EXCLUDED.periodontal ELSE odontograma_meta.periodontal END,
    observaciones=CASE WHEN $7 THEN EXCLUDED.observaciones ELSE odontograma_meta.observaciones END,
    actualizado_por_usuario_id=EXCLUDED.actualizado_por_usuario_id,
    profesional_perfil_id=EXCLUDED.profesional_perfil_id,
    updated_at=NOW()`,
  [id, hs ? Boolean(meta.sarro) : false, hp ? Boolean(meta.periodontal) : false,
    normalizarObservacion(meta.observaciones), hs, hp, ho,
    actor.usuario_id || null, actor.profesional_perfil_id || null]);
}
async function obtenerOdontogramaPorPaciente(pacienteId, db = pool) {
  const id = validarId(pacienteId, 'pacienteId');
  const paciente = await db.query('SELECT id,nombre,apellido,dni FROM pacientes WHERE id=$1', [id]);
  if (!paciente.rowCount) throw new Error('Paciente no encontrado');
  const registros = await db.query('SELECT id,paciente_id,diente,cara,estado,fecha FROM odontograma WHERE paciente_id=$1 ORDER BY diente,cara', [id]);
  const meta = await db.query('SELECT sarro,periodontal,observaciones FROM odontograma_meta WHERE paciente_id=$1', [id]);
  return { paciente: paciente.rows[0], registros: registros.rows,
    meta: meta.rows[0] || { sarro: false, periodontal: false, observaciones: null } };
}
async function guardarOdontogramaCompleto(payload, external = null) {
  const id = validarId(payload.paciente_id);
  if (payload.registros !== undefined && !Array.isArray(payload.registros)) throw new Error('Registros inválidos');
  const registros = (payload.registros || []).map(validarRegistro);
  const claves = new Set();
  for (const registro of registros) {
    const clave = `${registro.diente}-${registro.cara}`;
    if (claves.has(clave)) throw new Error('Cara dental duplicada');
    claves.add(clave);
  }
  const db = external || await pool.connect();
  const own = !external;
  try {
    if (own) await db.query('BEGIN');
    // Serializa las escrituras del mismo paciente, incluida la captura histórica.
    const paciente = await db.query('SELECT 1 FROM pacientes WHERE id=$1 FOR UPDATE', [id]);
    if (!paciente.rowCount) throw new Error('Paciente no encontrado');
    if (registros.length) {
      const existentes = await db.query('SELECT diente,cara,estado FROM odontograma WHERE paciente_id=$1', [id]);
      const anteriores = new Map(existentes.rows.map(r => [`${r.diente}-${r.cara}`, r.estado]));
      const catalogo = await db.query(
        'SELECT codigo,activa FROM odontograma_referencias WHERE codigo=ANY($1::text[]) FOR SHARE',
        [[...new Set(registros.map(r => r.estado))]]);
      const referencias = new Map(catalogo.rows.map(r => [r.codigo, r]));
      for (const registro of registros) {
        const anterior = anteriores.get(`${registro.diente}-${registro.cara}`);
        // Conservar una referencia inactiva/heredada no equivale a asignarla.
        if (anterior === registro.estado) continue;
        const referencia = referencias.get(registro.estado);
        if (!referencia?.activa) throw new Error(`La referencia ${registro.estado} no existe o no está activa`);
        await db.query(`INSERT INTO odontograma(paciente_id,diente,cara,estado,fecha,actualizado_por_usuario_id,profesional_perfil_id)
          VALUES($1,$2,$3,$4,NOW(),$5,$6) ON CONFLICT(paciente_id,diente,cara)
          DO UPDATE SET estado=EXCLUDED.estado,fecha=NOW(),
            actualizado_por_usuario_id=EXCLUDED.actualizado_por_usuario_id,
            profesional_perfil_id=EXCLUDED.profesional_perfil_id`,
        [id, registro.diente, registro.cara, registro.estado,
          payload.actor?.usuario_id || null, payload.actor?.profesional_perfil_id || null]);
      }
    }
    await guardarMetaDb(db, id, payload.meta || {}, payload.actor || {});
    const resultado = await obtenerOdontogramaPorPaciente(id, db);
    if (own) await db.query('COMMIT');
    return resultado;
  } catch (error) {
    if (own) await db.query('ROLLBACK');
    throw error;
  } finally {
    if (own) db.release();
  }
}
async function crearSnapshot(id, db = pool) {
  const actual = await obtenerOdontogramaPorPaciente(id, db);
  const referencias = (await db.query('SELECT codigo,nombre,color FROM odontograma_referencias ORDER BY id')).rows;
  return { version: 1, capturado_at: new Date().toISOString(),
    registros: actual.registros.map(({ diente, cara, estado }) => ({ diente, cara, estado })),
    meta: actual.meta, referencias };
}
async function guardarEstadoCara(payload) {
  const resultado = await guardarOdontogramaCompleto({
    paciente_id: payload.paciente_id, registros: [payload],
    meta: Object.fromEntries(['sarro', 'periodontal', 'observaciones']
      .filter(key => Object.hasOwn(payload, key)).map(key => [key, payload[key]])),
  });
  return resultado.registros.find(r => r.diente === Number(payload.diente) && r.cara === payload.cara);
}
async function guardarMeta(id, sarro, periodontal, observaciones, actor = {}) {
  const valores = { sarro, periodontal, observaciones };
  return guardarOdontogramaCompleto({ paciente_id: id, registros: [],
    meta: Object.fromEntries(Object.entries(valores).filter(([, value]) => value !== undefined)), actor });
}
module.exports = { obtenerOdontogramaPorPaciente, guardarEstadoCara, guardarMeta,
  guardarOdontogramaCompleto, crearSnapshot, normalizarObservacion };
