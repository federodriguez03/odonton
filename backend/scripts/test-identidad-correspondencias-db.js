require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const assert = require('node:assert/strict');
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');

function validarDestino() {
  const database = pool.options.database || process.env.DB_NAME;
  validarEntornoDemo(process.env, process.argv.slice(2), database);
  if (!['localhost', '127.0.0.1', '::1'].includes(pool.options.host)) {
    throw new Error('La prueba de identidad sólo puede usar PostgreSQL local');
  }
  return database;
}

async function contarAdministradoresActivos(client = pool) {
  const { rows } = await client.query(`
    SELECT COUNT(DISTINCT u.id)::INTEGER AS cantidad
    FROM usuarios u
    JOIN usuarios_roles ur ON ur.usuario_id=u.id
    JOIN roles r ON r.id=ur.rol_id
    WHERE u.activo=TRUE AND r.codigo='administrador'
  `);
  return rows[0].cantidad;
}

async function esperarFalloUltimoAdmin(sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql, params);
    await assert.rejects(client.query('COMMIT'), /Debe existir al menos un administrador activo/);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

async function crearAdminTemporal(client, sufijo) {
  const { rows } = await client.query(`
    INSERT INTO usuarios(nombre,email,password_hash,activo,es_demo,updated_at)
    VALUES($1,$2,'TEST_ONLY_NOT_A_LOGIN_HASH',TRUE,TRUE,NOW()) RETURNING id
  `, [`Administrador temporal ${sufijo}`, `admin.temporal.${sufijo}@odonton.test`]);
  await client.query(`
    INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
    SELECT $1,id,1 FROM roles WHERE codigo='administrador'
  `, [rows[0].id]);
  return rows[0].id;
}

