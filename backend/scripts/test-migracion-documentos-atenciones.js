const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const EXPECTED_DB = 'odonton_ficha_20261109_test';

async function main() {
  if (process.env.DB_NAME !== EXPECTED_DB) {
    throw new Error(`Base no autorizada para esta prueba: ${process.env.DB_NAME || 'sin configurar'}`);
  }
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT),
  });
  const schema = `prueba_docs_atencion_${Date.now()}`;
  await client.connect();
  try {
    const { rows } = await client.query('SELECT current_database() AS db');
    assert.equal(rows[0].db, EXPECTED_DB);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`CREATE TABLE ${schema}.historias_clinicas (LIKE public.historias_clinicas INCLUDING ALL)`);
    await client.query(`CREATE TABLE ${schema}.documentos_paciente (LIKE public.documentos_paciente INCLUDING ALL)`);
    await client.query(`SET search_path TO ${schema}`);

    const migrationPath = path.join(__dirname, '..', '..', 'database', '2026-11-09_documentos_por_atencion.sql');
    const migration = await fs.readFile(migrationPath, 'utf8');
    await client.query(migration);

    const column = await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'documentos_paciente' AND column_name = 'historia_clinica_id'`,
      [schema],
    );
    assert.equal(column.rows[0]?.is_nullable, 'YES');

    const index = await client.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = $1
       AND indexname = 'idx_documentos_paciente_historia_clinica'`,
      [schema],
    );
    assert.equal(index.rowCount, 1);
    console.log(`OK - migracion aditiva validada en copia aislada dentro de ${EXPECTED_DB}`);
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
