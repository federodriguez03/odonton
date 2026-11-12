require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
});

(async () => {
  const database = (await pool.query('SELECT current_database() database')).rows[0].database;
  if (database !== 'odonton_ficha_20261109_test') throw new Error(`Base no autorizada: ${database}`);
  const sql = fs.readFileSync(path.join(__dirname, '../../database/2026-11-10_prestaciones_catalogo_individual.sql'), 'utf8');
  await pool.query(sql);
  const summary = (await pool.query(`SELECT COUNT(*)::int total,
    COUNT(*) FILTER (WHERE precio_base=0)::int ceros_ambiguos,
    COUNT(*) FILTER (WHERE precio_modalidad='fijo')::int fijas,
    COUNT(*) FILTER (WHERE precio_modalidad='sin_definir')::int sin_definir FROM prestaciones`)).rows[0];
  console.log(JSON.stringify({ database, ...summary }));
})().finally(() => pool.end()).catch((error) => { console.error(error); process.exitCode=1; });
