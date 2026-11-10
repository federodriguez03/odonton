const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const EXPECTED_DB = 'odonton_ficha_20261109_test';
const schema = `tmp_odonto_corona_${process.pid}`;
const migrationPath = path.join(__dirname, '..', '..', 'database', '2026-11-10_odontograma_corona_completa.sql');

async function digest(client, table, expression) {
  const result = await client.query(`SELECT md5(COALESCE(string_agg(${expression}, '|' ORDER BY id), '')) AS digest FROM public.${table}`);
  return result.rows[0].digest;
}

async function main() {
  if (process.env.DB_NAME !== EXPECTED_DB) throw new Error(`Base rechazada: se esperaba ${EXPECTED_DB}`);
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const client = await pool.connect();
  try {
    const refsBefore = await digest(client, 'odontograma_referencias', "concat_ws(':', id, codigo, nombre, color, alcance, activo)");
    const snapshotsBefore = await digest(client, 'historias_clinicas', "concat_ws(':', id, COALESCE(odontograma_snapshot::text, ''))");
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.odontograma_referencias (LIKE public.odontograma_referencias INCLUDING ALL)`);
    await client.query(`INSERT INTO ${schema}.odontograma_referencias SELECT * FROM public.odontograma_referencias`);
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(fs.readFileSync(migrationPath, 'utf8'));

    const result = await client.query(
      `SELECT codigo, alcance, activo FROM ${schema}.odontograma_referencias WHERE codigo IN ('corona', 'corona_completa') ORDER BY codigo`,
    );
    const corona = result.rows.find((row) => row.codigo === 'corona');
    const completa = result.rows.find((row) => row.codigo === 'corona_completa');
    if (!corona || corona.activo !== false) throw new Error('La referencia corona no quedó inactiva en la copia');
    if (!completa || completa.alcance !== 'pieza' || completa.activo !== true) throw new Error('corona_completa inválida en la copia');

    await client.query('SET search_path TO public');
    const refsAfter = await digest(client, 'odontograma_referencias', "concat_ws(':', id, codigo, nombre, color, alcance, activo)");
    const snapshotsAfter = await digest(client, 'historias_clinicas', "concat_ws(':', id, COALESCE(odontograma_snapshot::text, ''))");
    if (refsBefore !== refsAfter || snapshotsBefore !== snapshotsAfter) throw new Error('La prueba alteró datos públicos');
    console.log('OK: migración validada en copia aislada; catálogo público y snapshots intactos.');
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
