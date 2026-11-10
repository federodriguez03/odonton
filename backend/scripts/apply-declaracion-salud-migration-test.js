const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  if (process.env.DB_NAME !== 'odonton_ficha_20261109_test') throw new Error('Base rechazada');
  const client = new Client({ user: process.env.DB_USER, host: process.env.DB_HOST, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, port: Number(process.env.DB_PORT) });
  await client.connect();
  try {
    await client.query(await fs.readFile(path.join(__dirname, '..', '..', 'database', '2026-11-10_declaraciones_salud.sql'), 'utf8'));
    console.log(JSON.stringify({ database: process.env.DB_NAME, migration: '2026-11-10_declaraciones_salud.sql', applied: true }));
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
