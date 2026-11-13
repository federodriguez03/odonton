require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
const questionnaire = require('../src/domain/declaracionSaludCuestionario');

const TARGET_DATABASE = 'odonton_demo_2026';
const GENERATOR_ID = 'odonton-demo-2026-v1';
const SEED = 20261208;
const CUTOFF = process.env.DEMO_CUTOFF_DATE || '2026-11-13';
const SOURCE_DATABASE = process.env.DEMO_SCHEMA_SOURCE_DATABASE || 'odonton_ficha_20261109_test';
const FIXED_NOW = `${CUTOFF}T12:00:00-03:00`;
const TABLES_FOR_SIGNATURE = [
  'roles', 'usuarios', 'usuarios_roles', 'usuarios_roles_vigentes', 'identidad_roles_historial',
  'profesionales', 'profesionales_horarios_atencion', 'configuracion_consultorio',
  'configuracion_horarios_atencion', 'prestaciones', 'prestaciones_historial', 'arancel_versiones',
  'arancel_referencias', 'prestacion_arancel_referencias', 'odontograma_referencias', 'pacientes',
  'turnos', 'turno_prestaciones', 'historias_clinicas', 'historias_clinicas_revisiones', 'odontograma',
  'odontograma_meta', 'tratamientos', 'protesis_fijas', 'protesis_removibles', 'declaraciones_salud',
  'cargos', 'pagos', 'documentos_paciente', 'turno_solicitudes', 'auditoria',
];

