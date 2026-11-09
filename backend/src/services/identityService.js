const { pool } = require('../config/db');

class IdentityError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'IdentityError';
    this.code = code;
    this.status = status;
  }
}

function errorIdentidadNoConfigurada(cause = null) {
  const error = new IdentityError(
    'IDENTIDAD_NO_CONFIGURADA',
    'Identidad y roles no configurados. Aplique la migración de identidad antes de iniciar sesión.',
    503,
  );
  error.cause = cause;
  return error;
}

function esErrorEsquemaIdentidad(error) {
  return ['42P01', '42703', '42883'].includes(error?.code);
}

async function obtenerIdentidadPorId(usuarioId, queryable = pool) {
  const id = Number(usuarioId);
  if (!Number.isInteger(id) || id <= 0) return null;

  let result;
  try {
    result = await queryable.query(
      `SELECT
         u.id,
         u.nombre,
         u.email,
         u.activo,
         u.puede_cobrar,
         u.debe_cambiar_password,
         COALESCE(
           ARRAY_AGG(DISTINCT r.codigo ORDER BY r.codigo)
             FILTER (WHERE r.codigo IS NOT NULL),
           ARRAY[]::VARCHAR[]
         ) AS roles,
         p.id AS profesional_perfil_id,
         p.nombre_mostrado AS profesional_nombre,
         p.activo AS profesional_activo,
         p.es_ficticio AS profesional_es_ficticio
       FROM usuarios u
       LEFT JOIN usuarios_roles ur ON ur.usuario_id = u.id
       LEFT JOIN roles r ON r.id = ur.rol_id
       LEFT JOIN profesionales p ON p.usuario_id = u.id
       WHERE u.id = $1
       GROUP BY u.id, p.id
       LIMIT 1`,
      [id],
    );
  } catch (error) {
    if (esErrorEsquemaIdentidad(error)) throw errorIdentidadNoConfigurada(error);
    throw error;
  }

  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    usuario_id: row.id,
    nombre: row.nombre,
    email: row.email,
    activo: row.activo,
    roles: row.roles || [],
    puede_cobrar: row.puede_cobrar === true,
    debe_cambiar_password: row.debe_cambiar_password === true,
    profesional_perfil_id: row.profesional_perfil_id || null,
    profesional: row.profesional_perfil_id
      ? {
          id: row.profesional_perfil_id,
          nombre: row.profesional_nombre,
          activo: row.profesional_activo === true,
          es_ficticio: row.profesional_es_ficticio === true,
        }
      : null,
  };
}

function exigirCuentaActiva(identidad) {
  if (!identidad || identidad.activo !== true) {
    throw new IdentityError('CUENTA_NO_DISPONIBLE', 'Cuenta no disponible', 401);
  }
  return identidad;
}

module.exports = {
  IdentityError,
  errorIdentidadNoConfigurada,
  exigirCuentaActiva,
  obtenerIdentidadPorId,
};
