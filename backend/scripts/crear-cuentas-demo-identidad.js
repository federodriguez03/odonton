require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');

const DEMOS = Object.freeze({
  recepcion: {
    nombre: 'Recepción Demo',
    email: 'recepcion.demo@odonton.test',
    passwordEnv: 'DEMO_RECEPCION_PASSWORD',
    rol: 'recepcion',
  },
  odontologo: {
    nombre: 'Odontólogo de prueba',
    email: 'odontologo.demo@odonton.test',
    passwordEnv: 'DEMO_ODONTOLOGO_PASSWORD',
    rol: 'odontologo',
  },
});

function validarDestino() {
  const database = pool.options.database || process.env.DB_NAME;
  validarEntornoDemo(process.env, process.argv.slice(2), database);
  if (!['localhost', '127.0.0.1', '::1'].includes(pool.options.host)) {
    throw new Error('Las cuentas demo sólo pueden crearse en PostgreSQL local');
  }
  for (const demo of Object.values(DEMOS)) {
    const password = process.env[demo.passwordEnv] || '';
    if (password.length < 12) throw new Error(`${demo.passwordEnv} debe contener al menos 12 caracteres`);
  }
  return database;
}

async function asegurarUsuarioDemo(client, demo) {
  const existente = await client.query('SELECT id, es_demo FROM usuarios WHERE LOWER(email)=LOWER($1)', [demo.email]);
  if (existente.rowCount && !existente.rows[0].es_demo) {
    throw new Error(`El correo ${demo.email} pertenece a una cuenta no demo`);
  }
  const hash = await bcrypt.hash(process.env[demo.passwordEnv], 12);
  if (existente.rowCount) {
    return (await client.query(`
      UPDATE usuarios SET nombre=$2,password_hash=$3,activo=TRUE,puede_cobrar=FALSE,
        debe_cambiar_password=FALSE,updated_at=NOW()
      WHERE id=$1 RETURNING id,nombre,email,activo,es_demo
    `, [existente.rows[0].id, demo.nombre, hash])).rows[0];
  }
  return (await client.query(`
    INSERT INTO usuarios(nombre,email,password_hash,activo,puede_cobrar,debe_cambiar_password,es_demo,updated_at)
    VALUES($1,$2,$3,TRUE,FALSE,FALSE,TRUE,NOW())
    RETURNING id,nombre,email,activo,es_demo
  `, [demo.nombre, demo.email, hash])).rows[0];
}

async function asignarRolExclusivoDemo(client, usuarioId, codigo) {
  await client.query('DELETE FROM usuarios_roles WHERE usuario_id=$1', [usuarioId]);
  await client.query(`
    INSERT INTO usuarios_roles(usuario_id,rol_id,asignado_por_usuario_id)
    SELECT $1,id,1 FROM roles WHERE codigo=$2
  `, [usuarioId, codigo]);
}

async function main() {
  const database = validarDestino();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recepcion = await asegurarUsuarioDemo(client, DEMOS.recepcion);
    const odontologo = await asegurarUsuarioDemo(client, DEMOS.odontologo);
    await asignarRolExclusivoDemo(client, recepcion.id, DEMOS.recepcion.rol);
    await asignarRolExclusivoDemo(client, odontologo.id, DEMOS.odontologo.rol);

    const perfilExistente = await client.query('SELECT id,es_ficticio FROM profesionales WHERE usuario_id=$1', [odontologo.id]);
    if (perfilExistente.rowCount && !perfilExistente.rows[0].es_ficticio) {
      throw new Error('La cuenta odontológica demo ya está vinculada a un perfil no ficticio');
    }
    const perfil = perfilExistente.rowCount
      ? (await client.query(`
          UPDATE profesionales SET nombre_mostrado='Odontólogo de prueba — perfil ficticio',
            activo=TRUE,es_ficticio=TRUE,compatibilidad_pendiente=FALSE,updated_at=NOW()
          WHERE id=$1 RETURNING id,nombre_mostrado,activo,es_ficticio
        `, [perfilExistente.rows[0].id])).rows[0]
      : (await client.query(`
          INSERT INTO profesionales(usuario_id,nombre_mostrado,activo,es_ficticio,compatibilidad_pendiente)
          VALUES($1,'Odontólogo de prueba — perfil ficticio',TRUE,TRUE,FALSE)
          RETURNING id,nombre_mostrado,activo,es_ficticio
        `, [odontologo.id])).rows[0];

    await client.query('COMMIT');
    console.log(JSON.stringify({
      database,
      cuentas: [recepcion, odontologo],
      perfil_odontologo: perfil,
      credenciales: 'Contraseñas tomadas del entorno; no se muestran ni se almacenan en Git',
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`CARGA DEMO DE IDENTIDAD FALLÓ: ${error.message}`);
  process.exitCode = 1;
});
