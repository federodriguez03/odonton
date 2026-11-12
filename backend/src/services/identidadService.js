const { pool } = require('../config/db');
const ROLES_CANONICOS = new Set(['dueno', 'odontologo', 'recepcion']);

function identityError(status, code, message) { const error=new Error(message); error.status=status; error.code=code; return error; }

async function validarEsquemaCanonico(queryable=pool) {
  const { rows }=await queryable.query(`SELECT
    to_regclass('public.usuarios_roles_vigentes') IS NOT NULL AS asignaciones,
    to_regclass('public.roles') IS NOT NULL AS roles,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios_roles_vigentes'
      AND column_name IN ('usuario_id','rol_id','asignado_at','asignado_por_usuario_id','motivo'))::int AS columnas_asignacion,
    EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.usuarios_roles_vigentes') AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (usuario_id)') AS rol_unico`);
  const schema=rows[0];
  if(!schema.asignaciones||!schema.roles) throw identityError(503,'IDENTIDAD_ESQUEMA_AUSENTE','El esquema canonico de identidad no esta disponible');
  if(schema.columnas_asignacion!==5||!schema.rol_unico) throw identityError(503,'IDENTIDAD_ESQUEMA_INCOMPATIBLE','El esquema canonico de identidad es incompatible');
}

function permisosEfectivos(rol) {
  const dueno=rol==='dueno';
  const odontologo=rol==='odontologo';
  const recepcion=rol==='recepcion';
  return {
    acceso_operativo: dueno || odontologo || recepcion,
    acceso_total: dueno,
    pacientes_administrativos: dueno || odontologo || recepcion,
    pacientes_clinicos: dueno || odontologo,
    escribir_clinica: dueno || odontologo,
    turnos: dueno || odontologo || recepcion,
    agenda_general: dueno || recepcion,
    finanzas_operativas: dueno || recepcion,
    reportes_operativos: dueno || recepcion,
    configurar_consultorio: dueno,
    administrar_catalogo: dueno,
    administrar_usuarios: dueno,
    administrar_aranceles: dueno,
    anulaciones_financieras: dueno,
    matriz_limitada_pendiente: !dueno,
  };
}

async function obtenerIdentidadVigente(usuarioId,queryable=pool,opciones={}) {
  const id=Number(usuarioId);
  if(!Number.isSafeInteger(id)||id<=0) throw identityError(401,'TOKEN_INVALIDO','Token invalido');
  await validarEsquemaCanonico(queryable);
  const { rows }=await queryable.query(`SELECT u.id,u.nombre,u.email,COALESCE(u.activo,true) activo,coalesce(u.token_version,0) token_version,coalesce(u.debe_cambiar_password,false) debe_cambiar_password,r.codigo rol,
      p.id profesional_perfil_id,p.nombre_mostrado profesional_nombre,
      (p.id IS NOT NULL AND p.activo=TRUE AND p.vinculo_confirmado_at IS NOT NULL) profesional_habilitado
    FROM usuarios u LEFT JOIN usuarios_roles_vigentes ur ON ur.usuario_id=u.id LEFT JOIN roles r ON r.id=ur.rol_id
    LEFT JOIN LATERAL (SELECT id,nombre_mostrado,activo,vinculo_confirmado_at FROM profesionales WHERE usuario_id=u.id ORDER BY activo DESC,id ASC LIMIT 1) p ON TRUE
    WHERE u.id=$1 LIMIT 1`,[id]);
  const user=rows[0];
  if(!user) throw identityError(401,'CUENTA_NO_ENCONTRADA','La cuenta ya no existe');
  if(!user.activo) throw identityError(401,'CUENTA_INACTIVA','La cuenta esta inactiva');
  if(Object.prototype.hasOwnProperty.call(opciones,'tokenVersion')&&Number(opciones.tokenVersion??0)!==Number(user.token_version)) throw identityError(401,'TOKEN_REVOCADO','La sesion fue invalidada por un cambio de contraseña');
  if(!user.rol) throw identityError(403,'CUENTA_SIN_ROL','La cuenta no tiene un rol canonico vigente');
  if(!ROLES_CANONICOS.has(user.rol)) throw identityError(503,'IDENTIDAD_ROL_INCOMPATIBLE','La cuenta tiene un rol canonico no reconocido');
  return {id:user.id,nombre:user.nombre,email:user.email,rol:user.rol,debe_cambiar_password:user.debe_cambiar_password,token_version:user.token_version,
    profesional_perfil_id:user.profesional_perfil_id || null,profesional_nombre:user.profesional_nombre || null,
    profesional_habilitado:user.profesional_habilitado === true,permisos:permisosEfectivos(user.rol)};
}

module.exports={obtenerIdentidadVigente,validarEsquemaCanonico,permisosEfectivos,identityError};
