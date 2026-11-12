require("dotenv").config();
const bcrypt = require("bcrypt");
const { Client } = require("pg");
const { spawn } = require("child_process");
const path = require("path");
const cfg = {
  host: process.env.DB_HOST,
  port: +process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};
const suffix = Date.now(),
  db = `odonton_users_http_${suffix}`,
  base = "http://127.0.0.1:3196",
  admin = new Client({ ...cfg, database: "postgres" });
let child;
let lastResponse;
const assert = (v, m) => {
  if (!v) throw new Error(`${m}: ${JSON.stringify(lastResponse)}`);
};
async function req(p, o = {}) {
  const r = await fetch(base + p, o),
    t = await r.text();
  let b;
  try {
    b = JSON.parse(t);
  } catch {
    b = t;
  }
  lastResponse = { status: r.status, body: b };
  return lastResponse;
}
const h = (t) => ({
  Authorization: `Bearer ${t}`,
  "Content-Type": "application/json",
});
async function wait() {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("server");
}
(async () => {
  await admin.connect();
  const source = (
    await admin.query(
      "select datname from pg_database where datname='odonton_ficha_20261109_test'",
    )
  ).rows[0];
  if (!source) throw new Error("Falta base de prueba");
  await admin.query(
    `create database "${db}" template "odonton_ficha_20261109_test"`,
  );
  const c = new Client({ ...cfg, database: db });
  await c.connect();
  try {
    const pass = `Owner-${suffix}!`,
      hash = await bcrypt.hash(pass, 4),
      owner = (
        await c.query(
          `insert into usuarios(nombre,email,password_hash,activo,puede_cobrar,debe_cambiar_password,es_demo,token_version,updated_at) values($1,$2,$3,true,false,false,true,0,now()) returning id,email`,
          [`Owner test ${suffix}`, `owner.users.${suffix}@test`, hash],
        )
      ).rows[0],
      rid = (await c.query("select id from roles where codigo='dueno'")).rows[0]
        .id;
    await c.query(
      `insert into usuarios_roles_vigentes(usuario_id,rol_id,asignado_por_usuario_id,motivo) values($1,$2,$1,'test')`,
      [owner.id, rid],
    );
    child = spawn(process.execPath, ["src/server.js"], {
      cwd: path.join(__dirname, ".."),
      env: {
        ...process.env,
        DB_NAME: db,
        PORT: "3196",
        WHATSAPP_AUTO_START: "false",
        REMINDERS_ENABLED: "false",
      },
      stdio: "ignore",
    });
    await wait();
    const login = await req("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: owner.email, password: pass }),
    });
    assert(login.status === 200, "login owner");
    const ot = login.body.token;
    const temp = `Temp-${suffix}!`,
      created = await req("/api/usuarios", {
        method: "POST",
        headers: h(ot),
        body: JSON.stringify({
          nombre: "Recepcion temporal",
          email: `rec.${suffix}@test`,
          rol: "recepcion",
          passwordTemporal: temp,
        }),
      });
    assert(
      created.status === 201 && created.body.usuario.debe_cambiar_password,
      "crear temporal",
    );
    const recId = created.body.usuario.id,
      recLogin = await req("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `rec.${suffix}@test`, password: temp }),
      });
    assert(recLogin.body.user.debe_cambiar_password, "flag temporal");
    const old = recLogin.body.token,
      blocked = await req("/api/pacientes", { headers: h(old) });
    assert(
      blocked.status === 403 &&
        blocked.body.codigo === "PASSWORD_CHANGE_REQUIRED",
      "bloqueo temporal",
    );
    const changed = await req("/api/auth/cambiar-password", {
      method: "POST",
      headers: h(old),
      body: JSON.stringify({
        passwordActual: temp,
        passwordNueva: `Nueva-${suffix}!`,
      }),
    });
    assert(changed.status === 200, "cambio propio");
    assert(
      (await req("/api/auth/me", { headers: h(old) })).status === 401 &&
        (await req("/api/auth/me", { headers: h(changed.body.token) }))
          .status === 200,
      "revocacion cambio",
    );
    assert(
      (await req("/api/usuarios", { headers: h(changed.body.token) }))
        .status === 403,
      "usuarios no dueño",
    );
    const od = await req("/api/usuarios", {
      method: "POST",
      headers: h(ot),
      body: JSON.stringify({
        nombre: "Odonto temporal",
        email: `od.${suffix}@test`,
        rol: "odontologo",
        passwordTemporal: temp,
      }),
    });
    assert(od.status === 201, "crear odonto");
    const turnsBefore = (
      await c.query(
        "select md5(string_agg(id::text||coalesce(profesional_perfil_id::text,''),',' order by id)) f from turnos",
      )
    ).rows[0].f;
    const link = await req(`/api/usuarios/${od.body.usuario.id}/perfil`, {
      method: "POST",
      headers: h(ot),
      body: JSON.stringify({
        crearPerfil: true,
        nombrePerfil: "Perfil HTTP explícito",
      }),
    });
    assert(link.status === 200, "crear perfil");
    const turnsAfter = (
      await c.query(
        "select md5(string_agg(id::text||coalesce(profesional_perfil_id::text,''),',' order by id)) f from turnos",
      )
    ).rows[0].f;
    assert(turnsBefore === turnsAfter, "vinculo reasigno historicos");
    const selector = await req("/api/turnos/profesionales", { headers: h(ot) });
    assert(
      selector.body.profesionales.some((p) => p.id === link.body.perfil.id),
      "perfil no elegible agenda",
    );
    const duplicate = await req(`/api/usuarios/${od.body.usuario.id}/perfil`, {
      method: "POST",
      headers: h(ot),
      body: JSON.stringify({ crearPerfil: true, nombrePerfil: "Duplicado" }),
    });
    assert(duplicate.status === 400, "vinculo duplicado");
    const reset = await req(`/api/usuarios/${recId}/restablecer-password`, {
      method: "POST",
      headers: h(ot),
      body: JSON.stringify({ passwordTemporal: `Reset-${suffix}!` }),
    });
    assert(
      reset.status === 200 &&
        (await req("/api/auth/me", { headers: h(changed.body.token) }))
          .status === 401,
      "reset no revoco",
    );
    await c.query(
      `update usuarios_roles_vigentes set rol_id=(select id from roles where codigo='recepcion')
       where usuario_id<>$1 and rol_id=(select id from roles where codigo='dueno')`,
      [owner.id],
    );
    const owner2 = await req("/api/usuarios", {
      method: "POST",
      headers: h(ot),
      body: JSON.stringify({
        nombre: "Owner 2",
        email: `owner2.${suffix}@test`,
        rol: "dueno",
        passwordTemporal: temp,
      }),
    });
    assert(owner2.status === 201, "owner2");
    const edits = await Promise.all([
      req(`/api/usuarios/${owner.id}`, {
        method: "PUT",
        headers: h(ot),
        body: JSON.stringify({ activo: false, rol: "dueno" }),
      }),
      req(`/api/usuarios/${owner2.body.usuario.id}`, {
        method: "PUT",
        headers: h(ot),
        body: JSON.stringify({ activo: false, rol: "dueno" }),
      }),
    ]);
    assert(
      edits.filter((x) => x.status === 200).length === 1 &&
        edits.filter(
          (x) => x.status === 409 && x.body.codigo === "ULTIMO_DUENO_ACTIVO",
        ).length === 1,
      "ultimo dueño concurrente",
    );
    const activeOwners = (
      await c.query(
        "select count(*)::int n from usuarios u join usuarios_roles_vigentes ur on ur.usuario_id=u.id join roles r on r.id=ur.rol_id where r.codigo='dueno' and u.activo",
      )
    ).rows[0].n;
    assert(activeOwners === 1, "sin dueño activo");
    const audit = (
      await c.query(
        "select coalesce(string_agg(coalesce(metadata::text,''),' '),'') txt from auditoria",
      )
    ).rows[0].txt;
    assert(
      !audit.includes(temp) &&
        !audit.includes(`Nueva-${suffix}!`) &&
        !audit.includes(`Reset-${suffix}!`),
      "credencial en auditoria",
    );
    console.log(
      JSON.stringify({
        ok: true,
        autorizacion: true,
        ultimo_dueno_concurrente: true,
        perfil: true,
        password_ciclo: true,
        tokens_revocados: true,
        historicos_intactos: true,
      }),
    );
  } finally {
    await c.end();
  }
})()
  .finally(async () => {
    if (child) {
      child.kill("SIGKILL");
      await new Promise((r) => child.once("exit", r));
    }
    await admin
      .query(`drop database if exists "${db}" with(force)`)
      .catch(() => {});
    await admin.end();
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
