const bcrypt = require("bcrypt");
const { pool } = require("../config/db");
const ROLES = new Set(["dueno", "odontologo", "recepcion"]);
function validarEmail(v) {
  const e = String(v || "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(e)) throw new Error("Email invalido");
  return e;
}
function validarPassword(v) {
  const p = String(v || "");
  if (p.length < 8 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p))
    throw new Error(
      "La contraseña debe tener al menos 8 caracteres, letras y numeros",
    );
  return p;
}
async function rolId(client, codigo) {
  if (!ROLES.has(codigo)) throw new Error("Rol invalido");
  const r = await client.query("select id from roles where codigo=$1", [
    codigo,
  ]);
  if (!r.rowCount) throw new Error("Rol canonico no disponible");
  return r.rows[0].id;
}
async function listar() {
  const { rows } =
    await pool.query(`select u.id,u.nombre,u.email,coalesce(u.activo,true) activo,u.debe_cambiar_password,r.codigo rol,
 p.id profesional_id,p.nombre_mostrado profesional_nombre,p.activo profesional_activo,p.vinculo_confirmado_at
 from usuarios u left join usuarios_roles_vigentes ur on ur.usuario_id=u.id left join roles r on r.id=ur.rol_id
 left join profesionales p on p.usuario_id=u.id order by u.nombre,u.id`);
  return rows;
}
async function perfilesDisponibles() {
  const { rows } =
    await pool.query(`select p.id,p.nombre_mostrado,p.activo,p.es_ficticio,p.compatibilidad_pendiente,p.usuario_id,p.usuario_legacy_id,p.vinculo_confirmado_at,
 u.nombre usuario_nombre,u.email usuario_email from profesionales p left join usuarios u on u.id=p.usuario_id order by p.nombre_mostrado,p.id`);
  return rows;
}
async function crear(data, actorId) {
  const nombre = String(data.nombre || "").trim(),
    email = validarEmail(data.email),
    rol = String(data.rol || ""),
    password = validarPassword(data.passwordTemporal);
  if (!nombre) throw new Error("Nombre requerido");
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const rid = await rolId(client, rol);
    const u = await client.query(
      `insert into usuarios(nombre,email,password_hash,activo,puede_cobrar,debe_cambiar_password,es_demo,token_version,updated_at) values($1,$2,$3,true,false,true,false,0,now()) returning id,nombre,email,activo,debe_cambiar_password`,
      [nombre, email, hash],
    );
    await client.query(
      `insert into usuarios_roles_vigentes(usuario_id,rol_id,asignado_por_usuario_id,motivo) values($1,$2,$3,'Alta de cuenta por el dueño')`,
      [u.rows[0].id, rid, actorId],
    );
    await client.query(
      `insert into identidad_roles_historial(usuario_id,rol_nuevo_id,actor_usuario_id,accion,motivo,detalle) values($1,$2,$3,'crear_cuenta','Alta de cuenta por el dueño',$4)`,
      [u.rows[0].id, rid, actorId, JSON.stringify({ nombre, email, rol })],
    );
    await client.query("commit");
    return { ...u.rows[0], rol };
  } catch (e) {
    await client.query("rollback");
    if (e.code === "23505") throw new Error("El email ya esta registrado");
    throw e;
  } finally {
    client.release();
  }
}
async function bloquearIdentidad(client) {
  await client.query(
    "select pg_advisory_xact_lock(hashtext('odonton_ultimo_dueno_activo'))",
  );
}
async function editar(id, data, actorId) {
  const uid = Number(id);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await bloquearIdentidad(client);
    const actual = (
      await client.query(
        `select u.id,u.nombre,u.email,coalesce(u.activo,true) activo,r.id rol_id,r.codigo rol,p.id profesional_id from usuarios u join usuarios_roles_vigentes ur on ur.usuario_id=u.id join roles r on r.id=ur.rol_id left join profesionales p on p.usuario_id=u.id where u.id=$1 for update of u,ur`,
        [uid],
      )
    ).rows[0];
    if (!actual) throw new Error("Usuario no encontrado");
    const rol = data.rol === undefined ? actual.rol : String(data.rol);
    const activo =
      data.activo === undefined ? actual.activo : Boolean(data.activo);
    const rid = await rolId(client, rol);
    if (actual.profesional_id && rol === "recepcion")
      throw new Error(
        "Una cuenta vinculada a un perfil profesional no puede tener rol recepcion",
      );
    if (actual.rol === "dueno" && (!activo || rol !== "dueno")) {
      const c = await client.query(
        `select count(*)::int n from usuarios u join usuarios_roles_vigentes ur on ur.usuario_id=u.id join roles r on r.id=ur.rol_id where r.codigo='dueno' and coalesce(u.activo,true)=true`,
      );
      if (c.rows[0].n <= 1) {
        const e = new Error(
          "No se puede inactivar ni cambiar el rol del ultimo dueño activo",
        );
        e.code = "ULTIMO_DUENO_ACTIVO";
        throw e;
      }
    }
    const nombre =
      data.nombre === undefined
        ? actual.nombre
        : String(data.nombre || "").trim();
    if (!nombre) throw new Error("Nombre requerido");
    const email =
      data.email === undefined ? actual.email : validarEmail(data.email);
    await client.query(
      "update usuarios set nombre=$2,email=$3,activo=$4,updated_at=now() where id=$1",
      [uid, nombre, email, activo],
    );
    if (rid !== actual.rol_id) {
      await client.query(
        `update usuarios_roles_vigentes set rol_id=$2,asignado_at=now(),asignado_por_usuario_id=$3,motivo='Cambio de rol por el dueño' where usuario_id=$1`,
        [uid, rid, actorId],
      );
      await client.query(
        `insert into identidad_roles_historial(usuario_id,rol_anterior_id,rol_nuevo_id,actor_usuario_id,accion,motivo,detalle) values($1,$2,$3,$4,'cambiar_rol','Cambio de rol por el dueño',$5)`,
        [
          uid,
          actual.rol_id,
          rid,
          actorId,
          JSON.stringify({ rol_anterior: actual.rol, rol_nuevo: rol }),
        ],
      );
    }
    await client.query("commit");
    return {
      usuario: { id: uid, nombre, email, activo, rol },
      anterior: actual,
    };
  } catch (e) {
    await client.query("rollback");
    if (e.code === "23505") throw new Error("El email ya esta registrado");
    throw e;
  } finally {
    client.release();
  }
}
async function vincularPerfil(
  { usuarioId, perfilId, nombrePerfil, crearPerfil },
  actorId,
) {
  const uid = Number(usuarioId);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const u = (
      await client.query(
        `select u.id,u.nombre,r.codigo rol from usuarios u join usuarios_roles_vigentes ur on ur.usuario_id=u.id join roles r on r.id=ur.rol_id where u.id=$1 and coalesce(u.activo,true)=true for update of u`,
        [uid],
      )
    ).rows[0];
    if (!u) throw new Error("Cuenta activa no encontrada");
    if (!["dueno", "odontologo"].includes(u.rol))
      throw new Error(
        "Solo dueño u odontologo pueden vincular un perfil profesional",
      );
    if (
      (
        await client.query("select id from profesionales where usuario_id=$1", [
          uid,
        ])
      ).rowCount
    )
      throw new Error("La cuenta ya tiene un perfil profesional vinculado");
    let p;
    if (crearPerfil) {
      const nombre = String(nombrePerfil || u.nombre).trim();
      if (!nombre) throw new Error("Nombre de perfil requerido");
      p = (
        await client.query(
          `insert into profesionales(usuario_id,nombre_mostrado,activo,es_ficticio,compatibilidad_pendiente,vinculo_confirmado_at,vinculo_confirmado_por_usuario_id,vinculo_origen,updated_at) values($1,$2,true,false,false,now(),$3,'confirmacion_gestion_usuarios',now()) returning id,nombre_mostrado,activo`,
          [uid, nombre, actorId],
        )
      ).rows[0];
    } else {
      const pid = Number(perfilId);
      p = (
        await client.query(
          `select id,nombre_mostrado,activo,usuario_id,es_ficticio,vinculo_confirmado_at from profesionales where id=$1 for update`,
          [pid],
        )
      ).rows[0];
      if (!p) throw new Error("Perfil profesional no encontrado");
      if (p.usuario_id || p.vinculo_confirmado_at)
        throw new Error("El perfil ya esta vinculado o confirmado");
      if (p.es_ficticio)
        throw new Error("Un perfil ficticio no puede vincularse a una cuenta");
      p = (
        await client.query(
          `update profesionales set usuario_id=$2,activo=true,compatibilidad_pendiente=false,vinculo_confirmado_at=now(),vinculo_confirmado_por_usuario_id=$3,vinculo_origen='confirmacion_gestion_usuarios',updated_at=now() where id=$1 returning id,nombre_mostrado,activo`,
          [pid, uid, actorId],
        )
      ).rows[0];
    }
    await client.query("commit");
    return p;
  } catch (e) {
    await client.query("rollback");
    if (e.code === "23505")
      throw new Error(
        "La cuenta o el perfil ya tiene una vinculacion incompatible",
      );
    throw e;
  } finally {
    client.release();
  }
}
async function resetPassword(id, password, actorId) {
  const hash = await bcrypt.hash(validarPassword(password), 12);
  const { rows } = await pool.query(
    `update usuarios set password_hash=$2,debe_cambiar_password=true,token_version=coalesce(token_version,0)+1,password_changed_at=now(),updated_at=now() where id=$1 returning id,nombre,email`,
    [Number(id), hash],
  );
  if (!rows[0]) throw new Error("Usuario no encontrado");
  return rows[0];
}
async function cambiarPasswordPropia(id, actual, nueva) {
  validarPassword(nueva);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const u = (
      await client.query(
        "select id,password_hash,coalesce(token_version,0) token_version from usuarios where id=$1 and coalesce(activo,true)=true for update",
        [id],
      )
    ).rows[0];
    if (!u || !(await bcrypt.compare(String(actual || ""), u.password_hash))) {
      const e = new Error("La contraseña actual es incorrecta");
      e.status = 400;
      throw e;
    }
    const hash = await bcrypt.hash(nueva, 12);
    const r = await client.query(
      `update usuarios set password_hash=$2,debe_cambiar_password=false,token_version=token_version+1,password_changed_at=now(),updated_at=now() where id=$1 returning token_version`,
      [id, hash],
    );
    await client.query(
      `insert into auditoria(usuario_id,accion,recurso,recurso_id,status_code,metadata) values($1,'cambiar_password_propia','/api/auth',$3,200,$2)`,
      [id, JSON.stringify({ tokens_invalidados: true }), String(id)],
    );
    await client.query("commit");
    return r.rows[0];
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
module.exports = {
  listar,
  perfilesDisponibles,
  crear,
  editar,
  vincularPerfil,
  resetPassword,
  cambiarPasswordPropia,
};
