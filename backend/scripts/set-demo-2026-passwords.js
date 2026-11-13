require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const TARGET = 'odonton_demo_2026';
const accounts = [
  ['dueno.demo.2026@example.com', 'DEMO_OWNER_PASSWORD'],
  ['recepcion.demo.2026@example.com', 'DEMO_RECEPTION_PASSWORD'],
  ['odontologa1.demo.2026@example.com', 'DEMO_DENTIST_1_PASSWORD'],
  ['odontologo2.demo.2026@example.com', 'DEMO_DENTIST_2_PASSWORD'],
  ['odontologa3.demo.2026@example.com', 'DEMO_DENTIST_3_PASSWORD'],
];

function readPassword(variable) {
  const value = process.env[variable];
  if (!value || value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new Error(`${variable} debe definirse localmente con al menos 8 caracteres, letras y números.`);
  }
  return value;
}

(async () => {
  if (process.env.DB_NAME !== TARGET) throw new Error(`Base no autorizada: ${process.env.DB_NAME || '(sin nombre)'}`);
  const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: TARGET });
  const client = await pool.connect();
  try {
    const identity = await client.query('SELECT current_database() db');
    if (identity.rows[0].db !== TARGET) throw new Error('La conexión efectiva no apunta a la base demo.');
    await client.query('BEGIN');
    for (const [email, variable] of accounts) {
      const hash = await bcrypt.hash(readPassword(variable), 10);
      const result = await client.query(`UPDATE usuarios SET password_hash=$1,debe_cambiar_password=true,token_version=token_version+1,updated_at=NOW() WHERE email=$2 AND es_demo=true`, [hash, email]);
      if (result.rowCount !== 1) throw new Error(`No se encontró exactamente una cuenta demo para ${email}.`);
    }
    const signature = (await client.query(`SELECT count(*)::int AS count, COALESCE(md5(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text)),md5('')) AS hash FROM usuarios t`)).rows[0];
    await client.query(`UPDATE demo_generator_runs SET signatures=jsonb_set(signatures,'{usuarios}',$1::jsonb,true) WHERE generator_id='odonton-demo-2026-v1'`, [JSON.stringify(signature)]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ ok: true, database: TARGET, updated_accounts: accounts.length, passwords_exposed: false }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => { console.error(`ERROR DEMO PASSWORDS: ${error.message}`); process.exitCode = 1; });