async function testConcurrenciaUltimoAdmin() {
  const setup = await pool.connect();
  let ids = [];
  try {
    await setup.query('BEGIN');
    const marca = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    ids = [await crearAdminTemporal(setup, `${marca}_a`), await crearAdminTemporal(setup, `${marca}_b`)];
    await setup.query(`DELETE FROM usuarios_roles WHERE usuario_id=1 AND rol_id=(SELECT id FROM roles WHERE codigo='administrador')`);
    await setup.query('COMMIT');

    const clientes = await Promise.all([pool.connect(), pool.connect()]);
    const resultados = await Promise.allSettled(clientes.map(async (client, index) => {
      try {
        await client.query('BEGIN');
        await client.query('UPDATE usuarios SET activo=FALSE,updated_at=NOW() WHERE id=$1', [ids[index]]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }));
    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(resultados.filter((r) => r.status === 'rejected').length, 1);
    assert.match(resultados.find((r) => r.status === 'rejected').reason.message, /Debe existir al menos un administrador activo/);
    assert.equal(await contarAdministradoresActivos(), 1);
  } finally {
    await setup.query('ROLLBACK').catch(() => {});
    setup.release();
    const cleanup = await pool.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('UPDATE usuarios SET activo=TRUE,updated_at=NOW() WHERE id=1');
      await cleanup.query(`
        INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
        SELECT 1,id,1 FROM roles WHERE codigo='administrador'
        ON CONFLICT DO NOTHING
      `);
      if (ids.length) {
        await cleanup.query('DELETE FROM usuarios_roles WHERE usuario_id=ANY($1::int[])', [ids]);
        await cleanup.query('DELETE FROM usuarios WHERE id=ANY($1::int[])', [ids]);
      }
      await cleanup.query('COMMIT');
    } catch (error) {
      await cleanup.query('ROLLBACK');
      throw error;
    } finally {
      cleanup.release();
    }
  }
}

async function main() {
  const database = validarDestino();
  const roles = (await pool.query('SELECT codigo FROM roles ORDER BY codigo')).rows.map((r) => r.codigo);
  assert.deepEqual(roles, ['administrador', 'odontologo', 'recepcion']);

  const cuenta1 = (await pool.query(`
    SELECT u.activo,u.puede_cobrar,ARRAY_AGG(r.codigo ORDER BY r.codigo) AS roles
    FROM usuarios u JOIN usuarios_roles ur ON ur.usuario_id=u.id JOIN roles r ON r.id=ur.rol_id
    WHERE u.id=1 GROUP BY u.id
  `)).rows[0];
  assert.equal(cuenta1.activo, true);
  assert.equal(cuenta1.puede_cobrar, false);
  assert.deepEqual(cuenta1.roles, ['administrador']);

  const compat = (await pool.query(`
    SELECT * FROM profesionales WHERE usuario_legacy_id=1
  `)).rows[0];
  assert.ok(compat);
  assert.equal(compat.usuario_id, null);
  assert.equal(compat.nombre_mostrado, 'Profesional de desarrollo — identidad no verificada');
  assert.equal(compat.activo, false);
  assert.equal(compat.compatibilidad_pendiente, true);

  for (const tabla of ['turnos', 'profesionales_horarios_atencion', 'historias_clinicas']) {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE profesional_id=1)::INTEGER AS legacy,
        COUNT(*) FILTER (WHERE profesional_perfil_id=$1)::INTEGER AS perfil,
        COUNT(*) FILTER (WHERE profesional_id IS NOT NULL AND profesional_perfil_id IS NULL)::INTEGER AS sin_mapear
      FROM ${tabla}
    `, [compat.id]);
    assert.equal(rows[0].perfil, rows[0].legacy, `${tabla}: la correspondencia debe conservar cantidades`);
    assert.equal(rows[0].sin_mapear, 0, `${tabla}: no debe haber referencias sin mapear`);
  }

  const demos = (await pool.query(`
    SELECT u.email,u.puede_cobrar,ARRAY_AGG(r.codigo ORDER BY r.codigo) AS roles,
      p.id AS profesional_id,p.activo AS profesional_activo,p.es_ficticio
    FROM usuarios u
    JOIN usuarios_roles ur ON ur.usuario_id=u.id
    JOIN roles r ON r.id=ur.rol_id
    LEFT JOIN profesionales p ON p.usuario_id=u.id
    WHERE u.email=ANY($1::text[])
    GROUP BY u.id,p.id
    ORDER BY u.email
  `, [['odontologo.demo@odonton.test', 'recepcion.demo@odonton.test']])).rows;
  assert.equal(demos.length, 2);
  const odontologo = demos.find((d) => d.email === 'odontologo.demo@odonton.test');
  const recepcion = demos.find((d) => d.email === 'recepcion.demo@odonton.test');
  assert.deepEqual(odontologo.roles, ['odontologo']);
  assert.ok(odontologo.profesional_id);
  assert.equal(odontologo.profesional_activo, true);
  assert.equal(odontologo.es_ficticio, true);
  assert.deepEqual(recepcion.roles, ['recepcion']);
  assert.equal(recepcion.profesional_id, null);
  assert.equal(recepcion.puede_cobrar, false);

  await esperarFalloUltimoAdmin(`DELETE FROM usuarios_roles WHERE usuario_id=1 AND rol_id=(SELECT id FROM roles WHERE codigo='administrador')`);
  await esperarFalloUltimoAdmin('UPDATE usuarios SET activo=FALSE,updated_at=NOW() WHERE id=1');
  await testConcurrenciaUltimoAdmin();
  assert.equal(await contarAdministradoresActivos(), 1);

  console.log(`OK - identidad y correspondencias verificadas en ${database}`);
  console.log('OK - cuenta 1 conserva sólo administrador y no puede_cobrar');
  console.log('OK - perfil histórico inactivo separado de la cuenta de desarrollo');
  console.log('OK - cuentas demo y perfil profesional ficticio separados');
  console.log('OK - último administrador protegido, incluso ante operaciones simultáneas');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
