const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');
const EXPECTED_DB = 'odonton_ficha_20261109_test';

async function main() {
  if (process.env.DB_NAME !== EXPECTED_DB) throw new Error('Base de prueba no configurada');
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT) });
  const schema = `prueba_refs_${Date.now()}`;
  await client.connect();
  try {
    assert.equal((await client.query('SELECT current_database() db')).rows[0].db, EXPECTED_DB);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    const sql = await fs.readFile(path.join(__dirname, '..', '..', 'database', '2026-11-09_odontograma_referencias.sql'), 'utf8');
    await client.query(sql);
    const refs = await client.query('SELECT codigo, activo FROM odontograma_referencias ORDER BY codigo');
    assert.ok(refs.rows.some((r) => r.codigo === 'pieza_ausente' && r.activo));
    assert.ok(refs.rows.some((r) => r.codigo === 'extraccion_indicada' && r.activo));
    assert.ok(refs.rows.some((r) => r.codigo === 'ausente' && !r.activo));
    console.log('OK - migracion de referencias validada en copia aislada');
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
