const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function main() {
  if (process.env.DB_NAME !== 'odonton_ficha_20261109_test') throw new Error('Base de prueba no configurada');
  const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE observaciones IS NULL)::int AS nulos,
              COUNT(*) FILTER (WHERE LOWER(BTRIM(observaciones)) = $1)::int AS cadenas_null
       FROM odontograma_meta`,
      ['null'],
    );
    console.log(JSON.stringify({ database: process.env.DB_NAME, ...result.rows[0] }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
