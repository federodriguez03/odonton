require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
process.env.TZ = 'America/Buenos_Aires';
const assert = require('node:assert/strict');
const http = require('node:http');
const { app } = require('../src/app');
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');
const { generarToken } = require('../src/utils/jwt');
const turnos = require('../src/services/turnosService');

const general = { alcance: 'general', usuario_id: 2 };
const iso = (day, hour, minute = 0) => new Date(`2026-12-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
const sumarMinutos = (date, minutes) => new Date(date.getTime() + Number(minutes) * 60000);

async function request(base, url, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

async function main() {
  const database = pool.options.database || process.env.DB_NAME;
  validarEntornoDemo(process.env, process.argv.slice(2), database);
  const destino = (await pool.query('SELECT current_database() db,inet_server_addr()::text host')).rows[0];
  if (destino.db !== 'odonton_ficha_20261109_test' || !['localhost', '127.0.0.1', '::1'].includes(pool.options.host)) {
    throw new Error('La prueba sólo admite la base local aislada');
  }
  console.log(JSON.stringify({ destino }));

  const ids = { usuarios: [], perfiles: [], pacientes: [], turnos: [] };
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const stamp = Date.now();
    for (const [nombre, perfilActivo] of [['Odontólogo agenda alterno', true], ['Odontólogo agenda inactivo', false]]) {
      const usuario = (await pool.query(
        `INSERT INTO usuarios(nombre,email,password_hash,activo,es_demo,updated_at)
         VALUES($1,$2,'TEST_ONLY_NOT_LOGIN',TRUE,TRUE,NOW()) RETURNING id`,
        [nombre, `agenda.${ids.usuarios.length}.${stamp}@odonton.test`],
      )).rows[0];
      ids.usuarios.push(usuario.id);
      await pool.query(`INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
        SELECT $1,id,1 FROM roles WHERE codigo='odontologo'`, [usuario.id]);
      const perfil = (await pool.query(
        `INSERT INTO profesionales(usuario_id,nombre_mostrado,activo,es_ficticio)
         VALUES($1,$2,$3,TRUE) RETURNING id`, [usuario.id, nombre, perfilActivo],
      )).rows[0];
      ids.perfiles.push(perfil.id);
    }
    for (let i = 0; i < 4; i += 1) {
      const paciente = (await pool.query(
        `INSERT INTO pacientes(nombre,apellido,dni,created_at,updated_at)
         VALUES('Prueba','Agenda',$1,NOW(),NOW()) RETURNING id`,
        [String(96000000 + (stamp % 100000) + i)],
      )).rows[0];
      ids.pacientes.push(paciente.id);
    }
    const prestacion = (await pool.query(
      `SELECT id,duracion_minutos FROM prestaciones WHERE COALESCE(activo,TRUE)=TRUE AND duracion_minutos>=15 ORDER BY id LIMIT 1`,
    )).rows[0];
    assert.ok(prestacion);

    const admin = generarToken({ userId: 1 });
    const recepcion = generarToken({ userId: 2 });
    const odontologo = generarToken({ userId: 3 });
    const otroOdontologo = generarToken({ userId: ids.usuarios[0] });
    const inactivo = generarToken({ userId: ids.usuarios[1] });

    assert.equal((await request(base, '/api/turnos', { token: admin })).status, 403);
    assert.equal((await request(base, '/api/prestaciones', { token: admin })).status, 403);
    const profesionales = await request(base, '/api/turnos/profesionales', { token: recepcion });
    assert.equal(profesionales.status, 200);
    assert.ok(profesionales.data.profesionales.some((p) => p.id === 2));
    assert.ok(profesionales.data.profesionales.some((p) => p.id === ids.perfiles[0]));
    assert.equal(profesionales.data.profesionales.some((p) => p.id === 1 || p.id === ids.perfiles[1]), false);
    const propios = await request(base, '/api/turnos/profesionales', { token: odontologo });
    assert.deepEqual(propios.data.profesionales.map((p) => p.id), [2]);
    assert.equal((await request(base, '/api/prestaciones', { token: recepcion })).status, 200);
    assert.equal((await request(base, '/api/prestaciones', { token: odontologo })).status, 200);

    const baseBody = { pacienteId: ids.pacientes[0], prestacionId: prestacion.id, profesionalId: 2, fechaHoraInicio: iso(1, 14).toISOString() };
    const [altaA, altaB] = await Promise.all([
      request(base, '/api/turnos', { token: recepcion, method: 'POST', body: baseBody }),
      request(base, '/api/turnos', { token: recepcion, method: 'POST', body: { ...baseBody, pacienteId: ids.pacientes[1] } }),
    ]);
    assert.deepEqual([altaA.status, altaB.status].sort(), [201, 409]);
    const altaGanadora = altaA.status === 201 ? altaA : altaB;
    ids.turnos.push(altaGanadora.data.turno.id);
    const guardado = (await pool.query('SELECT profesional_id,profesional_perfil_id,creado_por_usuario_id FROM turnos WHERE id=$1', [altaGanadora.data.turno.id])).rows[0];
    assert.deepEqual(guardado, { profesional_id: null, profesional_perfil_id: 2, creado_por_usuario_id: 2 });

    const distinto = await request(base, '/api/turnos', { token: recepcion, method: 'POST', body: {
      ...baseBody, pacienteId: ids.pacientes[2], profesionalId: ids.perfiles[0],
    } });
    assert.equal(distinto.status, 201);
    ids.turnos.push(distinto.data.turno.id);
    const consecutivo = await request(base, '/api/turnos', { token: recepcion, method: 'POST', body: {
      ...baseBody, pacienteId: ids.pacientes[3], fechaHoraInicio: sumarMinutos(iso(1, 14), prestacion.duracion_minutos).toISOString(),
    } });
    assert.equal(consecutivo.status, 201);
    ids.turnos.push(consecutivo.data.turno.id);

    assert.equal((await request(base, `/api/turnos/${distinto.data.turno.id}`, { token: odontologo })).status, 403);
    assert.equal((await request(base, `/api/turnos?profesional_id=${ids.perfiles[0]}`, { token: odontologo })).status, 403);
    assert.equal((await request(base, '/api/turnos', { token: otroOdontologo })).data.turnos.every((t) => t.profesional.id === ids.perfiles[0]), true);
    assert.equal((await request(base, '/api/turnos', { token: inactivo })).status, 403);
    assert.equal((await request(base, '/api/turnos', { token: recepcion })).data.turnos.some((t) => Object.hasOwn(t, 'observaciones')), false);

    await pool.query(`INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
      SELECT 3,id,1 FROM roles WHERE codigo='recepcion' ON CONFLICT DO NOTHING`);
    assert.equal((await request(base, `/api/turnos/${distinto.data.turno.id}`, { token: odontologo })).status, 200);
    await pool.query(`DELETE FROM usuarios_roles WHERE usuario_id=3 AND rol_id=(SELECT id FROM roles WHERE codigo='recepcion')`);

    await assert.rejects(
      turnos.crearTurno({ ...baseBody, fechaHoraInicio: iso(2, 14), profesionalId: ids.perfiles[1], acceso: general }),
      /no existe o no esta activo/,
    );

    const crear = async (pacienteId, fecha) => {
      const t = await turnos.crearTurno({ pacienteId, prestacionId: prestacion.id, profesionalId: 2, fechaHoraInicio: fecha, acceso: general });
      ids.turnos.push(t.id); return t;
    };
    const e1 = await crear(ids.pacientes[0], iso(3, 10));
    const e2 = await crear(ids.pacientes[1], iso(3, 12));
    const editar = (id, pacienteId) => turnos.editarTurno(id, {
      pacienteId, prestacionId: prestacion.id, profesionalId: 2, fechaHoraInicio: iso(3, 16), acceso: general,
    });
    const ediciones = await Promise.allSettled([editar(e1.id, ids.pacientes[0]), editar(e2.id, ids.pacientes[1])]);
    assert.deepEqual(ediciones.map((r) => r.status).sort(), ['fulfilled', 'rejected']);

    const r1 = await crear(ids.pacientes[2], iso(4, 10));
    const r2 = await crear(ids.pacientes[3], iso(4, 12));
    const repro = (id) => turnos.reprogramarTurno(id, iso(4, 17), sumarMinutos(iso(4, 17), prestacion.duracion_minutos), { acceso: general });
    const reprogramaciones = await Promise.allSettled([repro(r1.id), repro(r2.id)]);
    assert.deepEqual(reprogramaciones.map((r) => r.status).sort(), ['fulfilled', 'rejected']);

    await request(base, `/api/turnos/${altaGanadora.data.turno.id}/cancelar`, { token: recepcion, method: 'PUT', body: {} });
    const liberado = await request(base, '/api/turnos', { token: recepcion, method: 'POST', body: { ...baseBody, pacienteId: ids.pacientes[1] } });
    assert.equal(liberado.status, 201);
    ids.turnos.push(liberado.data.turno.id);

    const historicos = await pool.query(`SELECT COUNT(*)::int total FROM turnos a JOIN turnos b ON a.id<b.id
      AND a.profesional_perfil_id=b.profesional_perfil_id
      AND a.estado IN ('programado','reprogramado','confirmado') AND b.estado IN ('programado','reprogramado','confirmado')
      AND a.fecha_hora_inicio<b.fecha_hora_fin AND a.fecha_hora_fin>b.fecha_hora_inicio
      WHERE a.profesional_perfil_id=1`);
    assert.equal(historicos.rows[0].total, 5);
    await assert.rejects(
      pool.query(
        `INSERT INTO turnos(paciente_id,prestacion_id,profesional_perfil_id,fecha_hora_inicio,fecha_hora_fin,estado,origen)
         VALUES($1,$2,1,'2026-11-10T13:00:00Z','2026-11-10T13:45:00Z','programado','test')`,
        [ids.pacientes[0], prestacion.id],
      ),
      (error) => error.code === '23P01',
    );

    console.log('OK - permisos de recepción, agenda propia y roles combinados');
    console.log('OK - perfiles activos, usuario actor y profesional responsable separados');
    console.log('OK - concurrencia de altas, ediciones y reprogramaciones protegida');
    console.log('OK - profesionales distintos, intervalos consecutivos y cancelación liberan disponibilidad');
    console.log('OK - los históricos se conservan y también bloquean nuevas superposiciones');
  } finally {
    await pool.query(`DELETE FROM usuarios_roles WHERE usuario_id=3 AND rol_id=(SELECT id FROM roles WHERE codigo='recepcion')`).catch(() => {});
    if (ids.turnos.length) await pool.query('DELETE FROM turnos WHERE id=ANY($1::int[])', [ids.turnos]).catch(() => {});
    if (ids.pacientes.length) await pool.query('DELETE FROM pacientes WHERE id=ANY($1::int[])', [ids.pacientes]).catch(() => {});
    if (ids.perfiles.length) await pool.query('DELETE FROM profesionales WHERE id=ANY($1::int[])', [ids.perfiles]).catch(() => {});
    if (ids.usuarios.length) await pool.query('DELETE FROM usuarios_roles WHERE usuario_id=ANY($1::int[])', [ids.usuarios]).catch(() => {});
    if (ids.usuarios.length) await pool.query('DELETE FROM usuarios WHERE id=ANY($1::int[])', [ids.usuarios]).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
