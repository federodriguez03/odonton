require('dotenv').config();
const { pool } = require('../src/config/db');
const prestaciones = require('../src/services/prestacionesService');
const cargos = require('../src/services/cargosService');

(async () => {
  const db = (await pool.query('SELECT current_database() db')).rows[0].db;
  if (db !== 'odonton_ficha_20261109_test') throw new Error(`Base no autorizada: ${db}`);
  const user = (await pool.query('SELECT id FROM usuarios ORDER BY id LIMIT 1')).rows[0];
  const patient = (await pool.query('SELECT id FROM pacientes ORDER BY id LIMIT 1')).rows[0];
  if (!user || !patient) throw new Error('Faltan usuario o paciente de prueba');
  let item; let cargo;
  try {
    const suffix = Date.now();
    item = await prestaciones.crearPrestacion({ codigo:`TEST-${suffix}`,nombre:`Prestacion prueba ${suffix}`,categoria:'Prueba',duracion_minutos:15,precio_modalidad:'fijo',precio_base:1234,activo:true }, user.id);
    item = await prestaciones.actualizarPrestacion(item.id, { ...item, precio_modalidad:'a_convenir',precio_base:null }, user.id);
    await prestaciones.setActivoPrestacion(item.id,false,user.id);
    await prestaciones.setActivoPrestacion(item.id,true,user.id);
    item = await prestaciones.actualizarPrestacion(item.id, { ...item, activo:true,precio_modalidad:'sin_definir',precio_base:null }, user.id);
    cargo = await cargos.crearCargo({ paciente_id:patient.id,prestacion_id:item.id,concepto:item.nombre,importe_total:'2500.00' });
    const audit = await pool.query('SELECT accion,valores_anteriores,valores_nuevos FROM prestaciones_historial WHERE prestacion_id=$1 ORDER BY id',[item.id]);
    if (audit.rowCount !== 5 || cargo.importe_total !== '2500.00') throw new Error('Verificacion de auditoria o cargo incompleta');
    console.log(JSON.stringify({ ok:true,database:db,modalidad:item.precio_modalidad,cargo_importe: cargo.importe_total,auditorias:audit.rows.map(r=>r.accion) }));
  } finally {
    if (cargo) await pool.query('DELETE FROM cargos WHERE id=$1',[cargo.id]);
    if (item) { await pool.query('DELETE FROM prestaciones_historial WHERE prestacion_id=$1',[item.id]); await pool.query('DELETE FROM prestaciones WHERE id=$1',[item.id]); }
    await pool.end();
  }
})().catch((error)=>{ console.error(error); process.exitCode=1; });
