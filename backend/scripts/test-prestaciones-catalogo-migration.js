require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const tempDb = `odonton_prestaciones_mig_${Date.now()}`;
const base = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const admin = new Client({ ...base, database: 'postgres' });

(async () => {
  let test;
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${tempDb}"`);
    test = new Client({ ...base, database: tempDb });
    await test.connect();
    await test.query(`CREATE TABLE usuarios(id SERIAL PRIMARY KEY);
      CREATE TABLE prestaciones(id SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,duracion_minutos INTEGER NOT NULL,precio_base NUMERIC(10,2),activo BOOLEAN DEFAULT true,updated_at TIMESTAMPTZ);
      INSERT INTO prestaciones(nombre,duracion_minutos,precio_base) VALUES ('Positiva',30,1500),('Cero ambiguo',45,0),('Sin precio',15,NULL);`);
    const sql = fs.readFileSync(path.join(__dirname, '../../database/2026-11-10_prestaciones_catalogo_individual.sql'), 'utf8');
    await test.query(sql);
    await test.query(sql);
    const { rows } = await test.query('SELECT id,nombre,duracion_minutos,precio_base,precio_modalidad FROM prestaciones ORDER BY id');
    if (rows[0].precio_modalidad !== 'fijo' || rows[1].precio_modalidad !== null || rows[2].precio_modalidad !== 'sin_definir') throw new Error('Clasificacion inesperada');
    if (rows.some((row, index) => Number(row.id) !== index + 1) || Number(rows[1].precio_base) !== 0) throw new Error('La migracion altero datos base');
    console.log(JSON.stringify({ ok: true, database: tempDb, rows }, null, 2));
  } finally {
    if (test) await test.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS "${tempDb}" WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
