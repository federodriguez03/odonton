const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Client } = require('pg');

const PROTECTED_DATABASES = new Set(['odonton_db', 'odonton_ficha_20261109_test', 'odonton_demo_2026']);
const databaseRoot = path.resolve(__dirname, '..', '..', 'database');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function assertBaseline(client) {
  const { rows } = await client.query(`SELECT
    to_regclass('public.usuarios') IS NOT NULL usuarios,
    to_regclass('public.pacientes') IS NOT NULL pacientes,
    to_regclass('public.turnos') IS NOT NULL turnos,
    to_regclass('public.prestaciones') IS NOT NULL prestaciones`);
  if (!Object.values(rows[0]).every(Boolean)) {
    throw new Error('PREFLIGHT_BASELINE_INCOMPATIBLE: faltan tablas del esquema base');
  }
}

async function assertCanonicalSchema(client) {
  const required = [
    'auditoria.metadata', 'configuracion_consultorio.autogestion_keywords',
    'configuracion_horarios_atencion.dia_semana', 'configuracion_mensajes_automaticos.tipo',
    'documentos_paciente.historia_clinica_id', 'odontograma_meta.observaciones',
    'pacientes.alergias', 'prestaciones.activo', 'profesionales.vinculo_confirmado_at',
    'protesis_fijas.dientes', 'protesis_removibles.arcada', 'tratamientos.fecha',
    'turno_solicitudes.tipo_solicitud', 'turno_prestaciones.nombre_snapshot',
    'turnos.profesional_perfil_id', 'turnos.recordatorio_procesado_at',
    'usuarios.token_version', 'usuarios.puede_cobrar', 'usuarios.es_demo', 'usuarios.updated_at',
    'usuarios_roles_vigentes.rol_id', 'whatsapp_conversations.data', 'whatsapp_reminders.channel',
  ];
  const missing = [];
  for (const item of required) {
    const [table, column] = item.split('.');
    const result = await client.query(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2) ok`, [table, column]);
    if (!result.rows[0].ok) missing.push(item);
  }
  const trigger = await client.query(`SELECT EXISTS(SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.turnos'::regclass AND tgname='turnos_prevenir_solapamiento' AND NOT tgisinternal) ok`);
  if (!trigger.rows[0].ok) missing.push('trigger:turnos_prevenir_solapamiento');
  if (missing.length) throw new Error(`PREFLIGHT_CANONICO_INCOMPLETO: ${missing.join(', ')}`);
}

async function ensureLedger(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    nombre TEXT PRIMARY KEY,
    checksum_sha256 CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function applyFile(client, name, text) {
  const hash = checksum(text);
  const previous = await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE nombre=$1', [name]);
  if (previous.rowCount) {
    if (previous.rows[0].checksum_sha256 !== hash) throw new Error(`MIGRACION_MODIFICADA: ${name}`);
    return 'ya_aplicada';
  }
  await client.query(text);
  await client.query('INSERT INTO schema_migrations(nombre,checksum_sha256) VALUES($1,$2)', [name, hash]);
  return 'aplicada';
}

async function recordBaseline(client, name, text) {
  const hash = checksum(text);
  const previous = await client.query('SELECT checksum_sha256 FROM schema_migrations WHERE nombre=$1', [name]);
  if (previous.rowCount) {
    if (previous.rows[0].checksum_sha256 !== hash) throw new Error(`BASELINE_MODIFICADO: ${name}`);
    return 'ya_registrado';
  }
  await client.query('INSERT INTO schema_migrations(nombre,checksum_sha256) VALUES($1,$2)', [name, hash]);
  return 'registrado';
}

async function main() {
  const target = option('--database') || process.env.MIGRATION_TARGET_DATABASE;
  const confirmation = option('--confirm-database') || process.env.MIGRATION_CONFIRM_DATABASE;
  const ownerEmail = option('--owner-email') || process.env.MIGRATION_OWNER_EMAIL || '';
  if (!target || target !== confirmation) throw new Error('Debe indicar y confirmar exactamente la base destino');
  if (PROTECTED_DATABASES.has(target)) throw new Error(`Base protegida para este procedimiento: ${target}`);

  const manifest = JSON.parse(await fs.readFile(path.join(databaseRoot, 'migrations.json'), 'utf8'));
  const client = new Client({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: target,
  });
  await client.connect();
  try {
    const actual = await client.query('SELECT current_database() nombre');
    if (actual.rows[0].nombre !== target) throw new Error('La conexion efectiva no coincide con la base confirmada');
    await client.query("SELECT pg_advisory_lock(hashtext('odonton_migracion_canonica'))");
    const hasUsers = (await client.query("SELECT to_regclass('public.usuarios') IS NOT NULL existe")).rows[0].existe;
    if (!hasUsers) {
      const baselineText = await fs.readFile(path.join(databaseRoot, manifest.baseline), 'utf8');
      await client.query(baselineText);
    }
    await client.query('SET search_path TO public');
    await assertBaseline(client);
    await ensureLedger(client);
    const baselineText = await fs.readFile(path.join(databaseRoot, manifest.baseline), 'utf8');
    const baselineResult = await recordBaseline(client, `baseline:${manifest.baseline}`, baselineText);
    if (ownerEmail) await client.query("SELECT set_config('odonton.owner_email',$1,false)", [ownerEmail]);
    const results = [{ nombre: manifest.baseline, estado: baselineResult }];
    for (const name of manifest.migrations) {
      const text = await fs.readFile(path.join(databaseRoot, name), 'utf8');
      results.push({ nombre: name, estado: await applyFile(client, name, text) });
    }
    await assertCanonicalSchema(client);
    const overlaps = await client.query(`SELECT count(*)::int total FROM turnos a JOIN turnos b ON a.id<b.id
      AND a.estado IN ('programado','confirmado','reprogramado') AND b.estado IN ('programado','confirmado','reprogramado')
      AND a.fecha_hora_inicio<b.fecha_hora_fin AND a.fecha_hora_fin>b.fecha_hora_inicio
      AND odonton_agenda_profesional_key(a.profesional_perfil_id,a.profesional_id)=odonton_agenda_profesional_key(b.profesional_perfil_id,b.profesional_id)`);
    console.log(JSON.stringify({ database: target, migrations: results, historical_overlap_pairs: overlaps.rows[0].total }));
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('odonton_migracion_canonica'))").catch(() => {});
    await client.end();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
