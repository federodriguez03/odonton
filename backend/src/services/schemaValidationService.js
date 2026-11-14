const { pool } = require('../config/db');

const validated = new Set();

function schemaError(scope, missing) {
  const error = new Error(`Esquema no preparado para ${scope}. Ejecute las migraciones canonicas. Faltan: ${missing.join(', ')}`);
  error.code = 'SCHEMA_NOT_READY';
  error.status = 503;
  return error;
}

async function requireSchema(scope, requirements, queryable = pool) {
  if (validated.has(scope)) return;
  const missing = [];
  for (const requirement of requirements) {
    const [table, column] = requirement.split('.');
    if (!column) {
      const result = await queryable.query('SELECT to_regclass($1) IS NOT NULL AS ok', [`public.${table}`]);
      if (!result.rows[0].ok) missing.push(requirement);
      continue;
    }
    const result = await queryable.query(`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2
    ) AS ok`, [table, column]);
    if (!result.rows[0].ok) missing.push(requirement);
  }
  if (missing.length) throw schemaError(scope, missing);
  validated.add(scope);
}

function clearSchemaValidationCache() {
  validated.clear();
}

async function requireRuntimeSchema() {
  return requireSchema('runtime_completo', [
    'auditoria.metadata', 'configuracion_consultorio.autogestion_keywords',
    'configuracion_horarios_atencion.dia_semana', 'configuracion_mensajes_automaticos.tipo',
    'documentos_paciente.historia_clinica_id', 'odontograma_meta.observaciones',
    'pacientes.alergias', 'prestaciones.activo', 'profesionales.vinculo_confirmado_at',
    'protesis_fijas.dientes', 'protesis_removibles.arcada', 'tratamientos.fecha',
    'turno_solicitudes.tipo_solicitud', 'turno_prestaciones.nombre_snapshot',
    'turnos.profesional_perfil_id', 'turnos.recordatorio_procesado_at',
    'usuarios.token_version', 'usuarios.puede_cobrar', 'usuarios.es_demo', 'usuarios.updated_at',
    'usuarios_roles_vigentes.rol_id', 'whatsapp_conversations.data', 'whatsapp_reminders.channel',
  ]);
}

module.exports = { requireSchema, requireRuntimeSchema, clearSchemaValidationCache };
