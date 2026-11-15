require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
let base;
const suffix = Date.now();
const initialPassword = `Temporal-${suffix}!`;
const changedPassword = `Actualizada-${suffix}!`;
const ids = { users: [], profiles: [], patients: [], cargos: [], pagos: [] };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const headers = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}
async function waitForServer() {
  for (let index = 0; index < 40; index += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Servidor de prueba no disponible');
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

(async () => {
  const database = (await pool.query('SELECT current_database() db')).rows[0].db;
  const protectedDatabases = new Set(['odonton_db', 'odonton_ficha_20261109_test', 'odonton_demo_2026']);
  if (protectedDatabases.has(database) || !database.startsWith('odonton_tmp_validation_')) throw new Error(`Base temporal no autorizada: ${database}`);
  let child;
  try {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const hash = await bcrypt.hash(initialPassword, 4);
    const users = await pool.query(`INSERT INTO usuarios(nombre,email,password_hash,activo,puede_cobrar,debe_cambiar_password,es_demo,updated_at) VALUES
      ($1,$2,$5,true,false,false,true,NOW()),($1,$3,$5,true,false,true,true,NOW()),($1,$4,$5,true,false,false,true,NOW()) RETURNING id,email`,
    [`Permisos temporal ${suffix}`, `dueno.permisos.${suffix}@test`, `recepcion.permisos.${suffix}@test`, `odontologo.permisos.${suffix}@test`, hash]);
    ids.users = users.rows.map((row) => row.id);
    const [dueno, recepcion, odontologo] = users.rows;
    const roleRows = await pool.query("SELECT id,codigo FROM roles WHERE codigo IN ('dueno','recepcion','odontologo')");
    const roles = Object.fromEntries(roleRows.rows.map((row) => [row.codigo, row.id]));
    await pool.query(`INSERT INTO usuarios_roles_vigentes(usuario_id,rol_id,asignado_por_usuario_id,motivo) VALUES
      ($1,$4,$1,'prueba temporal'),($2,$5,$1,'prueba temporal'),($3,$6,$1,'prueba temporal')`, [dueno.id, recepcion.id, odontologo.id, roles.dueno, roles.recepcion, roles.odontologo]);
    const profile = (await pool.query(`INSERT INTO profesionales(usuario_id,nombre_mostrado,activo,es_ficticio,compatibilidad_pendiente,vinculo_confirmado_at,vinculo_confirmado_por_usuario_id,vinculo_origen)
      VALUES($1,$2,true,true,false,NOW(),$3,'test_http') RETURNING id`, [odontologo.id, `Profesional temporal ${suffix}`, dueno.id])).rows[0];
    ids.profiles.push(profile.id);
    const patient = (await pool.query(`INSERT INTO pacientes(nombre,apellido,dni,created_at,updated_at) VALUES('Paciente','Temporal',$1,NOW(),NOW()) RETURNING id`, [String(50000000 + (suffix % 30000000))])).rows[0];
    ids.patients.push(patient.id);

    child = spawn(process.execPath, ['src/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, DB_NAME: database, PORT: String(port), WHATSAPP_AUTO_START: 'false', REMINDERS_ENABLED: 'false', EXTERNAL_SENDS_ENABLED: 'false', WHATSAPP_DIAGNOSTIC_MODE: 'true' }, stdio: 'ignore' });
    await waitForServer();
    const tokens = {};
    for (const [name, user] of Object.entries({ dueno, recepcion, odontologo })) {
      const login = await request(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: initialPassword }) });
      assert(login.status === 200, `Login ${name}: ${login.status}`);
      tokens[name] = login.body.token;
      if (name === 'odontologo') assert(login.body.user.profesional_perfil_id === profile.id && login.body.user.profesional_habilitado === true, 'La identidad no diferencio usuario y perfil');
    }

    const blockedBeforeChange = await request(`${base}/api/cargos`, { headers: headers(tokens.recepcion) });
    assert(blockedBeforeChange.status === 403 && blockedBeforeChange.body.codigo === 'PASSWORD_CHANGE_REQUIRED', 'La clave temporal no bloqueo operaciones');
    const passwordChange = await request(`${base}/api/auth/cambiar-password`, { method: 'POST', headers: headers(tokens.recepcion), body: JSON.stringify({ passwordActual: initialPassword, passwordNueva: changedPassword }) });
    assert(passwordChange.status === 200 && passwordChange.body.token, 'No se pudo cambiar la clave propia');
    tokens.recepcion = passwordChange.body.token;

    const roleSurnames = ['Dueno', 'Recepcion', 'Odontologo'];
    const patientPayload = (suffixValue) => ({ nombre: 'Paciente', apellido: roleSurnames[suffixValue - 1], dni: String(60000000 + ((suffix + suffixValue) % 30000000)) });
    for (const [index, roleName] of ['dueno', 'recepcion', 'odontologo'].entries()) {
      const created = await request(`${base}/api/pacientes`, { method: 'POST', headers: headers(tokens[roleName]), body: JSON.stringify(patientPayload(index + 1)) });
      assert(created.status === 201, `${roleName} no pudo crear paciente administrativo: ${created.status} ${JSON.stringify(created.body)}`);
      assert(!('observaciones' in created.body.paciente) && !('alergias' in created.body.paciente), `${roleName} recibio campos clinicos en alta administrativa`);
      ids.patients.push(created.body.paciente.id);
    }

    await pool.query("UPDATE pacientes SET observaciones='secreto temporal', alergias='alergia temporal' WHERE id=$1", [patient.id]);
    const receptionList = await request(`${base}/api/pacientes?q=Temporal`, { headers: headers(tokens.recepcion) });
    const receptionDetail = await request(`${base}/api/pacientes/${patient.id}`, { headers: headers(tokens.recepcion) });
    assert(receptionList.status === 200 && receptionDetail.status === 200, 'Recepcion no pudo consultar pacientes administrativos');
    assert(!JSON.stringify(receptionList.body).includes('secreto temporal') && !JSON.stringify(receptionList.body).includes('alergia temporal'), 'Listado administrativo filtro datos clinicos');
    assert(!('observaciones' in receptionDetail.body.paciente) && !('alergias' in receptionDetail.body.paciente), 'Detalle administrativo filtro datos clinicos');
    const beforeClinical = (await pool.query('SELECT observaciones FROM pacientes WHERE id=$1', [patient.id])).rows[0].observaciones;
    const injection = await request(`${base}/api/pacientes/${patient.id}`, { method: 'PUT', headers: headers(tokens.recepcion), body: JSON.stringify({ observaciones: 'inyeccion no autorizada' }) });
    const afterClinical = (await pool.query('SELECT observaciones FROM pacientes WHERE id=$1', [patient.id])).rows[0].observaciones;
    assert(injection.status === 400 && injection.body.codigo === 'CAMPOS_CLINICOS_NO_PERMITIDOS' && beforeClinical === afterClinical, 'El rechazo de campo clinico fue incorrecto o produjo escritura');

    const cargo = await request(`${base}/api/cargos`, { method: 'POST', headers: headers(tokens.recepcion), body: JSON.stringify({ paciente_id: patient.id, concepto: 'Prueba operativa temporal', importe_total: '1000.00' }) });
    assert(cargo.status === 201, `Recepcion no creo cargo: ${cargo.status}`); ids.cargos.push(cargo.body.cargo.id);
    const pago = await request(`${base}/api/pagos`, { method: 'POST', headers: headers(tokens.recepcion), body: JSON.stringify({ cargo_id: cargo.body.cargo.id, importe: '400.00', metodo_pago: 'efectivo' }) });
    assert(pago.status === 201, `Recepcion no registro pago: ${pago.status}`); ids.pagos.push(pago.body.pago.id);
    const receipt = await request(`${base}/api/pagos/${pago.body.pago.id}/constancia`, { headers: headers(tokens.recepcion) });
    const balance = await request(`${base}/api/cargos/${cargo.body.cargo.id}`, { headers: headers(tokens.recepcion) });
    assert(receipt.status === 200 && balance.status === 200 && balance.body.cargo.saldo === '600.00', 'Constancia o saldo no disponible para Recepcion');
    const receptionAnnul = await request(`${base}/api/pagos/${pago.body.pago.id}/anular`, { method: 'POST', headers: headers(tokens.recepcion), body: JSON.stringify({ motivo: 'No debe permitirse' }) });
    const paymentAfterReception = (await pool.query('SELECT estado, anulado_por_usuario_id FROM pagos WHERE id=$1', [pago.body.pago.id])).rows[0];
    assert(receptionAnnul.status === 403 && receptionAnnul.body.codigo === 'ANULACION_FINANCIERA_DENEGADA' && paymentAfterReception.estado === 'activo' && paymentAfterReception.anulado_por_usuario_id === null, 'Recepcion pudo anular un pago o el rechazo produjo una escritura');

    const today = new Date().toISOString().slice(0, 10);
    const report = await request(`${base}/api/reportes/resumen?fecha_desde=${today}&fecha_hasta=${today}`, { headers: headers(tokens.recepcion) });
    assert(report.status === 200 && report.body.agenda && !report.body.clinico && !JSON.stringify(report.body).includes('observaciones'), 'Reporte operativo expuso estructura clinica');
    const clinicalPaths = [`/api/pacientes/${patient.id}/ficha-clinica`, `/api/documentos?paciente_id=${patient.id}`, `/api/odontograma/${patient.id}`];
    for (const endpoint of clinicalPaths) {
      const result = await request(`${base}${endpoint}`, { headers: headers(tokens.recepcion) });
      assert(result.status === 403, `Recepcion accedio a ${endpoint}: ${result.status}`);
    }

    for (const endpoint of ['/api/cargos', '/api/pagos', `/api/pagos/${pago.body.pago.id}/constancia`, `/api/reportes/resumen?fecha_desde=${today}&fecha_hasta=${today}`, '/api/configuracion']) {
      const result = await request(`${base}${endpoint}`, { headers: headers(tokens.odontologo) });
      assert(result.status === 403, `Odontologo accedio a ${endpoint}: ${result.status}`);
    }
    const catalogBefore = Number((await pool.query('SELECT count(*) n FROM prestaciones')).rows[0].n);
    const catalogWrite = await request(`${base}/api/prestaciones`, { method: 'POST', headers: headers(tokens.odontologo), body: '{}' });
    const catalogAfter = Number((await pool.query('SELECT count(*) n FROM prestaciones')).rows[0].n);
    assert(catalogWrite.status === 403 && catalogBefore === catalogAfter, 'Odontologo pudo administrar catalogo o el rechazo produjo una escritura');

    const ownerAnnul = await request(`${base}/api/pagos/${pago.body.pago.id}/anular`, { method: 'POST', headers: headers(tokens.dueno), body: JSON.stringify({ motivo: 'Prueba temporal de trazabilidad' }) });
    assert(ownerAnnul.status === 200 && ownerAnnul.body.pago.anulado_por_usuario_id === dueno.id, 'Dueño no pudo anular con trazabilidad');
    console.log(JSON.stringify({ ok: true, database, recepcion: { cargos: 201, pagos: 201, constancia: 200, reporte_operativo: 200, anulacion: 403, clinica: 403 }, odontologo: { finanzas_reportes_configuracion: 403, profesional_perfil_id: profile.id }, dueno: { anulacion: 200 }, password_temporal: 'cambiada', datos_temporales: 'eliminados_al_finalizar' }));
  } finally {
    if (child) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
    if (ids.pagos.length) await pool.query('DELETE FROM pagos WHERE id=ANY($1::int[])', [ids.pagos]);
    if (ids.cargos.length) await pool.query('DELETE FROM cargos WHERE id=ANY($1::int[])', [ids.cargos]);
    if (ids.patients.length) await pool.query('DELETE FROM pacientes WHERE id=ANY($1::int[])', [ids.patients]);
    if (ids.profiles.length) await pool.query('DELETE FROM profesionales WHERE id=ANY($1::int[])', [ids.profiles]);
    if (ids.users.length) {
      await pool.query('DELETE FROM auditoria WHERE usuario_id=ANY($1::int[])', [ids.users]);
      await pool.query('DELETE FROM usuarios_roles_vigentes WHERE usuario_id=ANY($1::int[])', [ids.users]);
      await pool.query('DELETE FROM usuarios WHERE id=ANY($1::int[])', [ids.users]);
    }
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
