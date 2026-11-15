require('dotenv').config();
const { Client } = require('pg');

const target = process.env.VALIDATION_TEMP_DATABASE;
const action = process.argv[2];
const protectedDatabases = new Set(['odonton_db', 'odonton_ficha_20261109_test', 'odonton_demo_2026']);

if (!target || protectedDatabases.has(target) || !/^odonton_tmp_validation_[a-z0-9_]+$/.test(target)) {
  throw new Error('VALIDATION_TEMP_DATABASE no identifica una base temporal autorizada');
}
if (!['create', 'verify-clean', 'drop'].includes(action)) throw new Error('Accion requerida: create, verify-clean o drop');

(async () => {
  const client = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: 'postgres',
  });
  await client.connect();
  try {
    const actual = (await client.query('SELECT current_database() db')).rows[0].db;
    if (actual !== 'postgres') throw new Error('La conexion administrativa no apunta a postgres');
    const exists = (await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [target])).rowCount > 0;
    if (action === 'create') {
      if (exists) throw new Error('La base temporal ya existe; no se sobrescribe');
      await client.query(`CREATE DATABASE "${target}"`);
    } else if (action === 'verify-clean') {
      if (!exists) throw new Error('La base temporal no existe');
      const validationClient = new Client({
        host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
        password: process.env.DB_PASSWORD, database: target,
      });
      await validationClient.connect();
      try {
        const actualTarget = (await validationClient.query('SELECT current_database() db')).rows[0].db;
        if (actualTarget !== target) throw new Error('La conexion efectiva no coincide con la base temporal');
        const { rows } = await validationClient.query(`SELECT
          (SELECT count(*)::int FROM usuarios WHERE email LIKE '%.permisos.%@test') usuarios,
          (SELECT count(*)::int FROM pacientes WHERE apellido IN ('Dueno','Recepcion','Odontologo','Temporal')) pacientes,
          (SELECT count(*)::int FROM cargos WHERE concepto LIKE 'Prueba operativa temporal%') cargos`);
        if (Object.values(rows[0]).some((value) => Number(value) !== 0)) throw new Error('La matriz dejo fixtures temporales');
      } finally {
        await validationClient.end();
      }
    } else if (exists) {
      await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [target]);
      await client.query(`DROP DATABASE "${target}"`);
    }
    console.log(JSON.stringify({ action, database: target, effective_admin_database: actual, ok: true }));
  } finally {
    await client.end();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