function config(database) {
  return { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database };
}
function rngFactory(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = rngFactory(SEED);
const pick = (items) => items[Math.floor(rng() * items.length) % items.length];
const pad = (value) => String(value).padStart(2, '0');
const dateOnly = (value) => String(value).slice(0, 10);
const postgresDate = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : dateOnly(value);
const localTimestamp = (date, hour, minute = 0) => `${date}T${pad(hour)}:${pad(minute)}:00-03:00`;
const addMinutes = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
const minDate = (a, b) => (a < b ? a : b);

function requiredPassword(name) {
  const value = process.env[name];
  if (!value || value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new Error(`${name} debe definirse localmente con al menos 8 caracteres, letras y números.`);
  }
  return value;
}

async function signatures(client) {
  const result = {};
  for (const table of TABLES_FOR_SIGNATURE) {
    const { rows } = await client.query(`SELECT count(*)::int AS count, COALESCE(md5(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text)), md5('')) AS hash FROM ${table} t`);
    result[table] = rows[0];
  }
  return result;
}

async function assertRerunnable(target) {
  const { rows } = await target.query('SELECT * FROM demo_generator_runs WHERE generator_id=$1', [GENERATOR_ID]);
  if (!rows.length) throw new Error('La base contiene un esquema sin marcador válido del generador demo.');
  const marker = rows[0];
  if (marker.seed !== SEED || postgresDate(marker.cutoff_date) !== CUTOFF) throw new Error('La base fue creada con otra semilla o fecha de corte.');
  if (marker.status !== 'complete') return false;
  const current = await signatures(target);
  for (const table of TABLES_FOR_SIGNATURE) {
    if (Number(current[table]?.count) !== Number(marker.signatures?.[table]?.count) || current[table]?.hash !== marker.signatures?.[table]?.hash) {
      throw new Error(`La base demo contiene cambios no identificados en ${table}; no se limpiaron ni sobrescribieron.`);
    }
  }
  console.log(JSON.stringify({ ok: true, database: TARGET_DATABASE, rerun: 'validated_without_duplicates', summary: marker.summary }));
  return true;
}

async function copyCatalog(source, client, ownerId) {
  const sourceIds = [36, 38, 39, 50, 60, 104, 106, 117, 143, 167, 188, 214];
  const { rows } = await source.query(
    `SELECT p.id source_id,p.codigo,p.nombre,p.categoria,p.precio_modalidad,
            ar.codigo ref_codigo,ar.nombre ref_nombre,ar.categoria ref_categoria,ar.precio ref_precio,
            ar.estado_precio,ar.fila_csv,ar.pagina_pdf,av.fuente,av.version_documental,av.moneda,
            av.vigencia,av.archivo_nombre,av.archivo_hash_sha256
       FROM prestaciones p
       JOIN prestacion_arancel_referencias par ON par.prestacion_id=p.id
       JOIN arancel_referencias ar ON ar.id=par.referencia_id
       JOIN arancel_versiones av ON av.id=ar.version_id
      WHERE p.id=ANY($1::int[]) ORDER BY p.id`, [sourceIds],
  );
  if (rows.length !== sourceIds.length) throw new Error('El catálogo fuente no contiene todas las prestaciones documentales requeridas.');

  const versionSource = rows[0];
  const version = await client.query(
    `INSERT INTO arancel_versiones(fuente,version_documental,moneda,vigencia,archivo_nombre,archivo_hash_sha256,creado_por_usuario_id,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [versionSource.fuente, versionSource.version_documental, versionSource.moneda, versionSource.vigencia, versionSource.archivo_nombre, versionSource.archivo_hash_sha256, ownerId, FIXED_NOW],
  );
  const durationBySource = { 36: 45, 38: 30, 39: 30, 50: 90, 60: 60, 104: 30, 106: 20, 117: 60, 143: 60, 167: 45, 188: 90, 214: 60 };
  const ownPriceBySource = { 36: 52000, 38: 61000, 39: 43000, 50: 185000, 60: 230000, 104: 38000, 106: 47000, 167: 90000 };
  const prestations = [];
  for (const row of rows) {
    const ref = await client.query(
      `INSERT INTO arancel_referencias(version_id,fila_csv,codigo,nombre,categoria,precio,estado_precio,pagina_pdf,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [version.rows[0].id, row.fila_csv, row.ref_codigo, row.ref_nombre, row.ref_categoria, row.ref_precio, row.estado_precio, row.pagina_pdf, FIXED_NOW],
    );
    const sourceMode = row.precio_modalidad || (row.ref_precio ? 'fijo' : 'sin_definir');
    const ownPrice = sourceMode === 'fijo' ? (ownPriceBySource[row.source_id] || Number(row.ref_precio || 50000)) : null;
    const prestation = await client.query(
      `INSERT INTO prestaciones(nombre,duracion_minutos,precio_base,activa,activo,updated_at,codigo,categoria,precio_modalidad,precio_inicial_referencia_id)
       VALUES($1,$2,$3,true,true,$4,$5,$6,$7,$8) RETURNING id,nombre,duracion_minutos,precio_base,precio_modalidad,codigo`,
      [row.nombre, durationBySource[row.source_id], ownPrice, FIXED_NOW, row.codigo, row.categoria || 'Catálogo documental', sourceMode, ref.rows[0].id],
    );
    await client.query('INSERT INTO prestacion_arancel_referencias(prestacion_id,referencia_id,vinculado_por_usuario_id,created_at) VALUES($1,$2,$3,$4)', [prestation.rows[0].id, ref.rows[0].id, ownerId, FIXED_NOW]);
    await client.query(`INSERT INTO prestaciones_historial(prestacion_id,usuario_id,accion,valores_nuevos,created_at) VALUES($1,$2,'demo_catalogo', $3::jsonb,$4)`, [prestation.rows[0].id, ownerId, JSON.stringify({ procedencia: 'catalogo_documental', duracion: 'estimacion_demo', precio_consultorio: 'ficticio_demo' }), FIXED_NOW]);
    prestations.push(prestation.rows[0]);
  }
  const refs = await source.query('SELECT codigo,nombre,descripcion,color,activa,heredada,alcance,activo FROM odontograma_referencias ORDER BY id');
  for (const ref of refs.rows) {
    await client.query(`INSERT INTO odontograma_referencias(codigo,nombre,descripcion,color,activa,heredada,alcance,activo,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`, [ref.codigo, ref.nombre, ref.descripcion, ref.color, ref.activa, ref.heredada, ref.alcance, ref.activo, FIXED_NOW]);
  }
  return { prestations, odontogramReferences: refs.rows };
}

function patientNames(index) {
  const first = ['Ana', 'José Luis', 'María', 'Sofía', 'Juan', 'Ángela', 'Luz', 'Tomás', 'Noé', 'Mía', 'Martín', 'Zoé', 'Jean-Luc', "D'Angelo", 'María José'];
  const last = ['García', 'Pérez', 'Núñez', 'Ocampo', 'Quiroga', 'Álvarez', 'Benítez', 'Díaz', 'López', "O'Connor", 'Paz', 'Roldán', 'Sánchez-Gómez', 'Torres', 'Véliz'];
  return { nombre: first[index % first.length], apellido: last[Math.floor(index / first.length) % last.length] };
}

function completeResponses(index) {
  const responses = {};
  for (const q of questionnaire.questions) responses[q.id] = { answer: q.answers.includes('not_applicable') ? 'not_applicable' : 'no' };
  if (index % 4 === 0) responses.alergias = { answer: 'yes', details: { tipos: ['Penicilina'], otras: 'Dato ficticio para demostración' } };
  if (index % 5 === 0) responses.medicacion_habitual = { answer: 'yes', details: { medicamentos: 'Medicación ficticia declarada' } };
  if (index % 6 === 0) responses.hipertension = { answer: 'yes', details: { control: 'Control declarado ficticio' } };
  return responses;
}

function odontogramSnapshot(patientIndex, appointmentIso, refs) {
  const refMap = Object.fromEntries(refs.map((ref) => [ref.codigo, ref]));
  const faces = ['vestibular', 'mesial', 'distal', 'oclusal', 'lingual'];
  const tooth = patientIndex % 5 === 0 ? 55 : 11 + (patientIndex % 8);
  const state = patientIndex % 3 === 0 ? 'existente' : 'sano';
  return {
    version: 1,
    capturado_at: appointmentIso,
    referencias_catalogo: refMap,
    registros: faces.slice(0, state === 'sano' ? 2 : 1).map((face, idx) => ({ odontograma_id: null, diente: tooth, cara: face, estado: idx ? 'sano' : state, nombre: refMap[idx ? 'sano' : state]?.nombre, color: refMap[idx ? 'sano' : state]?.color, fecha: appointmentIso })),
    meta: { sarro: patientIndex % 7 === 0, periodontal: false, observaciones: null, updated_at: appointmentIso },
    referencias: { tratamientos: [], protesis_fijas: [], protesis_removibles: [] },
  };
}

async function seed() {
  if (process.env.DB_NAME !== TARGET_DATABASE) throw new Error(`Base no autorizada: ${process.env.DB_NAME || '(sin nombre)'}`);
  if (!/^2026-\d{2}-\d{2}$/.test(CUTOFF)) throw new Error('DEMO_CUTOFF_DATE debe ser una fecha explícita de 2026.');
  const passwords = {
    owner: requiredPassword('DEMO_OWNER_PASSWORD'), reception: requiredPassword('DEMO_RECEPTION_PASSWORD'),
    dentists: [requiredPassword('DEMO_DENTIST_1_PASSWORD'), requiredPassword('DEMO_DENTIST_2_PASSWORD'), requiredPassword('DEMO_DENTIST_3_PASSWORD')],
  };
  const target = new Pool(config(TARGET_DATABASE));
  const source = new Pool(config(SOURCE_DATABASE));
  const actual = await target.query('SELECT current_database() db, COALESCE(inet_server_addr()::text,\'local\') host');
  if (actual.rows[0].db !== TARGET_DATABASE) throw new Error(`Conexión efectiva no autorizada: ${actual.rows[0].db}`);
  if (await assertRerunnable(target)) { await target.end(); await source.end(); return; }

  const client = await target.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT (SELECT count(*) FROM usuarios)::int usuarios,(SELECT count(*) FROM pacientes)::int pacientes,(SELECT count(*) FROM turnos)::int turnos');
    if (Object.values(existing.rows[0]).some(Number)) throw new Error('La base contiene datos previos no identificados; no se limpiaron.');

    const roleRows = {};
    for (const [code, name] of [['dueno', 'Dueño'], ['recepcion', 'Recepción'], ['odontologo', 'Odontólogo'], ['administrador', 'Administrador (compatibilidad)']]) {
      roleRows[code] = (await client.query('INSERT INTO roles(codigo,nombre) VALUES($1,$2) RETURNING id', [code, name])).rows[0].id;
    }
    const userSpecs = [
      ['Dueño Demo 2026', 'dueno.demo.2026@example.com', passwords.owner, 'dueno'],
      ['Recepción Demo 2026', 'recepcion.demo.2026@example.com', passwords.reception, 'recepcion'],
      ['Dra. Emilia Robles — ficticia', 'odontologa1.demo.2026@example.com', passwords.dentists[0], 'odontologo'],
      ['Dr. Mateo Acuña — ficticio', 'odontologo2.demo.2026@example.com', passwords.dentists[1], 'odontologo'],
      ['Dra. Inés del Valle — ficticia', 'odontologa3.demo.2026@example.com', passwords.dentists[2], 'odontologo'],
    ];
    const users = [];
    for (const [name, email, password, role] of userSpecs) {
      const hash = await bcrypt.hash(password, 10);
      const user = (await client.query(`INSERT INTO usuarios(nombre,email,password_hash,activo,puede_cobrar,debe_cambiar_password,es_demo,created_at,updated_at) VALUES($1,$2,$3,true,false,true,true,$4,$4) RETURNING id,nombre,email`, [name, email, hash, FIXED_NOW])).rows[0];
      users.push(user);
      await client.query(`INSERT INTO usuarios_roles_vigentes(usuario_id,rol_id,asignado_por_usuario_id,motivo,asignado_at) VALUES($1,$2,$3,'Generador demo 2026',$4)`, [user.id, roleRows[role], users[0]?.id || user.id, FIXED_NOW]);
      await client.query(`INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id,asignado_at) VALUES($1,$2,$3,$4)`, [user.id, roleRows[role], users[0]?.id || user.id, FIXED_NOW]);
      if (role === 'dueno') await client.query(`INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id,asignado_at) VALUES($1,$2,$1,$3)`, [user.id, roleRows.administrador, FIXED_NOW]);
      await client.query(`INSERT INTO identidad_roles_historial(usuario_id,rol_nuevo_id,actor_usuario_id,accion,motivo,detalle,created_at) VALUES($1,$2,$3,'asignar','Generador demo 2026',$4::jsonb,$5)`, [user.id, roleRows[role], users[0]?.id || user.id, JSON.stringify({ demo: true }), FIXED_NOW]);
    }
    const ownerId = users[0].id;
    const professionals = [];
    for (let i = 0; i < 3; i += 1) {
      const id = 101 + i;
      const professional = (await client.query(`INSERT INTO profesionales(id,usuario_id,nombre_mostrado,activo,es_ficticio,compatibilidad_pendiente,created_at,updated_at,vinculo_confirmado_at,vinculo_confirmado_por_usuario_id,vinculo_origen) VALUES($1,$2,$3,true,true,false,$4,$4,$4,$5,'generador_demo_2026') RETURNING id,usuario_id,nombre_mostrado`, [id, users[i + 2].id, users[i + 2].nombre, FIXED_NOW, ownerId])).rows[0];
      professionals.push(professional);
      for (let day = 1; day <= 5; day += 1) await client.query(`INSERT INTO profesionales_horarios_atencion(profesional_id,profesional_perfil_id,dia_semana,activo,hora_desde,hora_hasta,created_at,updated_at) VALUES($1,$1,$2,true,'09:00','18:00',$3,$3)`, [id, day, FIXED_NOW]);
    }
    await client.query(`INSERT INTO configuracion_consultorio(nombre_consultorio,whatsapp_numero,timezone,autogestion_keywords,created_at,updated_at) VALUES('Odonton Demo 2026',NULL,'America/Buenos_Aires','turno,cita,consulta',$1,$1)`, [FIXED_NOW]);
    for (let day = 0; day <= 6; day += 1) await client.query(`INSERT INTO configuracion_horarios_atencion(dia_semana,activo,hora_desde,hora_hasta,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$5)`, [day, day >= 1 && day <= 5, day >= 1 && day <= 5 ? '09:00' : null, day >= 1 && day <= 5 ? '18:00' : null, FIXED_NOW]);

    const catalog = await copyCatalog(source, client, ownerId);
    const patients = [];
    const nationalities = ['Argentina', 'Argentina', 'Argentina', 'Uruguay', 'Chile', 'Bolivia', null];
    for (let i = 0; i < 120; i += 1) {
      const names = patientNames(i);
      const group = i % 6;
      const birthYear = group === 0 ? 2018 : group === 1 ? 2012 : group === 2 ? 1998 : group === 3 ? 1976 : group === 4 ? 1955 : 1987;
      const birth = `${birthYear}-${pad((i % 12) + 1)}-${pad((i % 27) + 1)}`;
      const created = localTimestamp('2026-01-01', 7);
      const patient = (await client.query(`INSERT INTO pacientes(nombre,apellido,dni,nacionalidad,domicilio,telefono,email,fecha_nacimiento,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,nombre,apellido,dni,fecha_nacimiento`, [names.nombre, names.apellido, String(80000001 + i), nationalities[i % nationalities.length], i % 4 ? `Calle Demo ${i + 1}` : null, i % 10 === 0 ? `54900000${String(i).padStart(5, '0')}` : null, `paciente${String(i + 1).padStart(3, '0')}@example.com`, birth, created])).rows[0];
      patients.push(patient);
    }

    const monthTargets = [52, 55, 58, 60, 62, 64, 61, 59, 60, 62, 65, 42];
    const slots = [9, 11, 14, 16];
    const appointments = [];
    for (let month = 1; month <= 12; month += 1) {
      let made = 0;
      for (let day = 2; day <= 28 && made < monthTargets[month - 1]; day += 1) {
        const weekday = new Date(Date.UTC(2026, month - 1, day)).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        for (const hour of slots) for (let professionalIndex = 0; professionalIndex < professionals.length && made < monthTargets[month - 1]; professionalIndex += 1) {
          const index = appointments.length;
          const date = `2026-${pad(month)}-${pad(day)}`;
          const start = localTimestamp(date, hour);
          const isFuture = date > CUTOFF;
          const primary = catalog.prestations[index % catalog.prestations.length];
          let selected = [primary];
          if (index % 5 === 0) {
            const candidate = catalog.prestations[(index + 3) % catalog.prestations.length];
            if (primary.duracion_minutos + candidate.duracion_minutos <= 120) selected = [primary, candidate];
          }
          const duration = selected.reduce((sum, item) => sum + item.duracion_minutos, 0);
          let state = 'programado';
          if (!isFuture) state = ['realizado', 'realizado', 'realizado', 'cancelado', 'ausente', 'programado'][index % 6];
          const patient = patients[(index * 7 + month) % patients.length];
          const professional = professionals[professionalIndex];
          const createdDate = minDate(`2026-${pad(month)}-01`, CUTOFF);
          const turn = (await client.query(`INSERT INTO turnos(paciente_id,prestacion_id,profesional_id,profesional_perfil_id,fecha_hora_inicio,fecha_hora_fin,estado,origen,observaciones,created_at,updated_at,fecha_cancelacion,recordatorio_habilitado,creado_por_usuario_id,actualizado_por_usuario_id) VALUES($1,$2,NULL,$3,$4,$5,$6,'interno',NULL,$7,$7,$8,false,$9,$9) RETURNING id`, [patient.id, primary.id, professional.id, start, addMinutes(start, duration), state, localTimestamp(createdDate, 8), state === 'cancelado' ? addMinutes(start, -1440) : null, users[1].id])).rows[0];
          for (let order = 0; order < selected.length; order += 1) await client.query(`INSERT INTO turno_prestaciones(turno_id,prestacion_id,orden,nombre_snapshot,duracion_minutos_snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6)`, [turn.id, selected[order].id, order + 1, selected[order].nombre, selected[order].duracion_minutos, localTimestamp(createdDate, 8)]);
          appointments.push({ ...turn, patient, professional, start, state, prestations: selected, duration });
          made += 1;
        }
      }
    }

    const histories = [];
    for (const [index, turn] of appointments.filter((item) => item.state === 'realizado').entries()) {
      if (index % 4 === 0) continue;
      const snapshot = odontogramSnapshot(turn.patient.id, turn.start, catalog.odontogramReferences);
      const description = `Atención clínica ficticia ${index + 1}. Evolución registrada sólo para demostración.`;
      const history = (await client.query(`INSERT INTO historias_clinicas(paciente_id,turno_id,descripcion,created_at,fecha_atencion,profesional_id,motivo_consulta,diagnostico,tratamientos_realizados,plan_indicaciones,observaciones,odontograma_snapshot,profesional_perfil_id,creado_por_usuario_id) VALUES($1,$2,$3,$4,$4,NULL,$5,$6,$7,NULL,$8,$9::jsonb,$10,$11) RETURNING id,paciente_id`, [turn.patient.id, turn.id, description, addMinutes(turn.start, turn.duration), 'Motivo ficticio de consulta', index % 3 ? 'Hallazgo ficticio de demostración' : null, turn.prestations.map((p) => p.nombre).join(' + '), 'Sin recomendaciones automáticas', JSON.stringify(snapshot), turn.professional.id, turn.professional.usuario_id])).rows[0];
      histories.push({ ...history, turn });
    }
    if (histories.length) {
      const first = histories[0];
      const before = { descripcion: 'Atención clínica ficticia original.' };
      const after = { descripcion: 'Atención clínica ficticia corregida.' };
      await client.query('UPDATE historias_clinicas SET descripcion=$1 WHERE id=$2', [after.descripcion, first.id]);
      await client.query(`INSERT INTO historias_clinicas_revisiones(historia_clinica_id,actor_id,corregido_at,antes,despues) VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`, [first.id, first.turn.professional.usuario_id, addMinutes(first.turn.start, first.turn.duration + 30), JSON.stringify(before), JSON.stringify(after)]);
    }

    const faces = ['vestibular', 'mesial', 'distal', 'oclusal', 'lingual'];
    for (let i = 0; i < 60; i += 1) {
      const patient = patients[i];
      const professional = professionals[i % 3];
      const child = new Date(`${patient.fecha_nacimiento}T00:00:00Z`).getUTCFullYear() >= 2015;
      const mixed = new Date(`${patient.fecha_nacimiento}T00:00:00Z`).getUTCFullYear() >= 2011 && !child;
      const tooth = child ? 55 : (mixed && i % 2 ? 64 : 11 + (i % 8));
      await client.query(`INSERT INTO odontograma(paciente_id,diente,cara,estado,fecha,actualizado_por_usuario_id,profesional_perfil_id) VALUES($1,$2,'oclusal',$3,$4,$5,$6)`, [patient.id, tooth, i % 2 ? 'existente' : 'sano', FIXED_NOW, professional.usuario_id, professional.id]);
      if (i % 6 === 0) for (const face of faces) await client.query(`INSERT INTO odontograma(paciente_id,diente,cara,estado,fecha,actualizado_por_usuario_id,profesional_perfil_id) VALUES($1,$2,$3,'corona_completa',$4,$5,$6) ON CONFLICT(paciente_id,diente,cara) DO UPDATE SET estado=EXCLUDED.estado`, [patient.id, child ? 54 : 21 + (i % 8), face, FIXED_NOW, professional.usuario_id, professional.id]);
      if (i % 7 === 0) for (const face of faces) await client.query(`INSERT INTO odontograma(paciente_id,diente,cara,estado,fecha,actualizado_por_usuario_id,profesional_perfil_id) VALUES($1,$2,$3,'pieza_ausente',$4,$5,$6) ON CONFLICT(paciente_id,diente,cara) DO UPDATE SET estado=EXCLUDED.estado`, [patient.id, child ? 65 : 31 + (i % 8), face, FIXED_NOW, professional.usuario_id, professional.id]);
      if (i % 8 === 0) await client.query(`INSERT INTO odontograma(paciente_id,diente,cara,estado,fecha,actualizado_por_usuario_id,profesional_perfil_id) VALUES($1,$2,'vestibular','extraccion_indicada',$3,$4,$5) ON CONFLICT(paciente_id,diente,cara) DO UPDATE SET estado=EXCLUDED.estado`, [patient.id, child ? 75 : 41 + (i % 8), FIXED_NOW, professional.usuario_id, professional.id]);
      await client.query(`INSERT INTO odontograma_meta(paciente_id,sarro,periodontal,observaciones,updated_at,actualizado_por_usuario_id,profesional_perfil_id) VALUES($1,$2,$3,$4,$5,$6,$7)`, [patient.id, i % 5 === 0, i % 9 === 0, i % 4 ? null : 'Observación ficticia del odontograma actual', FIXED_NOW, professional.usuario_id, professional.id]);
    }
    for (let i = 0; i < 18; i += 1) await client.query(`INSERT INTO tratamientos(paciente_id,diente,tipo,observaciones,fecha,registrado_por_usuario_id,profesional_perfil_id) VALUES($1,$2,$3,$4,$5,$6,$7)`, [patients[i].id, 11 + (i % 8), i % 2 ? 'Control' : 'Restauración', 'Tratamiento ficticio estructurado', FIXED_NOW, professionals[i % 3].usuario_id, professionals[i % 3].id]);
    for (let i = 0; i < 10; i += 1) await client.query(`INSERT INTO protesis_fijas(paciente_id,tipo,dientes,descripcion,fecha,registrado_por_usuario_id,profesional_perfil_id) VALUES($1,'puente',$2,$3,$4,$5,$6)`, [patients[20 + i].id, [11 + i % 4, 12 + i % 4], 'Prótesis fija ficticia estructurada', FIXED_NOW, professionals[i % 3].usuario_id, professionals[i % 3].id]);
    for (let i = 0; i < 8; i += 1) await client.query(`INSERT INTO protesis_removibles(paciente_id,tipo,arcada,descripcion,fecha,registrado_por_usuario_id,profesional_perfil_id) VALUES($1,'parcial',$2,$3,$4,$5,$6)`, [patients[35 + i].id, i % 2 ? 'superior' : 'inferior', 'Prótesis removible ficticia estructurada', FIXED_NOW, professionals[i % 3].usuario_id, professionals[i % 3].id]);

    for (let i = 0; i < 20; i += 1) await client.query(`INSERT INTO declaraciones_salud(paciente_id,numero_version,cuestionario_version,respondido_por,nombre_tutor,respuestas,estado,cargado_por_usuario_id,reemplaza_declaracion_id,completada_at,created_at) VALUES($1,1,$2,$3,$4,$5::jsonb,'incompleta',$6,NULL,NULL,$7)`, [patients[i].id, questionnaire.VERSION, i < 6 ? 'tutor' : 'paciente', i < 6 ? `Tutor ficticio ${i + 1}` : null, JSON.stringify({ enfermedad_actual: { answer: 'unknown' } }), professionals[i % 3].usuario_id, localTimestamp(`2026-02-${pad((i % 20) + 2)}`, 10)]);
    for (let i = 20; i < 55; i += 1) {
      const created = localTimestamp(`2026-${pad(3 + (i % 7))}-${pad((i % 20) + 2)}`, 10);
      const first = (await client.query(`INSERT INTO declaraciones_salud(paciente_id,numero_version,cuestionario_version,respondido_por,nombre_tutor,respuestas,estado,cargado_por_usuario_id,reemplaza_declaracion_id,completada_at,created_at) VALUES($1,1,$2,'paciente',NULL,$3::jsonb,'completa',$4,NULL,$5,$5) RETURNING id`, [patients[i].id, questionnaire.VERSION, JSON.stringify(completeResponses(i)), professionals[i % 3].usuario_id, created])).rows[0];
      if (i < 30) await client.query(`INSERT INTO declaraciones_salud(paciente_id,numero_version,cuestionario_version,respondido_por,nombre_tutor,respuestas,estado,cargado_por_usuario_id,reemplaza_declaracion_id,completada_at,created_at) VALUES($1,2,$2,'paciente',NULL,$3::jsonb,'completa',$4,$5,$6,$6)`, [patients[i].id, questionnaire.VERSION, JSON.stringify(completeResponses(i + 1)), professionals[i % 3].usuario_id, first.id, addMinutes(created, 1440 * 30)]);
    }

    const realized = appointments.filter((turn) => turn.state === 'realizado' && dateOnly(turn.start) <= CUTOFF).slice(0, 220);
    for (let i = 0; i < realized.length; i += 1) {
      const turn = realized[i];
      const amount = Number(turn.prestations[0].precio_base || (60000 + (i % 5) * 15000));
      const cargo = (await client.query(`INSERT INTO cargos(paciente_id,turno_id,prestacion_id,concepto,importe_total,fecha_cargo,observaciones,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,NULL,$7,$7) RETURNING id`, [turn.patient.id, turn.id, turn.prestations[0].id, turn.prestations.map((p) => p.nombre).join(' + '), amount, dateOnly(turn.start), turn.start])).rows[0];
      if (i % 4 === 0) continue;
      const method = ['efectivo', 'tarjeta', 'transferencia'][i % 3];
      if (i % 4 === 1) {
        await client.query(`INSERT INTO pagos(cargo_id,importe,metodo_pago,fecha_pago,estado,created_at,updated_at) VALUES($1,$2,$3,$4,'activo',$5,$5)`, [cargo.id, (amount / 2).toFixed(2), method, dateOnly(turn.start), turn.start]);
      } else {
        const firstPart = i % 5 === 0 ? amount / 2 : amount;
        await client.query(`INSERT INTO pagos(cargo_id,importe,metodo_pago,fecha_pago,estado,created_at,updated_at) VALUES($1,$2,$3,$4,'activo',$5,$5)`, [cargo.id, firstPart.toFixed(2), method, dateOnly(turn.start), turn.start]);
        if (firstPart < amount) {
          const secondPaymentAt = dateOnly(addMinutes(turn.start, 1440)) > CUTOFF ? `${CUTOFF}T16:00:00-03:00` : addMinutes(turn.start, 1440);
          await client.query(`INSERT INTO pagos(cargo_id,importe,metodo_pago,fecha_pago,estado,created_at,updated_at) VALUES($1,$2,'transferencia',$3,'activo',$4,$4)`, [cargo.id, (amount - firstPart).toFixed(2), dateOnly(secondPaymentAt), secondPaymentAt]);
        }
      }
      if (i > 0 && i % 37 === 0) {
        const payment = await client.query(`SELECT id FROM pagos WHERE cargo_id=$1 AND estado='activo' ORDER BY id LIMIT 1`, [cargo.id]);
        if (payment.rows[0]) await client.query(`UPDATE pagos SET estado='anulado',fecha_anulacion=$2,motivo_anulacion='Anulación ficticia trazable',anulado_por_usuario_id=$3,updated_at=$2 WHERE id=$1`, [payment.rows[0].id, addMinutes(turn.start, 60), ownerId]);
      }
    }

    const fixtureDir = path.resolve(__dirname, '..', 'uploads', 'demo-2026');
    await fs.mkdir(fixtureDir, { recursive: true });
    const pngName = 'radiografia-demo.png';
    const pdfName = 'informe-demo.pdf';
    await fs.writeFile(path.join(fixtureDir, pngName), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 56>>stream\nBT /F1 14 Tf 30 90 Td (Odonton - documento demo sintetico) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000241 00000 n \n0000000346 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n416\n%%EOF';
    await fs.writeFile(path.join(fixtureDir, pdfName), pdf, 'ascii');
    for (let i = 0; i < 24; i += 1) {
      const history = i % 2 === 0 ? histories[i % histories.length] : null;
      const isImage = i % 3 !== 0;
      await client.query(`INSERT INTO documentos_paciente(paciente_id,nombre_archivo,ruta_archivo,tipo_archivo,descripcion,fecha_subida,historia_clinica_id,subido_por_usuario_id,profesional_perfil_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [history?.paciente_id || patients[70 + i].id, isImage ? pngName : pdfName, `uploads/demo-2026/${isImage ? pngName : pdfName}`, isImage ? 'image/png' : 'application/pdf', `Archivo sintético demo ${i + 1}`, minDate(histories[i % histories.length]?.turn.start || FIXED_NOW, FIXED_NOW), history?.id || null, professionals[i % 3].usuario_id, professionals[i % 3].id]);
    }

    const futureTurns = appointments.filter((turn) => dateOnly(turn.start) > CUTOFF);
    const canceledTurns = appointments.filter((turn) => turn.state === 'cancelado');
    const requests = [
      ['primera_consulta', 'pendiente', null, null],
      ['cancelacion', 'resuelta', canceledTurns[0]?.patient || patients[0], canceledTurns[0]],
      ['reprogramacion', 'resuelta', futureTurns[0]?.patient || patients[1], futureTurns[0]],
      ['reprogramacion', 'pendiente', futureTurns[1]?.patient || patients[2], futureTurns[1]],
    ];
    if (requests[3][3]) await client.query(`UPDATE turnos SET estado='reprogramacion_solicitada' WHERE id=$1`, [requests[3][3].id]);
    for (let i = 0; i < requests.length; i += 1) {
      const [type, state, patient, turn] = requests[i];
      await client.query(`INSERT INTO turno_solicitudes(tipo_solicitud,estado,paciente_id,nombre_apellido,dni,telefono,motivo,preferencia_horaria,turno_id,observaciones,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`, [type, state, patient?.id || null, patient ? `${patient.nombre} ${patient.apellido}` : 'Paciente nuevo ficticio', patient?.dni || '89999999', `54900000999${i}`, 'Solicitud ficticia', 'Horario de demostración', turn?.id || null, 'Solicitud demo sin envío externo', minDate(turn?.start || FIXED_NOW, FIXED_NOW)]);
    }

    const orphanChecks = await client.query(`SELECT
      (SELECT count(*) FROM turnos t LEFT JOIN pacientes p ON p.id=t.paciente_id WHERE p.id IS NULL)::int +
      (SELECT count(*) FROM historias_clinicas h LEFT JOIN pacientes p ON p.id=h.paciente_id WHERE p.id IS NULL)::int +
      (SELECT count(*) FROM documentos_paciente d LEFT JOIN pacientes p ON p.id=d.paciente_id WHERE p.id IS NULL)::int AS total`);
    if (orphanChecks.rows[0].total !== 0) throw new Error('La validación detectó referencias huérfanas.');
    const overlaps = await client.query(`SELECT count(*)::int total FROM turnos a JOIN turnos b ON a.id<b.id AND a.profesional_perfil_id=b.profesional_perfil_id AND a.fecha_hora_inicio<b.fecha_hora_fin AND b.fecha_hora_inicio<a.fecha_hora_fin`);
    if (overlaps.rows[0].total !== 0) throw new Error('La validación detectó turnos solapados.');
    const futureWrites = await client.query(`SELECT ((SELECT count(*) FROM historias_clinicas WHERE COALESCE(fecha_atencion,created_at)::date>$1)+(SELECT count(*) FROM pagos WHERE fecha_pago>$1)+(SELECT count(*) FROM pagos WHERE fecha_anulacion::date>$1))::int total`, [CUTOFF]);
    if (futureWrites.rows[0].total !== 0) throw new Error('La validación detectó actividad clínica o financiera futura.');
    const invalidSequences = await client.query(`SELECT
      (SELECT count(*) FROM turnos t JOIN pacientes p ON p.id=t.paciente_id WHERE p.created_at>t.created_at OR t.created_at>t.fecha_hora_inicio) +
      (SELECT count(*) FROM historias_clinicas h JOIN turnos t ON t.id=h.turno_id WHERE h.created_at<t.fecha_hora_inicio) +
      (SELECT count(*) FROM cargos c JOIN pacientes p ON p.id=c.paciente_id WHERE c.fecha_cargo<p.created_at::date) +
      (SELECT count(*) FROM pagos p JOIN cargos c ON c.id=p.cargo_id WHERE p.fecha_pago<c.fecha_cargo) +
      (SELECT count(*) FROM declaraciones_salud d JOIN pacientes p ON p.id=d.paciente_id WHERE d.created_at<p.created_at) AS total`);
    if (Number(invalidSequences.rows[0].total) !== 0) throw new Error('La validación detectó una secuencia temporal inválida.');
    const overpayments = await client.query(`SELECT count(*)::int total FROM cargos c JOIN (SELECT cargo_id,sum(importe) total FROM pagos WHERE estado='activo' GROUP BY cargo_id) p ON p.cargo_id=c.id WHERE p.total>c.importe_total`);
    if (overpayments.rows[0].total !== 0) throw new Error('La validación detectó pagos activos excesivos.');
    const duplicateRequests = await client.query(`SELECT count(*)::int total FROM (SELECT tipo_solicitud,COALESCE(turno_id,0),dni FROM turno_solicitudes WHERE estado='pendiente' GROUP BY 1,2,3 HAVING count(*)>1) x`);
    if (duplicateRequests.rows[0].total !== 0) throw new Error('La validación detectó solicitudes activas duplicadas.');

    const monthly = (await client.query(`SELECT to_char(fecha_hora_inicio AT TIME ZONE 'America/Buenos_Aires','YYYY-MM') mes,count(*)::int cantidad FROM turnos GROUP BY 1 ORDER BY 1`)).rows;
    const counts = (await client.query(`SELECT (SELECT count(*) FROM pacientes)::int pacientes,(SELECT count(*) FROM usuarios)::int usuarios,(SELECT count(*) FROM profesionales)::int profesionales,(SELECT count(*) FROM prestaciones)::int prestaciones,(SELECT count(*) FROM turnos)::int turnos,(SELECT count(*) FROM historias_clinicas)::int atenciones,(SELECT count(*) FROM declaraciones_salud)::int declaraciones,(SELECT count(*) FROM cargos)::int cargos,(SELECT count(*) FROM pagos)::int pagos,(SELECT count(*) FROM documentos_paciente)::int archivos,(SELECT count(*) FROM turno_solicitudes)::int solicitudes`)).rows[0];
    const summary = { cutoff: CUTOFF, seed: SEED, timezone: 'America/Buenos_Aires', counts, turns_by_month: monthly };
    const signatureResult = await signatures(client);
    await client.query(`UPDATE demo_generator_runs SET status='complete',summary=$2::jsonb,signatures=$3::jsonb,completed_at=$4 WHERE generator_id=$1`, [GENERATOR_ID, JSON.stringify(summary), JSON.stringify(signatureResult), FIXED_NOW]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, database: TARGET_DATABASE, summary }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    await target.query(`UPDATE demo_generator_runs SET status='failed' WHERE generator_id=$1`, [GENERATOR_ID]).catch(() => null);
    throw error;
  } finally {
    client.release();
    await target.end();
    await source.end();
  }
}

seed().catch((error) => {
  console.error(`ERROR DEMO: ${error.message}`);
  process.exitCode = 1;
});

