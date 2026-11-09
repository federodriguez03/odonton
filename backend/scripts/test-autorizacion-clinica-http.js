require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { app } = require('../src/app');
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');
const { generarToken } = require('../src/utils/jwt');

const clinicalKeys = ['observaciones', 'alergias', 'condiciones', 'estado_tratamiento', 'diagnostico'];

async function request(base, url, { token, method = 'GET', body, form } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: form || (body ? JSON.stringify(body) : undefined),
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : await response.arrayBuffer();
  return { status: response.status, data };
}

async function counts() {
  const { rows } = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM historias_clinicas) historias,
    (SELECT COUNT(*)::int FROM documentos_paciente) documentos,
    (SELECT COUNT(*)::int FROM tratamientos) tratamientos,
    (SELECT COUNT(*)::int FROM protesis_fijas) fijas,
    (SELECT COUNT(*)::int FROM protesis_removibles) removibles,
    (SELECT COUNT(*)::int FROM odontograma) odontograma`);
  return rows[0];
}

async function main() {
  const db = pool.options.database || process.env.DB_NAME;
  validarEntornoDemo(process.env, process.argv.slice(2), db);
  if (db !== 'odonton_ficha_20261109_test' || !['localhost', '127.0.0.1', '::1'].includes(pool.options.host)) {
    throw new Error('La prueba sólo admite la base local aislada odonton_ficha_20261109_test');
  }
  console.log(JSON.stringify((await pool.query('SELECT current_database() db,inet_server_addr()::text host')).rows[0]));

  const ids = { users: [], patients: [], histories: [], documents: [], files: [] };
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const stamp = Date.now();
    for (const [name, active] of [['sin rol', true], ['odontólogo sin perfil', true], ['odontólogo perfil inactivo', true]]) {
      const { rows } = await pool.query(
        `INSERT INTO usuarios(nombre,email,password_hash,activo,es_demo,updated_at)
         VALUES($1,$2,'TEST_ONLY_NOT_LOGIN', $3,TRUE,NOW()) RETURNING id`,
        [name, `${name.replaceAll(' ', '.')}.${stamp}@odonton.test`, active],
      );
      ids.users.push(rows[0].id);
    }
    await pool.query(`INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
      SELECT x.usuario_id,r.id,1 FROM (VALUES($1::int),($2::int)) x(usuario_id) CROSS JOIN roles r WHERE r.codigo='odontologo'`,
    [ids.users[1], ids.users[2]]);
    await pool.query(`INSERT INTO profesionales(usuario_id,nombre_mostrado,activo,es_ficticio)
      VALUES($1,'Perfil inactivo de prueba',FALSE,TRUE)`, [ids.users[2]]);

    for (let i = 0; i < 2; i += 1) {
      const { rows } = await pool.query(
        `INSERT INTO pacientes(nombre,apellido,dni,observaciones,alergias,condiciones,estado_tratamiento,created_at,updated_at)
         VALUES('Paciente','Autorización',$1,'CLINICO_SECRETO','ALERGIA_SECRETA','CONDICION_SECRETA','ESTADO_SECRETO',NOW(),NOW()) RETURNING id`,
        [String(97000000 + (stamp % 100000) + i)],
      );
      ids.patients.push(rows[0].id);
    }

    const admin = generarToken({ userId: 1 });
    const recepcion = generarToken({ userId: 2 });
    const odontologo = generarToken({ userId: 3 });
    const sinRol = generarToken({ userId: ids.users[0] });
    const sinPerfil = generarToken({ userId: ids.users[1] });
    const perfilInactivo = generarToken({ userId: ids.users[2] });
    const p1 = ids.patients[0];
    const p2 = ids.patients[1];

    assert.equal((await request(base, `/api/pacientes/${p1}`, { token: admin })).status, 403);
    assert.equal((await request(base, `/api/pacientes/${p1}/ficha-clinica`, { token: admin })).status, 403);
    assert.equal((await request(base, `/api/pacientes/${p1}`, { token: sinRol })).status, 403);
    const adminReceptionBefore = await pool.query(`INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
      SELECT 1,id,1 FROM roles WHERE codigo='recepcion' ON CONFLICT DO NOTHING RETURNING usuario_id`);
    assert.equal((await request(base, `/api/pacientes/${p1}`, { token: admin })).status, 200);
    if (adminReceptionBefore.rowCount) await pool.query(`DELETE FROM usuarios_roles WHERE usuario_id=1 AND rol_id=(SELECT id FROM roles WHERE codigo='recepcion')`);

    const administrativo = await request(base, `/api/pacientes/${p1}`, { token: recepcion });
    assert.equal(administrativo.status, 200);
    for (const key of clinicalKeys) assert.equal(Object.hasOwn(administrativo.data.paciente, key), false);
    const listado = await request(base, '/api/pacientes?limit=100', { token: recepcion });
    assert.equal(listado.status, 200);
    for (const paciente of listado.data.pacientes) for (const key of clinicalKeys) assert.equal(Object.hasOwn(paciente, key), false);
    const clinicalAttempt = await request(base, `/api/pacientes/${p1}`, {
      token: recepcion, method: 'PUT', body: { domicilio: 'No debe escribirse', diagnostico: 'INYECCION_CLINICA' },
    });
    assert.equal(clinicalAttempt.status, 400);
    assert.equal(clinicalAttempt.data.codigo, 'CAMPO_CLINICO_NO_PERMITIDO');
    const unchanged = await pool.query('SELECT domicilio,diagnostico FROM pacientes LEFT JOIN historias_clinicas ON FALSE WHERE pacientes.id=$1', [p1]);
    assert.notEqual(unchanged.rows[0].domicilio, 'No debe escribirse');

    const deniedBefore = await counts();
    const denied = [
      ['GET', `/api/pacientes/${p1}/ficha-clinica`], ['PUT', `/api/pacientes/${p1}/ficha-clinica`, { alergias: 'X' }],
      ['GET', `/api/pacientes/${p1}/consultas`], ['POST', `/api/pacientes/${p1}/consultas`, { motivo_consulta: 'X' }],
      ['PUT', `/api/pacientes/${p1}/consultas/999999`, { fecha_atencion: new Date().toISOString(), motivo_consulta: 'X' }],
      ['GET', `/api/odontograma/${p1}`], ['POST', '/api/odontograma', { paciente_id: p1, registros: [] }],
      ['GET', `/api/tratamientos?pacienteId=${p1}`], ['POST', '/api/tratamientos', { paciente_id: p1, diente: 11, tipo: 'X' }],
      ['GET', `/api/protesis-fijas?pacienteId=${p1}`], ['POST', '/api/protesis-fijas', { paciente_id: p1, tipo: 'X', dientes: [11] }],
      ['GET', `/api/protesis-removibles?pacienteId=${p1}`], ['POST', '/api/protesis-removibles', { paciente_id: p1, tipo: 'X', arcada: 'superior' }],
      ['GET', `/api/documentos?paciente_id=${p1}`], ['PUT', '/api/documentos/999999/asociar', { historia_clinica_id: null }],
      ['DELETE', '/api/documentos/999999'], ['GET', '/api/documentos/descargar/999999'],
    ];
    for (const [method, url, body] of denied) assert.equal((await request(base, url, { token: recepcion, method, body })).status, 403, `${method} ${url}`);
    const deniedForm = new FormData();
    deniedForm.append('paciente_id', String(p1));
    deniedForm.append('archivo', new Blob(['DENIED']), 'denied.txt');
    assert.equal((await request(base, '/api/documentos/subir', { token: recepcion, method: 'POST', form: deniedForm })).status, 403);
    assert.deepEqual(await counts(), deniedBefore);

    assert.equal((await request(base, `/api/pacientes/${p1}/consultas`, { token: sinPerfil, method: 'POST', body: { motivo_consulta: 'X' } })).status, 403);
    assert.equal((await request(base, `/api/pacientes/${p1}/consultas`, { token: perfilInactivo, method: 'POST', body: { motivo_consulta: 'X' } })).status, 403);
    assert.equal((await request(base, `/api/pacientes/${p1}/consultas`, { token: sinPerfil })).status, 200);
    await pool.query('UPDATE usuarios SET activo=FALSE WHERE id=2');
    assert.equal((await request(base, `/api/pacientes/${p1}`, { token: recepcion })).status, 401);
    await pool.query('UPDATE usuarios SET activo=TRUE WHERE id=2');

    const created = await request(base, `/api/pacientes/${p1}/consultas`, {
      token: odontologo, method: 'POST', body: { motivo_consulta: 'Control autorizado', diagnostico: 'Prueba', profesional_id: 1, profesional_perfil_id: 1 },
    });
    assert.equal(created.status, 201);
    ids.histories.push(created.data.consulta.id);
    assert.equal(created.data.consulta.profesional_id, null);
    assert.equal(created.data.consulta.profesional_perfil_id, 2);
    assert.equal(created.data.consulta.creado_por_usuario_id, 3);
    const clinicalPatient = await request(base, `/api/pacientes/${p1}/ficha-clinica`, {
      token: odontologo, method: 'PUT', body: { alergias: 'Actualizada por profesional' },
    });
    assert.equal(clinicalPatient.status, 200);

    const treatment = await request(base, '/api/tratamientos', {
      token: odontologo, method: 'POST', body: { paciente_id: p1, diente: 11, tipo: 'Control' },
    });
    assert.equal(treatment.status, 201);
    assert.equal(treatment.data.tratamiento.registrado_por_usuario_id, 3);
    assert.equal(treatment.data.tratamiento.profesional_perfil_id, 2);
    const fixed = await request(base, '/api/protesis-fijas', {
      token: odontologo, method: 'POST', body: { paciente_id: p1, tipo: 'Corona', dientes: [11] },
    });
    assert.equal(fixed.status, 201);
    assert.equal(fixed.data.protesis.registrado_por_usuario_id, 3);
    assert.equal(fixed.data.protesis.profesional_perfil_id, 2);
    const removable = await request(base, '/api/protesis-removibles', {
      token: odontologo, method: 'POST', body: { paciente_id: p1, tipo: 'Parcial', arcada: 'superior' },
    });
    assert.equal(removable.status, 201);
    assert.equal(removable.data.protesis.registrado_por_usuario_id, 3);
    assert.equal(removable.data.protesis.profesional_perfil_id, 2);
    const odonto = await request(base, '/api/odontograma', {
      token: odontologo, method: 'POST', body: { paciente_id: p1, observaciones: 'Control autorizado' },
    });
    assert.equal(odonto.status, 201);
    const odontoActor = await pool.query('SELECT actualizado_por_usuario_id,profesional_perfil_id FROM odontograma_meta WHERE paciente_id=$1', [p1]);
    assert.deepEqual(odontoActor.rows[0], { actualizado_por_usuario_id: 3, profesional_perfil_id: 2 });
    const edited = await request(base, `/api/pacientes/${p1}/consultas/${created.data.consulta.id}`, {
      token: odontologo, method: 'PUT', body: { fecha_atencion: new Date().toISOString(), motivo_consulta: 'Control corregido', profesional_id: 1 },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.consulta.profesional_perfil_id, 2);
    const revision = await pool.query('SELECT actor_id FROM historias_clinicas_revisiones WHERE historia_clinica_id=$1 ORDER BY id DESC LIMIT 1', [created.data.consulta.id]);
    assert.equal(revision.rows[0].actor_id, 3);
    assert.equal((await request(base, `/api/pacientes/${p2}/consultas/${created.data.consulta.id}`, {
      token: odontologo, method: 'PUT', body: { fecha_atencion: new Date().toISOString(), motivo_consulta: 'Cruce' },
    })).status, 404);

    const historical = await pool.query(`INSERT INTO historias_clinicas
      (paciente_id,descripcion,fecha_atencion,profesional_id,profesional_perfil_id,motivo_consulta)
      VALUES($1,'Histórica',NOW(),1,1,'Histórica') RETURNING id`, [p1]);
    ids.histories.push(historical.rows[0].id);
    const historicalEdit = await request(base, `/api/pacientes/${p1}/consultas/${historical.rows[0].id}`, {
      token: odontologo, method: 'PUT', body: { fecha_atencion: new Date().toISOString(), motivo_consulta: 'No reasignar' },
    });
    assert.equal(historicalEdit.status, 403);
    assert.equal((await pool.query('SELECT profesional_id,profesional_perfil_id,motivo_consulta FROM historias_clinicas WHERE id=$1', [historical.rows[0].id])).rows[0].motivo_consulta, 'Histórica');

    const second = await request(base, `/api/pacientes/${p2}/consultas`, { token: odontologo, method: 'POST', body: { motivo_consulta: 'Segundo paciente' } });
    assert.equal(second.status, 201);
    ids.histories.push(second.data.consulta.id);
    const form = new FormData();
    form.append('paciente_id', String(p1));
    form.append('archivo', new Blob(['CLINICAL_TEST'], { type: 'application/pdf' }), 'prueba.pdf');
    const upload = await request(base, '/api/documentos/subir', { token: odontologo, method: 'POST', form });
    assert.equal(upload.status, 201);
    ids.documents.push(upload.data.documento.id);
    assert.equal(upload.data.documento.subido_por_usuario_id, 3);
    assert.equal(upload.data.documento.profesional_perfil_id, 2);
    assert.equal(Object.hasOwn(upload.data.documento, 'ruta_archivo'), false);
    const stored = await pool.query('SELECT ruta_archivo FROM documentos_paciente WHERE id=$1', [upload.data.documento.id]);
    ids.files.push(path.join(__dirname, '..', stored.rows[0].ruta_archivo));
    assert.equal((await request(base, `/api/documentos/descargar/${upload.data.documento.id}`, { token: odontologo })).status, 200);
    const cross = await request(base, `/api/documentos/${upload.data.documento.id}/asociar`, {
      token: odontologo, method: 'PUT', body: { historia_clinica_id: second.data.consulta.id },
    });
    assert.equal(cross.status, 400);
    assert.equal((await pool.query('SELECT historia_clinica_id FROM documentos_paciente WHERE id=$1', [upload.data.documento.id])).rows[0].historia_clinica_id, null);
    assert.equal((await request(base, `/${stored.rows[0].ruta_archivo.replaceAll('\\', '/')}`)).status, 404);
    assert.equal((await request(base, `/api/documentos/${upload.data.documento.id}`, { token: odontologo, method: 'DELETE' })).status, 200);
    ids.documents.length = 0;

    console.log('OK - autorización administrativa y clínica por identidad vigente');
    console.log('OK - recepción sin exposición clínica ni escrituras indirectas');
    console.log('OK - usuario 3 y perfil profesional 2 guardados por separado');
    console.log('OK - documentos aislados por paciente y archivos sin acceso estático');
  } finally {
    await pool.query('UPDATE usuarios SET activo=TRUE WHERE id=2').catch(() => {});
    await pool.query(`DELETE FROM usuarios_roles WHERE usuario_id=1 AND rol_id=(SELECT id FROM roles WHERE codigo='recepcion')`).catch(() => {});
    if (ids.documents.length) await pool.query('DELETE FROM documentos_paciente WHERE id=ANY($1::int[])', [ids.documents]).catch(() => {});
    if (ids.histories.length) await pool.query('DELETE FROM historias_clinicas_revisiones WHERE historia_clinica_id=ANY($1::int[])', [ids.histories]).catch(() => {});
    if (ids.histories.length) await pool.query('DELETE FROM historias_clinicas WHERE id=ANY($1::int[])', [ids.histories]).catch(() => {});
    if (ids.patients.length) await pool.query('DELETE FROM pacientes WHERE id=ANY($1::int[])', [ids.patients]).catch(() => {});
    for (const file of ids.files) await fs.unlink(file).catch(() => {});
    if (ids.users.length) await pool.query('DELETE FROM profesionales WHERE usuario_id=ANY($1::int[])', [ids.users]).catch(() => {});
    if (ids.users.length) await pool.query('DELETE FROM usuarios_roles WHERE usuario_id=ANY($1::int[])', [ids.users]).catch(() => {});
    if (ids.users.length) await pool.query('DELETE FROM usuarios WHERE id=ANY($1::int[])', [ids.users]).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
