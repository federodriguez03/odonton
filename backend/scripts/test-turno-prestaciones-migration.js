const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

async function main() {
  const admin = new Client({
    host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: 'postgres',
  });
  const isolatedName = `odonton_turno_prestaciones_${Date.now()}`;
  await admin.connect();
  try {
    const source = new Client({
      host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
    });
    await source.connect();
    const prestaciones = await source.query('SELECT id, nombre, duracion_minutos FROM prestaciones ORDER BY id');
    const turnos = await source.query('SELECT id, prestacion_id, fecha_hora_inicio, fecha_hora_fin FROM turnos ORDER BY id');
    await source.end();
    await admin.query(`CREATE DATABASE ${isolatedName}`);
    const isolated = new Client({
      host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
      password: process.env.DB_PASSWORD, database: isolatedName,
    });
    await isolated.connect();
    try {
      await isolated.query(`
        CREATE TABLE prestaciones (id INTEGER PRIMARY KEY, nombre VARCHAR(100) NOT NULL, duracion_minutos INTEGER NOT NULL);
        CREATE TABLE turnos (id INTEGER PRIMARY KEY, prestacion_id INTEGER REFERENCES prestaciones(id), fecha_hora_inicio TIMESTAMPTZ, fecha_hora_fin TIMESTAMPTZ);
      `);
      for (const row of prestaciones.rows) {
        await isolated.query('INSERT INTO prestaciones VALUES ($1,$2,$3)', [row.id, row.nombre, row.duracion_minutos]);
      }
      for (const row of turnos.rows) {
        await isolated.query('INSERT INTO turnos VALUES ($1,$2,$3,$4)', [row.id, row.prestacion_id, row.fecha_hora_inicio, row.fecha_hora_fin]);
      }
      const before = await isolated.query('SELECT id, prestacion_id, fecha_hora_inicio, fecha_hora_fin FROM turnos ORDER BY id');
      const sql = await fs.readFile(path.join(__dirname, '..', '..', 'database', '2026-11-10_turno_prestaciones.sql'), 'utf8');
      await isolated.query(sql);
      await isolated.query(sql);
      const after = await isolated.query('SELECT id, prestacion_id, fecha_hora_inicio, fecha_hora_fin FROM turnos ORDER BY id');
      assert.deepEqual(after.rows, before.rows);
      const expected = await isolated.query('SELECT COUNT(*)::int total FROM turnos WHERE prestacion_id IS NOT NULL');
      const copied = await isolated.query('SELECT COUNT(*)::int total FROM turno_prestaciones');
      assert.equal(copied.rows[0].total, expected.rows[0].total);
      const duplicates = await isolated.query('SELECT turno_id, prestacion_id, COUNT(*) FROM turno_prestaciones GROUP BY 1,2 HAVING COUNT(*) > 1');
      assert.equal(duplicates.rowCount, 0);
      console.log(JSON.stringify({ isolated_database: isolatedName, turns_unchanged: before.rowCount, copied: copied.rows[0].total, reentrant: true }));
    } finally {
      await isolated.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${isolatedName}`);
    await admin.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
