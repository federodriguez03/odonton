require('dotenv').config();
const { pool } = require('../src/config/db');
(async () => {
  const { rows } = await pool.query(`
    SELECT LOWER(BTRIM(observaciones)) AS valor, COUNT(*)::int AS cantidad
    FROM odontograma_meta
    WHERE LOWER(BTRIM(observaciones)) IN ('null', 'undefined')
    GROUP BY 1 ORDER BY 1
  `);
  console.log(JSON.stringify(rows));
  await pool.end();
})().catch(async (error) => { console.error(error.message); await pool.end(); process.exitCode = 1; });
