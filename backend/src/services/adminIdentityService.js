const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const VALID_ROLES = new Set(['administrador', 'recepcion', 'odontologo']);

function normalizeRoles(values) {
  const roles = [...new Set(Array.isArray(values) ? values.map(String) : [])];
  if (!roles.length || roles.some((role) => !VALID_ROLES.has(role))) {
    const error = new Error('Debe seleccionar al menos un rol válido');
    error.status = 400;
    throw error;
  }
  return roles;
}

async function listIdentities() {
  const { rows } = await pool.query(`
    SELECT u.id,u.nombre,u.email,u.activo,u.puede_cobrar,u.debe_cambiar_password,u.es_demo,
      COALESCE(array_agg(DISTINCT r.codigo) FILTER (WHERE r.codigo IS NOT NULL),'{}') roles,
      p.id profesional_perfil_id,p.nombre_mostrado profesional_nombre,p.activo profesional_activo,
      p.es_ficticio profesional_es_ficticio,p.compatibilidad_pendiente
    FROM usuarios u
    LEFT JOIN usuarios_roles ur ON ur.usuario_id=u.id
    LEFT JOIN roles r ON r.id=ur.rol_id
    LEFT JOIN profesionales p ON p.usuario_id=u.id
    GROUP BY u.id,p.id ORDER BY u.id
  `);
  return rows;
}

async function saveIdentity(idValue, payload, actorId) {
  const id = idValue ? Number(idValue) : null;
  const roles = normalizeRoles(payload.roles);
  const nombre = String(payload.nombre || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  if (!nombre || !email) {
    const error = new Error('Nombre y correo son requeridos'); error.status = 400; throw error;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let userId = id;
    if (id) {
      const result = await client.query(`UPDATE usuarios SET nombre=$2,email=$3,activo=$4,
        puede_cobrar=$5,updated_at=NOW() WHERE id=$1 RETURNING id`, [
        id, nombre, email, payload.activo !== false,
        Boolean(payload.puede_cobrar && (roles.includes('recepcion') || roles.includes('administrador'))),
      ]);
      if (!result.rowCount) { const error = new Error('Usuario no encontrado'); error.status = 404; throw error; }
      if (payload.password) {
        if (String(payload.password).length < 12) { const error = new Error('La contraseña debe tener al menos 12 caracteres'); error.status = 400; throw error; }
        await client.query('UPDATE usuarios SET password_hash=$2,debe_cambiar_password=TRUE WHERE id=$1', [id, await bcrypt.hash(String(payload.password), 12)]);
      }
    } else {
      if (String(payload.password || '').length < 12) { const error = new Error('La contraseña inicial debe tener al menos 12 caracteres'); error.status = 400; throw error; }
      const result = await client.query(`INSERT INTO usuarios(nombre,email,password_hash,activo,puede_cobrar,
        debe_cambiar_password,es_demo,updated_at) VALUES($1,$2,$3,$4,$5,TRUE,FALSE,NOW()) RETURNING id`, [
        nombre, email, await bcrypt.hash(String(payload.password), 12), payload.activo !== false,
        Boolean(payload.puede_cobrar && (roles.includes('recepcion') || roles.includes('administrador'))),
      ]);
      userId = result.rows[0].id;
    }
    await client.query('DELETE FROM usuarios_roles WHERE usuario_id=$1', [userId]);
    await client.query(`INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
      SELECT $1,id,$3 FROM roles WHERE codigo::text=ANY($2::text[])`, [userId, roles, actorId]);

    const existingProfile = await client.query('SELECT id FROM profesionales WHERE usuario_id=$1', [userId]);
    if (roles.includes('odontologo')) {
      const profileName = String(payload.profesional_nombre || nombre).trim();
      if (existingProfile.rowCount) {
        await client.query(`UPDATE profesionales SET nombre_mostrado=$2,activo=$3,updated_at=NOW()
          WHERE id=$1`, [existingProfile.rows[0].id, profileName, payload.profesional_activo !== false]);
      } else {
        await client.query(`INSERT INTO profesionales(usuario_id,nombre_mostrado,activo,es_ficticio,compatibilidad_pendiente)
          VALUES($1,$2,$3,FALSE,FALSE)`, [userId, profileName, payload.profesional_activo !== false]);
      }
    } else if (existingProfile.rowCount) {
      await client.query('UPDATE profesionales SET activo=FALSE,updated_at=NOW() WHERE id=$1', [existingProfile.rows[0].id]);
    }
    await client.query('COMMIT');
    return userId;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') { error.status = 409; error.message = 'El correo ya está registrado'; }
    throw error;
  } finally { client.release(); }
}

module.exports = { listIdentities, saveIdentity };
