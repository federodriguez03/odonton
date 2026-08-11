const { pool } = require('../config/db');

let pagosTableReady = false;

async function asegurarTablaPagos() {
  if (pagosTableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos (
      id SERIAL PRIMARY KEY,
      paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
      turno_id INTEGER REFERENCES turnos(id) ON DELETE SET NULL,
      monto NUMERIC(12,2) NOT NULL,
      metodo TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pagado',
      fecha_pago TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      observaciones TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    );
  `);

  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS turno_id INTEGER REFERENCES turnos(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS monto NUMERIC(12,2)`);
  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS metodo TEXT`);
  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pagado'`);
  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS observaciones TEXT`);
  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
  await pool.query(`ALTER TABLE pagos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);

  await pool.query(`
    UPDATE pagos
    SET fecha_pago = COALESCE(fecha_pago, created_at, NOW())
    WHERE fecha_pago IS NULL
  `);

  await pool.query(`
    UPDATE pagos
    SET estado = COALESCE(NULLIF(TRIM(estado), ''), 'pagado')
    WHERE estado IS NULL OR TRIM(estado) = ''
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pagos_paciente_fecha ON pagos(paciente_id, fecha_pago DESC)`);

  pagosTableReady = true;
}

function validarPago({ paciente_id, monto, metodo, estado }) {
  if (!paciente_id) throw new Error('paciente_id requerido');
  const montoNum = Number(monto);
  if (!Number.isFinite(montoNum) || montoNum <= 0) throw new Error('monto invalido');
  if (!metodo || !String(metodo).trim()) throw new Error('metodo requerido');

  const estadosValidos = ['pendiente', 'parcial', 'pagado'];
  const estadoNorm = estado ? String(estado).toLowerCase() : 'pagado';
  if (!estadosValidos.includes(estadoNorm)) throw new Error('estado invalido');

  return { montoNum, estadoNorm };
}

async function listarPagos({ pacienteId, desde, hasta }) {
  await asegurarTablaPagos();

  const where = ['1=1'];
  const values = [];
  let idx = 1;

  if (pacienteId) {
    where.push(`p.paciente_id = $${idx++}`);
    values.push(pacienteId);
  }
  if (desde) {
    where.push(`p.fecha_pago >= $${idx++}`);
    values.push(desde);
  }
  if (hasta) {
    where.push(`p.fecha_pago <= $${idx++}`);
    values.push(hasta);
  }

  const query = `
    WITH pagos_por_turno AS (
      SELECT
        turno_id,
        COALESCE(SUM(CASE WHEN estado IN ('parcial', 'pagado') THEN monto ELSE 0 END), 0) AS total_pagado_turno
      FROM pagos
      WHERE turno_id IS NOT NULL
      GROUP BY turno_id
    )
    SELECT
      p.id,
      p.paciente_id,
      p.turno_id,
      p.monto,
      p.metodo,
      p.estado,
      p.fecha_pago,
      p.observaciones,
      pa.nombre AS paciente_nombre,
      pa.apellido AS paciente_apellido,
      pa.dni AS paciente_dni,
      pr.nombre AS prestacion_nombre,
      COALESCE(pr.precio_base, 0) AS precio_base_turno,
      GREATEST(COALESCE(pr.precio_base, 0) - COALESCE(pt.total_pagado_turno, 0), 0) AS saldo_pendiente_turno
    FROM pagos p
    LEFT JOIN pacientes pa ON pa.id = p.paciente_id
    LEFT JOIN turnos t ON t.id = p.turno_id
    LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
    LEFT JOIN pagos_por_turno pt ON pt.turno_id = p.turno_id
    WHERE ${where.join(' AND ')}
    ORDER BY p.fecha_pago DESC
  `;

  const { rows } = await pool.query(query, values);
  return rows;
}

async function obtenerResumenPaciente(pacienteId) {
  await asegurarTablaPagos();
  if (!pacienteId) throw new Error('paciente_id requerido');

  const pacienteRes = await pool.query(
    `
      SELECT id, nombre, apellido, dni
      FROM pacientes
      WHERE id = $1
      LIMIT 1
    `,
    [pacienteId],
  );

  if (!pacienteRes.rows.length) {
    throw new Error('Paciente no encontrado');
  }

  const conceptosRes = await pool.query(
    `
      SELECT
        t.id AS turno_id,
        t.fecha_hora_inicio,
        t.estado AS turno_estado,
        pr.nombre AS prestacion_nombre,
        COALESCE(pr.precio_base, 0) AS precio_base,
        COALESCE(SUM(CASE WHEN p.estado IN ('parcial', 'pagado') THEN p.monto ELSE 0 END), 0) AS total_pagado
      FROM turnos t
      LEFT JOIN prestaciones pr ON pr.id = t.prestacion_id
      LEFT JOIN pagos p ON p.turno_id = t.id
      WHERE t.paciente_id = $1
        AND t.estado IN ('programado', 'confirmado', 'reprogramado', 'realizado')
      GROUP BY t.id, t.fecha_hora_inicio, t.estado, pr.nombre, pr.precio_base
      ORDER BY t.fecha_hora_inicio DESC
    `,
    [pacienteId],
  );

  const conceptos = conceptosRes.rows
    .map((row) => {
      const precioBase = Number(row.precio_base) || 0;
      const totalPagado = Number(row.total_pagado) || 0;
      const saldoPendiente = Math.max(precioBase - totalPagado, 0);
      return {
        turno_id: row.turno_id,
        fecha_hora_inicio: row.fecha_hora_inicio,
        turno_estado: row.turno_estado,
        prestacion_nombre: row.prestacion_nombre || 'Prestacion',
        precio_base: precioBase,
        total_pagado: totalPagado,
        saldo_pendiente: saldoPendiente,
      };
    })
    .filter((row) => row.saldo_pendiente > 0);

  const resumen = conceptos.reduce(
    (acc, item) => {
      acc.total_deuda += item.saldo_pendiente;
      acc.conceptos_pendientes += 1;
      return acc;
    },
    { total_deuda: 0, conceptos_pendientes: 0 },
  );

  return {
    paciente: pacienteRes.rows[0],
    resumen,
    conceptos,
  };
}

async function crearPago({ paciente_id, turno_id = null, monto, metodo, estado = 'pagado', fecha_pago = null, observaciones = null }) {
  await asegurarTablaPagos();
  const { montoNum, estadoNorm } = validarPago({ paciente_id, monto, metodo, estado });

  const { rows } = await pool.query(
    `
      INSERT INTO pagos (paciente_id, turno_id, monto, metodo, estado, fecha_pago, observaciones)
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7)
      RETURNING *
    `,
    [paciente_id, turno_id, montoNum, metodo, estadoNorm, fecha_pago, observaciones],
  );

  return rows[0];
}

async function actualizarPago(id, { monto, metodo, estado, fecha_pago = null, observaciones = null }) {
  await asegurarTablaPagos();
  if (!id) throw new Error('id requerido');

  const { montoNum, estadoNorm } = validarPago({
    paciente_id: 1,
    monto,
    metodo,
    estado,
  });

  const { rows } = await pool.query(
    `
      UPDATE pagos
      SET monto = $1,
          metodo = $2,
          estado = $3,
          fecha_pago = COALESCE($4, fecha_pago),
          observaciones = $5,
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `,
    [montoNum, metodo, estadoNorm, fecha_pago, observaciones, id],
  );

  if (!rows.length) throw new Error('Pago no encontrado');
  return rows[0];
}

module.exports = {
  listarPagos,
  crearPago,
  actualizarPago,
  obtenerResumenPaciente,
};
