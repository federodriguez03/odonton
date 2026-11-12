require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { spawn } = require('child_process');
const path = require('path');

const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const base = 'http://127.0.0.1:3198';
const suffix = Date.now();
const password = `Pac-${suffix}!`;
const ids = { usuarios: [], pacientes: [], tratamientos: [], profesionales: [] };

async function request(url, options = {}) { const response = await fetch(url, options); const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; } return { status: response.status, body }; }
async function waitFor() { for (let i = 0; i < 40; i += 1) { try { if ((await fetch(`${base}/health`)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 200)); } throw new Error('Servidor de prueba no disponible'); }
function headers(token) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
function assert(ok, message) { if (!ok) throw new Error(message); }

(async () => {
  const db = (await pool.query('SELECT current_database() db')).rows[0].db;
  if (db !== 'odonton_ficha_20261109_test') throw new Error(`Base no autorizada: ${db}`);
  let child;
  try {
    const hash = await bcrypt.hash(password, 4);
    const users = await pool.query(`INSERT INTO usuarios(nombre,email,password_hash,activo,puede_cobrar,debe_cambiar_password,es_demo,updated_at) VALUES
      ($1,$2,$5,true,false,false,true,NOW()),($1,$3,$5,true,false,false,true,NOW()),($1,$4,$5,true,false,false,true,NOW()),($1,$6,$5,true,false,false,true,NOW()) RETURNING id,email`,
      [`Paciente auth ${suffix}`, `owner.pac.${suffix}@test`, `recepcion.pac.${suffix}@test`, `odonto.pac.${suffix}@test`, hash, `odonto.sinperfil.${suffix}@test`]);
    ids.usuarios = users.rows.map((row) => row.id);
    const [owner, recepcion, odonto, sinPerfil] = users.rows;
    const roles = await pool.query("SELECT id,codigo FROM roles WHERE codigo IN ('dueno','recepcion','odontologo')");
    const role = Object.fromEntries(roles.rows.map((row) => [row.codigo, row.id]));
    await pool.query(`INSERT INTO usuarios_roles_vigentes(usuario_id,rol_id,asignado_por_usuario_id,motivo) VALUES
      ($1,$5,$1,'HTTP temporal'),($2,$6,$1,'HTTP temporal'),($3,$7,$1,'HTTP temporal'),($4,$7,$1,'HTTP temporal')`,
      [owner.id, recepcion.id, odonto.id, sinPerfil.id, role.dueno, role.recepcion, role.odontologo]);
    const profesional = await pool.query(`INSERT INTO profesionales(usuario_id,nombre_mostrado,activo,es_ficticio,compatibilidad_pendiente,vinculo_confirmado_at,vinculo_confirmado_por_usuario_id,vinculo_origen)
      VALUES($1,$2,true,false,false,NOW(),$3,'prueba_http_temporal') RETURNING id`, [odonto.id, `Odonto ${suffix}`, owner.id]);
    ids.profesionales.push(profesional.rows[0].id);
    child = spawn(process.execPath, ['src/server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '3198', REMINDERS_ENABLED: 'false', WHATSAPP_AUTO_START: 'false' }, stdio: 'ignore' });
    await waitFor();
    const tokens = {};
    for (const [name, user] of Object.entries({ owner, recepcion, odonto, sinPerfil })) {
      const login = await request(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
      assert(login.status === 200, `Login ${name}: ${JSON.stringify(login)}`); tokens[name] = login.body.token;
    }
    const dni = String(70000000 + (suffix % 20000000));
    const create = await request(`${base}/api/pacientes`, { method: 'POST', headers: headers(tokens.recepcion), body: JSON.stringify({ nombre: 'Paciente', apellido: 'Temporal', dni }) });
    assert(create.status === 201, `Recepcion no pudo crear: ${JSON.stringify(create)}`); ids.pacientes.push(create.body.paciente.id);
    assert(!('observaciones' in create.body.paciente), 'Crear filtro datos clinicos');
    const pid = create.body.paciente.id;
    await pool.query("UPDATE pacientes SET observaciones='secreto', alergias='clinico' WHERE id=$1", [pid]);
    const list = await request(`${base}/api/pacientes?q=Temporal`, { headers: headers(tokens.recepcion) });
    const detail = await request(`${base}/api/pacientes/${pid}`, { headers: headers(tokens.recepcion) });
    assert(list.status === 200 && detail.status === 200, 'Recepcion sin lectura administrativa');
    for (const result of [list.body.pacientes[0], detail.body.paciente]) assert(!('observaciones' in result) && !('alergias' in result), 'Respuesta administrativa filtra clinica');
    const rejectedCreate = await request(`${base}/api/pacientes`, { method: 'POST', headers: headers(tokens.recepcion), body: JSON.stringify({ nombre: 'No', apellido: 'Crear', dni: String(Number(dni) + 1), observaciones: 'inyectada' }) });
    const rejectedUpdate = await request(`${base}/api/pacientes/${pid}`, { method: 'PUT', headers: headers(tokens.recepcion), body: JSON.stringify({ observaciones: 'inyectada' }) });
    assert(rejectedCreate.status === 400 && rejectedUpdate.status === 400 && rejectedUpdate.body.codigo === 'CAMPOS_CLINICOS_NO_PERMITIDOS', 'Inyeccion clinica no rechazada');
    const unchanged = await pool.query('SELECT observaciones, count(*) OVER() total FROM pacientes WHERE id=$1', [pid]);
    const notCreated = await pool.query('SELECT id FROM pacientes WHERE dni=$1', [String(Number(dni) + 1)]);
    assert(unchanged.rows[0].observaciones === 'secreto' && !notCreated.rowCount, 'Un rechazo escribio datos');
    const clinicalPaths = [`/api/pacientes/${pid}/ficha-clinica`, `/api/pacientes/${pid}/declaracion-salud`, `/api/odontograma/${pid}`, `/api/tratamientos?pacienteId=${pid}`, `/api/protesis-fijas?pacienteId=${pid}`, `/api/protesis-removibles?pacienteId=${pid}`, `/api/documentos?paciente_id=${pid}`];
    for (const route of clinicalPaths) { const denied = await request(`${base}${route}`, { headers: headers(tokens.recepcion) }); assert(denied.status === 403, `Recepcion accedio a ${route}: ${denied.status}`); }
    const ownerFicha = await request(`${base}/api/pacientes/${pid}/ficha-clinica`, { headers: headers(tokens.owner) });
    const odontoFicha = await request(`${base}/api/pacientes/${pid}/ficha-clinica`, { headers: headers(tokens.odonto) });
    assert(ownerFicha.status === 200 && odontoFicha.status === 200, 'Dueño/odontologo sin acceso clinico');
    const treatment = await request(`${base}/api/tratamientos`, { method: 'POST', headers: headers(tokens.odonto), body: JSON.stringify({ paciente_id: pid, diente: 11, tipo: 'Temporal HTTP' }) });
    assert(treatment.status === 201, `Odontologo confirmado sin escritura: ${JSON.stringify(treatment)}`); ids.tratamientos.push(treatment.body.tratamiento.id);
    const before = Number((await pool.query('SELECT count(*) n FROM tratamientos WHERE paciente_id=$1', [pid])).rows[0].n);
    const deniedWrite = await request(`${base}/api/tratamientos`, { method: 'POST', headers: headers(tokens.sinPerfil), body: JSON.stringify({ paciente_id: pid, diente: 12, tipo: 'No debe' }) });
    const after = Number((await pool.query('SELECT count(*) n FROM tratamientos WHERE paciente_id=$1', [pid])).rows[0].n);
    assert(deniedWrite.status === 403 && deniedWrite.body.codigo === 'PROFESIONAL_NO_CONFIRMADO' && before === after, 'Perfil no confirmado escribio');
    const direct = await request(`${base}/uploads/documentos/inexistente.pdf`, { headers: headers(tokens.owner) });
    const receptionDownload = await request(`${base}/api/documentos/descargar/999999`, { headers: headers(tokens.recepcion) });
    assert(direct.status === 404 && receptionDownload.status === 403, 'Archivos clinicos sin proteccion');
    const prestacionesAntes = Number((await pool.query('SELECT count(*) n FROM prestaciones')).rows[0].n);
    const prestacionesOperativas = await request(`${base}/api/prestaciones`, { headers: headers(tokens.recepcion) });
    assert(prestacionesOperativas.status === 200 && Array.isArray(prestacionesOperativas.body.prestaciones) && prestacionesOperativas.body.prestaciones.every((item) => item.activo === true), 'Recepcion no obtuvo el catalogo operativo de prestaciones activas');
    const altaCatalogoDenegada = await request(`${base}/api/prestaciones`, { method: 'POST', headers: headers(tokens.recepcion), body: JSON.stringify({ nombre: `No crear ${suffix}`, duracion_minutos: 30 }) });
    const prestacionesDespues = Number((await pool.query('SELECT count(*) n FROM prestaciones')).rows[0].n);
    assert(altaCatalogoDenegada.status === 403 && prestacionesAntes === prestacionesDespues, 'Recepcion pudo administrar el catalogo o el rechazo produjo una escritura');
    console.log(JSON.stringify({ ok: true, database: db, administrativo: true, separacion_clinica: true, profesional_confirmado: true, archivos_directos: direct.status, prestaciones_operativas: prestacionesOperativas.status, administracion_catalogo: altaCatalogoDenegada.status }));
  } finally {
    if (child) { child.kill('SIGKILL'); await new Promise((resolve) => child.once('exit', resolve)); }
    if (ids.tratamientos.length) await pool.query('DELETE FROM tratamientos WHERE id=ANY($1::int[])', [ids.tratamientos]);
    if (ids.pacientes.length) await pool.query('DELETE FROM pacientes WHERE id=ANY($1::int[])', [ids.pacientes]);
    if (ids.profesionales.length) await pool.query('DELETE FROM profesionales WHERE id=ANY($1::int[])', [ids.profesionales]);
    if (ids.usuarios.length) {
      await pool.query('DELETE FROM auditoria WHERE usuario_id=ANY($1::int[])', [ids.usuarios]);
      await pool.query('DELETE FROM usuarios_roles_vigentes WHERE usuario_id=ANY($1::int[])', [ids.usuarios]);
      await pool.query('DELETE FROM usuarios WHERE id=ANY($1::int[])', [ids.usuarios]);
    }
    await pool.end();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
