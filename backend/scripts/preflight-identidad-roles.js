require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');

function validarDestino() {
  const database = pool.options.database || process.env.DB_NAME;
  validarEntornoDemo(process.env, process.argv.slice(2), database);
  if (!['localhost', '127.0.0.1', '::1'].includes(pool.options.host)) {
    throw new Error('El preflight sólo puede ejecutarse contra PostgreSQL local');
  }
  return database;
}

async function existeTabla(client, tabla) {
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS existe', [`public.${tabla}`]);
  return rows[0].existe;
}

async function main() {
  const database = validarDestino();
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const cuentas = (await client.query(`
      SELECT u.id, u.nombre, u.email, u.activo,
        COUNT(DISTINCT t.id)::INTEGER AS turnos,
        COUNT(DISTINCT ph.id)::INTEGER AS horarios,
        COUNT(DISTINCT hc.id)::INTEGER AS atenciones
      FROM usuarios u
      LEFT JOIN turnos t ON t.profesional_id=u.id
      LEFT JOIN profesionales_horarios_atencion ph ON ph.profesional_id=u.id
      LEFT JOIN historias_clinicas hc ON hc.profesional_id=u.id
      GROUP BY u.id,u.nombre,u.email,u.activo
      ORDER BY u.id
    `)).rows;
    const referencias = (await client.query(`
      SELECT
        (SELECT COUNT(*)::INTEGER FROM turnos t LEFT JOIN usuarios u ON u.id=t.profesional_id
          WHERE t.profesional_id IS NOT NULL AND u.id IS NULL) AS turnos_huerfanos,
        (SELECT COUNT(*)::INTEGER FROM profesionales_horarios_atencion h LEFT JOIN usuarios u ON u.id=h.profesional_id
          WHERE h.profesional_id IS NOT NULL AND u.id IS NULL) AS horarios_huerfanos,
        (SELECT COUNT(*)::INTEGER FROM historias_clinicas h LEFT JOIN usuarios u ON u.id=h.profesional_id
          WHERE h.profesional_id IS NOT NULL AND u.id IS NULL) AS atenciones_huerfanas,
        (SELECT COUNT(*)::INTEGER FROM turnos WHERE profesional_id IS NULL) AS turnos_sin_profesional,
        (SELECT COUNT(*)::INTEGER FROM historias_clinicas WHERE profesional_id IS NULL) AS atenciones_sin_profesional
    `)).rows[0];
    const tablas = {
      revisiones: await existeTabla(client, 'historias_clinicas_revisiones'),
      roles: await existeTabla(client, 'roles'),
      usuarios_roles: await existeTabla(client, 'usuarios_roles'),
      profesionales: await existeTabla(client, 'profesionales'),
    };
    let correspondencias = null;
    if (tablas.profesionales) {
      correspondencias = (await client.query(`
        SELECT p.id, p.usuario_id, p.usuario_legacy_id, p.nombre_mostrado,
          p.activo, p.es_ficticio, p.compatibilidad_pendiente,
          (SELECT COUNT(*)::INTEGER FROM turnos t WHERE t.profesional_perfil_id=p.id) AS turnos,
          (SELECT COUNT(*)::INTEGER FROM profesionales_horarios_atencion h WHERE h.profesional_perfil_id=p.id) AS horarios,
          (SELECT COUNT(*)::INTEGER FROM historias_clinicas h WHERE h.profesional_perfil_id=p.id) AS atenciones
        FROM profesionales p ORDER BY p.id
      `)).rows;
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ database, host: pool.options.host, cuentas, referencias, tablas, correspondencias }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`PRECHECK FALLÓ: ${error.message}`);
  process.exitCode = 1;
});
