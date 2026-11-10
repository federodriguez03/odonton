const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function main() {
  if (process.env.DB_NAME !== 'odonton_ficha_20261109_test') throw new Error('Base rechazada: esta migración sólo puede aplicarse a la base aislada de prueba');
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  try {
    const snapshotBefore = await pool.query("SELECT md5(COALESCE(string_agg(concat_ws(':', id, COALESCE(odontograma_snapshot::text, '')), '|' ORDER BY id), '')) AS digest FROM historias_clinicas");
    const coronaMarksBefore = await pool.query("SELECT COUNT(*)::int AS cantidad FROM odontograma WHERE estado = 'corona'");
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', '2026-11-10_odontograma_corona_completa.sql'), 'utf8');
    await pool.query(sql);
    const result = await pool.query("SELECT codigo, alcance, activo FROM odontograma_referencias WHERE codigo IN ('corona', 'corona_completa') ORDER BY codigo");
    const snapshotAfter = await pool.query("SELECT md5(COALESCE(string_agg(concat_ws(':', id, COALESCE(odontograma_snapshot::text, '')), '|' ORDER BY id), '')) AS digest FROM historias_clinicas");
    const coronaMarksAfter = await pool.query("SELECT COUNT(*)::int AS cantidad FROM odontograma WHERE estado = 'corona'");
    if (snapshotBefore.rows[0].digest !== snapshotAfter.rows[0].digest) throw new Error('La migración modificó snapshots históricos');
    if (coronaMarksBefore.rows[0].cantidad !== coronaMarksAfter.rows[0].cantidad) throw new Error('La migración reinterpretó marcas corona existentes');
    console.log(JSON.stringify({
      database: process.env.DB_NAME,
      referencias: result.rows,
      snapshots_intactos: true,
      marcas_corona_conservadas: true,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
