require('dotenv').config();
const { Client } = require('pg');
const client = new Client({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: 'odonton_db',
});
(async () => {
  await client.connect();
  const { rows } = await client.query(`SELECT current_database() database,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prestaciones' AND column_name='precio_modalidad') AS catalogo_modificado,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='arancel_versiones') AS aranceles_modificados`);
  console.log(JSON.stringify(rows[0]));
})().finally(() => client.end()).catch((error) => { console.error(error); process.exitCode=1; });
