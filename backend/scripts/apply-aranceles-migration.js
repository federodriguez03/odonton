require('dotenv').config();
const fs=require('fs'); const path=require('path'); const {Pool}=require('pg');
const pool=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
(async()=>{ const db=(await pool.query('SELECT current_database() db')).rows[0].db; if(db!=='odonton_ficha_20261109_test')throw new Error(`Base no autorizada: ${db}`);
  await pool.query(fs.readFileSync(path.join(__dirname,'../../database/2026-11-10_aranceles_importacion_manual.sql'),'utf8'));
  const counts=(await pool.query(`SELECT (SELECT count(*) FROM arancel_versiones)::int versiones,(SELECT count(*) FROM arancel_referencias)::int referencias`)).rows[0];
  console.log(JSON.stringify({ok:true,database:db,...counts})); })().finally(()=>pool.end()).catch(e=>{console.error(e);process.exitCode=1});
