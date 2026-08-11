const { pool } = require('../config/db');

let initDone = false;

const ESTADOS_PERMITIDOS = new Set([
	'sano',
	'existente',
	'requerido',
	'corona',
	'protesis_fija',
	'protesis_removible',
	'ausente',
]);
const CARAS_PERMITIDAS = new Set(['vestibular', 'mesial', 'distal', 'oclusal', 'lingual']);

function esDienteFDIValido(diente) {
  return /^(?:[1-4][1-8]|[5-8][1-5])$/.test(String(diente));
}

async function asegurarTablas() {
	if (initDone) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS odontograma (
      id SERIAL PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
      diente SMALLINT NOT NULL,
      cara VARCHAR(20) NOT NULL,
      estado VARCHAR(50) NOT NULL,
      fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (paciente_id, diente, cara)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS odontograma_meta (
      id SERIAL PRIMARY KEY,
      paciente_id INTEGER NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
      sarro BOOLEAN NOT NULL DEFAULT FALSE,
      periodontal BOOLEAN NOT NULL DEFAULT FALSE,
      observaciones TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Asegurar columna observaciones por compatibilidad si la tabla ya existía
  await pool.query(`ALTER TABLE odontograma_meta ADD COLUMN IF NOT EXISTS observaciones TEXT`);

  initDone = true;
}

function normalizarEstado(estado) {
	const value = String(estado || '').trim().toLowerCase();
	// compatibilidad con estados antiguos
	if (value === 'caries' || value === 'obturacion') return 'existente';
	if (value === 'implante') return 'protesis_fija';
	if (value === 'extraccion') return 'ausente';
	return value;
}

function validarPayload({ paciente_id, diente, cara, estado }) {
	const pid = Number.parseInt(paciente_id, 10);
	const dienteNum = Number.parseInt(diente, 10);
	const estadoNorm = normalizarEstado(estado);

	if (!Number.isInteger(pid) || pid <= 0) {
		throw new Error('paciente_id invalido');
	}

  if (!Number.isInteger(dienteNum) || !esDienteFDIValido(dienteNum)) {
    throw new Error('diente invalido (FDI)');
  }

  if (!CARAS_PERMITIDAS.has(String(cara))) {
    throw new Error('cara invalida');
  }

	if (!ESTADOS_PERMITIDOS.has(estadoNorm)) {
		throw new Error('estado invalido');
	}

	return {
		paciente_id: pid,
		diente: dienteNum,
		cara: String(cara),
		estado: estadoNorm,
	};
}

async function obtenerMeta(pacienteId) {
  const res = await pool.query('SELECT sarro, periodontal, observaciones FROM odontograma_meta WHERE paciente_id = $1', [pacienteId]);
  if (res.rowCount === 0) return { sarro: false, periodontal: false, observaciones: null };
  return res.rows[0];
}

async function guardarMeta(pacienteId, sarro, periodontal, observaciones) {
  if (sarro === undefined && periodontal === undefined && observaciones === undefined) return null;
  await pool.query(
    `INSERT INTO odontograma_meta (paciente_id, sarro, periodontal, observaciones, updated_at)
     VALUES ($1, COALESCE($2, FALSE), COALESCE($3, FALSE), $4, NOW())
     ON CONFLICT (paciente_id)
     DO UPDATE SET sarro = COALESCE(EXCLUDED.sarro, odontograma_meta.sarro),
                   periodontal = COALESCE(EXCLUDED.periodontal, odontograma_meta.periodontal),
                   observaciones = COALESCE(EXCLUDED.observaciones, odontograma_meta.observaciones),
                   updated_at = NOW()
    `,
    [pacienteId, sarro, periodontal, observaciones]
  );
}

async function obtenerOdontogramaPorPaciente(pacienteId) {
  await asegurarTablas();

  const pid = Number.parseInt(pacienteId, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error('pacienteId invalido');
  }

  const pacienteRes = await pool.query('SELECT id, nombre, apellido, dni FROM pacientes WHERE id = $1', [pid]);
  if (pacienteRes.rowCount === 0) {
    throw new Error('Paciente no encontrado');
  }

  const { rows } = await pool.query(
    `
      SELECT id, paciente_id, diente, cara, estado, fecha
      FROM odontograma
      WHERE paciente_id = $1
      ORDER BY diente ASC, cara ASC
    `,
    [pid]
  );

  const meta = await obtenerMeta(pid);

  return {
    paciente: pacienteRes.rows[0],
    registros: rows,
    meta,
  };
}

async function guardarEstadoCara(payload) {
  await asegurarTablas();
  const data = validarPayload(payload);

  const pacienteRes = await pool.query('SELECT id FROM pacientes WHERE id = $1', [data.paciente_id]);
  if (pacienteRes.rowCount === 0) {
    throw new Error('Paciente no encontrado');
  }

  const { rows } = await pool.query(
    `
      INSERT INTO odontograma (paciente_id, diente, cara, estado, fecha)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (paciente_id, diente, cara)
      DO UPDATE SET estado = EXCLUDED.estado, fecha = NOW()
      RETURNING id, paciente_id, diente, cara, estado, fecha
    `,
    [data.paciente_id, data.diente, data.cara, data.estado]
  );

  return rows[0];
}

module.exports = {
  obtenerOdontogramaPorPaciente,
  guardarEstadoCara,
  guardarMeta,
};
