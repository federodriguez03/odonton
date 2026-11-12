require('dotenv').config();
const fs=require('fs'); const path=require('path'); const {Client}=require('pg');
const base={host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD};
const admin=new Client({...base,database:'postgres'}); const suffix=Date.now(); const good=`odonton_identity_ok_${suffix}`; const bad=`odonton_identity_bad_${suffix}`;
const sql=fs.readFileSync(path.join(__dirname,'../../database/2026-11-10_identidad_roles_canonicos.sql'),'utf8');
async function runMigration(client,email){await client.query('BEGIN');try{await client.query("SELECT set_config('odonton.owner_email',$1,true)",[email]);await client.query(sql);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}}
(async()=>{let okClient,badClient;try{await admin.connect();await admin.query(`CREATE DATABASE "${good}"`);await admin.query(`CREATE DATABASE "${bad}"`);
okClient=new Client({...base,database:good});await okClient.connect();await okClient.query(`CREATE TABLE usuarios(id SERIAL PRIMARY KEY,nombre VARCHAR(100) NOT NULL,email VARCHAR(150) NOT NULL UNIQUE,password_hash TEXT NOT NULL,activo BOOLEAN DEFAULT true);
CREATE TABLE roles(id SMALLSERIAL PRIMARY KEY,codigo VARCHAR(30) NOT NULL UNIQUE,nombre VARCHAR(80) NOT NULL);
CREATE TABLE usuarios_roles(usuario_id INTEGER REFERENCES usuarios(id),rol_id SMALLINT REFERENCES roles(id),asignado_at TIMESTAMPTZ DEFAULT NOW(),asignado_por_usuario_id INTEGER REFERENCES usuarios(id),PRIMARY KEY(usuario_id,rol_id));
CREATE TABLE profesionales(id INTEGER PRIMARY KEY,usuario_id INTEGER UNIQUE REFERENCES usuarios(id),usuario_legacy_id INTEGER UNIQUE REFERENCES usuarios(id),nombre_mostrado VARCHAR(120) NOT NULL,activo BOOLEAN NOT NULL DEFAULT false,es_ficticio BOOLEAN NOT NULL DEFAULT false,compatibilidad_pendiente BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO usuarios(nombre,email,password_hash) VALUES('Dueño','owner@test','x'),('Recepción','recep@test','x'),('Odontólogo','odonto@test','x');
INSERT INTO roles(codigo,nombre) VALUES('administrador','Administrador'),('recepcion','Recepción'),('odontologo','Odontólogo');
INSERT INTO usuarios_roles VALUES(1,1,NOW(),1),(2,2,NOW(),1),(2,3,NOW(),1),(3,3,NOW(),1);
INSERT INTO profesionales(id,usuario_id,usuario_legacy_id,nombre_mostrado,activo) VALUES(1,NULL,1,'Legado',false),(2,3,NULL,'Prueba',true);`);
await runMigration(okClient,'owner@test');await runMigration(okClient,'owner@test');
const check=(await okClient.query(`SELECT
(SELECT count(*) FROM usuarios_roles)::int legacy_roles,
(SELECT count(*) FROM usuarios_roles_vigentes)::int canonical_roles,
(SELECT count(*) FROM usuarios_roles_vigentes ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=1 AND r.codigo='dueno')::int owner_ok,
(SELECT count(*) FROM usuarios_roles_vigentes WHERE usuario_id IN(2,3))::int tests_adopted,
(SELECT count(*) FROM profesionales WHERE vinculo_confirmado_at IS NOT NULL)::int profiles_adopted,
(SELECT count(*) FROM identidad_roles_historial WHERE accion='asignacion_inicial_dueno')::int history`)).rows[0];
if(JSON.stringify(check)!==JSON.stringify({legacy_roles:4,canonical_roles:1,owner_ok:1,tests_adopted:0,profiles_adopted:0,history:1}))throw new Error(`Resultado inesperado: ${JSON.stringify(check)}`);
badClient=new Client({...base,database:bad});await badClient.connect();await badClient.query(`CREATE TABLE usuarios(id SERIAL PRIMARY KEY,nombre TEXT NOT NULL,email TEXT NOT NULL,password_hash TEXT NOT NULL,activo BOOLEAN);CREATE TABLE roles(id INTEGER PRIMARY KEY,codigo TEXT NOT NULL,nombre TEXT NOT NULL);`);
let stopped=false;try{await runMigration(badClient,'owner@test');}catch(error){stopped=/IDENTIDAD_INCOMPATIBLE/.test(error.message);}if(!stopped)throw new Error('La estructura incompatible no detuvo la migracion');
console.log(JSON.stringify({ok:true,compatible:check,incompatible_detenida:true}));
}finally{if(okClient)await okClient.end().catch(()=>{});if(badClient)await badClient.end().catch(()=>{});await admin.query(`DROP DATABASE IF EXISTS "${good}" WITH(FORCE)`).catch(()=>{});await admin.query(`DROP DATABASE IF EXISTS "${bad}" WITH(FORCE)`).catch(()=>{});await admin.end().catch(()=>{});}})().catch(e=>{console.error(e);process.exitCode=1});
