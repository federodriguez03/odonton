const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../src/config/db');
const questionnaire = require('../src/domain/declaracionSaludCuestionario');
const { generarToken } = require('../src/utils/jwt');
const { app } = require('../src/app');

async function request(base, route, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}

async function main() {
  if (process.env.DB_NAME !== 'odonton_ficha_20261109_test') throw new Error('Base de prueba no configurada');
  const actor = (await pool.query("SELECT id, email FROM usuarios ORDER BY id LIMIT 1")).rows[0];
  if (!actor) throw new Error('No hay usuario local para autoría de prueba');
  const dni = `99${String(Date.now()).slice(-6)}`;
  const patient = (await pool.query("INSERT INTO pacientes (nombre, apellido, dni) VALUES ('Prueba', 'Declaracion Salud', $1) RETURNING id", [dni])).rows[0];
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = generarToken({ userId: actor.id, email: actor.email, rol: 'odontologo' });
  const receptionToken = generarToken({ userId: actor.id, email: actor.email, rol: 'recepcion' });
  try {
    assert.equal((await request(base, `/api/pacientes/${patient.id}/declaracion-salud`)).status, 401);
    assert.equal((await request(base, `/api/pacientes/${patient.id}/declaracion-salud`, { token: receptionToken })).status, 403);
    const partial = await request(base, `/api/pacientes/${patient.id}/declaracion-salud`, { token, method: 'POST', body: { respondido_por: 'paciente', respuestas: { enfermedad_actual: { answer: 'yes' } } } });
    assert.equal(partial.status, 201, JSON.stringify(partial.data));
    assert.equal(partial.data.declaracion.estado, 'incompleta');
    assert.equal(partial.data.declaracion.numero_version, 1);

    const responses = Object.fromEntries(questionnaire.questions.map((question) => [question.id, { answer: question.id === 'embarazo' ? 'not_applicable' : 'no' }]));
    responses.alergias = { answer: 'yes', details: { tipos: ['Penicilina'] } };
    const complete = await request(base, `/api/pacientes/${patient.id}/declaracion-salud`, { token, method: 'POST', body: { paciente_id: patient.id + 1, respondido_por: 'tutor', nombre_tutor: 'Tutor de prueba', respuestas: responses } });
    assert.equal(complete.status, 201, JSON.stringify(complete.data));
    assert.equal(complete.data.declaracion.estado, 'completa');
    assert.equal(complete.data.declaracion.numero_version, 2);

    const reopened = await request(base, `/api/pacientes/${patient.id}/declaracion-salud`, { token });
    assert.equal(reopened.status, 200);
    assert.equal(reopened.data.latest.paciente_id, patient.id, 'La pertenencia debe provenir de la ruta');
    assert.equal(reopened.data.versions.length, 2);
    assert.equal(reopened.data.latest.respuestas.alergias.details.tipos[0], 'Penicilina');
    assert.equal((await request(base, `/api/pacientes/${patient.id + 999999}/declaracion-salud`, { token })).status, 404);
    console.log('OK: HTTP parcial, finalización, reapertura, versiones, autenticación y pertenencia.');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await pool.query('DELETE FROM pacientes WHERE id = $1', [patient.id]);
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
