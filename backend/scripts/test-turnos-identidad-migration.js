require('dotenv').config();
const fs = require('fs'); const path = require('path'); const { Client, Pool } = require('pg');
const cfg = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD };
(async () => {
  const source = new Pool({ ...cfg, database: process.env.DB_NAME });
  const db = (await source.query('SELECT current_database() db')).rows[0].db;
  if (db !== 'odonton_ficha_20261109_test') throw new Error(`Base no autorizada: ${db}`);
  const before = (await source.query("SELECT count(*)::int total,md5(string_agg(id::text||coalesce(profesional_id::text,'')||':'||coalesce(profesional_perfil_id::text,''),',' ORDER BY id)) firma,count(profesional_perfil_id)::int vinculados FROM turnos")).rows[0];
  await source.end();
  const tmp = `odonton_turnos_identidad_${Date.now()}`;
  const admin = new Client({ ...cfg, database: 'postgres' }); admin.on('error', () => {}); await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${tmp}" TEMPLATE "${db}"`);
    const test = new Client({ ...cfg, database: tmp }); test.on('error', () => {}); await test.connect();
    const sql = fs.readFileSync(path.join(__dirname, '../../database/2026-11-10_turnos_identidad_profesional.sql'), 'utf8');
    await test.query(sql); await test.query(sql);
    const after = (await test.query("SELECT count(*)::int total,md5(string_agg(id::text||coalesce(profesional_id::text,'')||':'||coalesce(profesional_perfil_id::text,''),',' ORDER BY id)) firma,count(profesional_perfil_id)::int vinculados FROM turnos")).rows[0];
    if (after.total !== before.total || after.firma !== before.firma || after.vinculados !== before.vinculados) throw new Error('La migracion altero turnos historicos');
    console.log(JSON.stringify({ ok: true, copia: tmp, turnos: after.total, backfill: after.vinculados, reejecutable: true }));
    await test.end();
  } finally { await admin.query(`DROP DATABASE IF EXISTS "${tmp}" WITH(FORCE)`).catch(() => {}); await admin.end(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
