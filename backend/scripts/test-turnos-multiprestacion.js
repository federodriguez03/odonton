const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');
const turnos = require('../src/services/turnosService');
const pacientes = require('../src/services/pacientesService');

async function main() {
  if (process.env.DB_NAME !== 'odonton_ficha_20261109_test') throw new Error('Base de prueba no autorizada');
  const prestacionesOriginales = (await pool.query('SELECT id,nombre,duracion_minutos FROM prestaciones WHERE activo=true ORDER BY id LIMIT 3')).rows;
  assert.equal(prestacionesOriginales.length, 3);
  const profesional = (await pool.query('SELECT id FROM usuarios WHERE activo=true ORDER BY id LIMIT 1')).rows[0];
  assert.ok(profesional);
  const horarioAnterior = (await pool.query('SELECT * FROM profesionales_horarios_atencion WHERE profesional_id=$1 AND dia_semana=1', [profesional.id])).rows[0] || null;
  const pacientesCreados = [];
  let turnoId = null;
  try {
    await pool.query(`INSERT INTO profesionales_horarios_atencion(profesional_id,dia_semana,activo,hora_desde,hora_hasta)
      VALUES($1,1,true,'08:00','20:00') ON CONFLICT(profesional_id,dia_semana) DO UPDATE SET activo=true,hora_desde='08:00',hora_hasta='20:00'`, [profesional.id]);
    for (let index = 0; index < 101; index += 1) {
      const dni = `97${String(Date.now()).slice(-5)}${String(index).padStart(3, '0')}`;
      const row = (await pool.query("INSERT INTO pacientes(nombre,apellido,dni) VALUES($1,'Busqueda Remota',$2) RETURNING id,dni", [`Ficticio ${index}`, dni])).rows[0];
      pacientesCreados.push(row);
    }
    const paciente = pacientesCreados[100];
    const encontrado = await pacientes.listarPacientes({ q: paciente.dni, page: 1, limit: 20 });
    assert.equal(encontrado.pacientes[0].id, paciente.id);

    const inicio = new Date('2027-01-04T09:00:00-03:00');
    const creado = await turnos.crearTurno({ pacienteId: paciente.id, prestacionIds: prestacionesOriginales.slice(0, 2).map(p => p.id), profesionalId: profesional.id, fechaHoraInicio: inicio });
    turnoId = creado.id;
    assert.equal(creado.duracion_minutos, Number(prestacionesOriginales[0].duracion_minutos) + Number(prestacionesOriginales[1].duracion_minutos));
    let detalle = await turnos.obtenerTurnoDetalle(turnoId);
    assert.equal(detalle.prestaciones.length, 2);
    assert.equal(detalle.prestacion.nombre, `${prestacionesOriginales[0].nombre} + ${prestacionesOriginales[1].nombre}`);

    const disponibilidad = await turnos.consultarDisponibilidad({ profesionalId: profesional.id, fecha: '2027-01-04', prestacionIds: prestacionesOriginales.slice(0, 2).map(p => p.id) });
    assert.ok(disponibilidad.some(slot => slot.inicio === '09:00' && slot.disponible === false));

    await pool.query('UPDATE prestaciones SET nombre=$1,duracion_minutos=$2 WHERE id=$3', ['Nombre temporal', 90, prestacionesOriginales[0].id]);
    const editado = await turnos.editarTurno(turnoId, { pacienteId: paciente.id, prestacionIds: prestacionesOriginales.slice(0, 2).map(p => p.id), profesionalId: profesional.id, fechaHoraInicio: new Date('2027-01-04T10:00:00-03:00') });
    assert.equal(editado.duracion_minutos, creado.duracion_minutos);
    detalle = await turnos.obtenerTurnoDetalle(turnoId);
    assert.equal(detalle.prestaciones[0].nombre, prestacionesOriginales[0].nombre);

    const editadoConCambio = await turnos.editarTurno(turnoId, { pacienteId: paciente.id, prestacionIds: prestacionesOriginales.slice(1, 3).map(p => p.id), profesionalId: profesional.id, fechaHoraInicio: new Date('2027-01-04T11:00:00-03:00') });
    const duracionEditada = Number(prestacionesOriginales[1].duracion_minutos) + Number(prestacionesOriginales[2].duracion_minutos);
    assert.equal(editadoConCambio.duracion_minutos, duracionEditada);

    const nuevaInicio = new Date('2027-01-04T13:00:00-03:00');
    const nuevaFin = new Date(nuevaInicio.getTime() + duracionEditada * 60000);
    await turnos.reprogramarTurno(turnoId, nuevaInicio, nuevaFin);
    detalle = await turnos.obtenerTurnoDetalle(turnoId);
    assert.equal(detalle.prestaciones.length, 2);
    assert.equal(new Date(detalle.fecha_hora_fin) - new Date(detalle.fecha_hora_inicio), duracionEditada * 60000);
    await assert.rejects(() => turnos.crearTurno({ pacienteId: paciente.id, prestacionIds: [prestacionesOriginales[1].id, prestacionesOriginales[1].id], profesionalId: profesional.id, fechaHoraInicio: new Date('2027-01-04T14:00:00-03:00') }), /duplicadas/);
    console.log(JSON.stringify({ database: process.env.DB_NAME, multiple_services: true, creation_duration: creado.duracion_minutos, edited_duration: duracionEditada, availability: true, historical_snapshot: true, reprogram_preserved: true, remote_patient_id: paciente.id, clinic_time: detalle.fecha_hora_inicio }));
  } finally {
    for (const prestacion of prestacionesOriginales) await pool.query('UPDATE prestaciones SET nombre=$1,duracion_minutos=$2 WHERE id=$3', [prestacion.nombre, prestacion.duracion_minutos, prestacion.id]);
    if (turnoId) await pool.query('DELETE FROM turnos WHERE id=$1', [turnoId]);
    if (pacientesCreados.length) await pool.query('DELETE FROM pacientes WHERE id=ANY($1::int[])', [pacientesCreados.map(p => p.id)]);
    if (horarioAnterior) await pool.query('UPDATE profesionales_horarios_atencion SET activo=$1,hora_desde=$2,hora_hasta=$3,updated_at=$4 WHERE id=$5', [horarioAnterior.activo, horarioAnterior.hora_desde, horarioAnterior.hora_hasta, horarioAnterior.updated_at, horarioAnterior.id]);
    else await pool.query('DELETE FROM profesionales_horarios_atencion WHERE profesional_id=$1 AND dia_semana=1', [profesional.id]);
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
