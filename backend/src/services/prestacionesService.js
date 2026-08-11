const { pool } = require('../config/db');

let columnasReady = false;

async function asegurarColumnasPrestaciones() {
  if (columnasReady) return;

  await pool.query(`ALTER TABLE prestaciones ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true`);
  await pool.query(`ALTER TABLE prestaciones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ`);

  columnasReady = true;
}

function normalizarNombre(nombre) {
  return String(nombre || '').trim();
}

function validarPrestacion({ nombre, duracion_minutos, precio_base }) {
  if (!nombre || !String(nombre).trim()) throw new Error('nombre requerido');
  const duracion = Number(duracion_minutos);
  if (!Number.isFinite(duracion) || duracion < 15) throw new Error('duracion_minutos invalida (min 15)');
  const precio = Number(precio_base);
  if (!Number.isFinite(precio) || precio < 0) throw new Error('precio_base invalido (>= 0)');
  return { duracion, precio };
}

async function nombreDuplicado(nombre, excludeId = null) {
  const query = `
    SELECT id
    FROM prestaciones
    WHERE LOWER(TRIM(nombre)) = LOWER(TRIM($1))
    ${excludeId ? 'AND id <> $2' : ''}
    LIMIT 1
  `;
  const params = excludeId ? [nombre, excludeId] : [nombre];
  const { rows } = await pool.query(query, params);
  return rows.length > 0;
}

async function listarPrestaciones({ incluirInactivas = false } = {}) {
  await asegurarColumnasPrestaciones();

  const query = `
    WITH normalizadas AS (
      SELECT
        id,
        nombre,
        duracion_minutos,
        precio_base,
        activo,
        LOWER(TRIM(nombre)) AS nombre_normalizado,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(TRIM(nombre))
          ORDER BY activo DESC, id ASC
        ) AS rn
      FROM prestaciones
      WHERE nombre IS NOT NULL AND TRIM(nombre) <> ''
      ${incluirInactivas ? '' : 'AND activo = true'}
    )
    SELECT id, nombre, duracion_minutos, precio_base, activo
    FROM normalizadas
    WHERE rn = 1
    ORDER BY nombre ASC
  `;

  const { rows } = await pool.query(query);
  return {
    total: rows.length,
    prestaciones: rows,
  };
}

async function crearPrestacion({ nombre, duracion_minutos, precio_base, activo = true }) {
  await asegurarColumnasPrestaciones();
  const { duracion, precio } = validarPrestacion({ nombre, duracion_minutos, precio_base });
  const nombreNorm = normalizarNombre(nombre);

  if (await nombreDuplicado(nombreNorm)) {
    throw new Error('Prestacion ya registrada');
  }

  const { rows } = await pool.query(
    `
      INSERT INTO prestaciones (nombre, duracion_minutos, precio_base, activo)
      VALUES ($1, $2, $3, $4)
      RETURNING id, nombre, duracion_minutos, precio_base, activo
    `,
    [nombreNorm, duracion, precio, Boolean(activo)],
  );

  return rows[0];
}

async function actualizarPrestacion(id, { nombre, duracion_minutos, precio_base, activo = true }) {
  await asegurarColumnasPrestaciones();
  if (!id) throw new Error('id requerido');
  const { duracion, precio } = validarPrestacion({ nombre, duracion_minutos, precio_base });
  const nombreNorm = normalizarNombre(nombre);

  const existing = await pool.query('SELECT id, nombre FROM prestaciones WHERE id = $1', [id]);
  if (existing.rowCount === 0) throw new Error('Prestacion no encontrada');

  const nombreActual = normalizarNombre(existing.rows[0].nombre);
  const cambioNombre = nombreActual.toLowerCase() !== nombreNorm.toLowerCase();

  if (cambioNombre && (await nombreDuplicado(nombreNorm, id))) {
    throw new Error('Prestacion ya registrada');
  }

  const { rows } = await pool.query(
    `
      UPDATE prestaciones
      SET nombre = $1,
          duracion_minutos = $2,
          precio_base = $3,
          activo = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING id, nombre, duracion_minutos, precio_base, activo
    `,
    [nombreNorm, duracion, precio, Boolean(activo), id],
  );

  return rows[0];
}

async function setActivoPrestacion(id, activo) {
  await asegurarColumnasPrestaciones();
  if (!id) throw new Error('id requerido');

  const { rows } = await pool.query(
    `
      UPDATE prestaciones
      SET activo = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, nombre, duracion_minutos, precio_base, activo
    `,
    [Boolean(activo), id],
  );

  if (!rows.length) throw new Error('Prestacion no encontrada');
  return rows[0];
}

async function normalizarPrestacionesDuplicadas() {
  await asegurarColumnasPrestaciones();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const duplicadosRes = await client.query(`
      SELECT LOWER(TRIM(nombre)) AS nombre_normalizado
      FROM prestaciones
      WHERE nombre IS NOT NULL AND TRIM(nombre) <> ''
      GROUP BY LOWER(TRIM(nombre))
      HAVING COUNT(*) > 1
    `);

    const resultado = {
      grupos: duplicadosRes.rowCount,
      canonicas: [],
      archivadas: [],
      turnos_reasignados: 0,
    };

    for (const duplicado of duplicadosRes.rows) {
      const grupoRes = await client.query(
        `
          SELECT id, nombre, activo
          FROM prestaciones
          WHERE LOWER(TRIM(nombre)) = $1
          ORDER BY activo DESC, id ASC
        `,
        [duplicado.nombre_normalizado],
      );

      if (grupoRes.rowCount <= 1) continue;

      const [canonica, ...resto] = grupoRes.rows;
      resultado.canonicas.push({ id: canonica.id, nombre: canonica.nombre });

      for (const item of resto) {
        const turnosUpdate = await client.query(
          `
            UPDATE turnos
            SET prestacion_id = $1
            WHERE prestacion_id = $2
          `,
          [canonica.id, item.id],
        );

        resultado.turnos_reasignados += turnosUpdate.rowCount;

        const nombreArchivado = `${normalizarNombre(item.nombre)} [archivada #${item.id}]`;

        await client.query(
          `
            UPDATE prestaciones
            SET nombre = $1,
                activo = false,
                updated_at = NOW()
            WHERE id = $2
          `,
          [nombreArchivado, item.id],
        );

        resultado.archivadas.push({
          id: item.id,
          nombre_original: item.nombre,
          nombre_nuevo: nombreArchivado,
          canonica_id: canonica.id,
        });
      }
    }

    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listarPrestaciones,
  crearPrestacion,
  actualizarPrestacion,
  setActivoPrestacion,
  normalizarPrestacionesDuplicadas,
};
