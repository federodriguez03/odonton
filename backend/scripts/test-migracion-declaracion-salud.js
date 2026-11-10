const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const EXPECTED_DB = 'odonton_ficha_20261109_test';

async function main() {
  if (process.env.DB_NAME !== EXPECTED_DB) throw new Error('Base de prueba no configurada');
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT) });
  const schema = `prueba_declaracion_${Date.now()}`;
  await client.connect();
  try {
    assert.equal((await client.query('SELECT current_database() db')).rows[0].db, EXPECTED_DB);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.pacientes (LIKE public.pacientes INCLUDING ALL)`);
    await client.query(`CREATE TABLE ${schema}.usuarios (LIKE public.usuarios INCLUDING ALL)`);
    await client.query(`SET search_path TO ${schema}`);
    const sql = await fs.readFile(path.join(__dirname, '..', '..', 'database', '2026-11-10_declaraciones_salud.sql'), 'utf8');
    await client.query(sql);
    const columns = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='declaraciones_salud'`, [schema]);
    assert.ok(columns.rows.some((row) => row.column_name === 'respuestas'));
    assert.ok(columns.rows.some((row) => row.column_name === 'numero_version'));
    const indexes = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname=$1 AND tablename='declaraciones_salud'`, [schema]);
    assert.ok(indexes.rows.some((row) => row.indexname === 'idx_declaraciones_salud_paciente_fecha'));
    console.log('OK: migración validada en copia aislada.');
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
