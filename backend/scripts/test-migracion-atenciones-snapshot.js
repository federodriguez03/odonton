const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const EXPECTED_DB = 'odonton_ficha_20261109_test';

async function main() {
  if (process.env.DB_NAME !== EXPECTED_DB) throw new Error('Base de prueba no configurada');
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT) });
  const schema = `prueba_snapshot_${Date.now()}`;
  await client.connect();
  try {
    assert.equal((await client.query('SELECT current_database() db')).rows[0].db, EXPECTED_DB);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.historias_clinicas (LIKE public.historias_clinicas INCLUDING ALL)`);
    await client.query(`SET search_path TO ${schema}`);
    const sql = await fs.readFile(path.join(__dirname, '..', '..', 'database', '2026-11-09_atenciones_odontograma_snapshot.sql'), 'utf8');
    await client.query(sql);
    const column = await client.query(`SELECT data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name='historias_clinicas' AND column_name='odontograma_snapshot'`, [schema]);
    assert.equal(column.rows[0]?.data_type, 'jsonb');
    const index = await client.query(`SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname='uq_historias_clinicas_turno'`, [schema]);
    assert.match(index.rows[0]?.indexdef || '', /UNIQUE/);
    console.log('OK - migracion de snapshots validada en copia aislada');
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
