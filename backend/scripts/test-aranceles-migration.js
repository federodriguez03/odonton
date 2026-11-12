require('dotenv').config();
const fs=require('fs'); const path=require('path'); const {Client}=require('pg');
const db=`odonton_aranceles_mig_${Date.now()}`; const base={host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD};
const admin=new Client({...base,database:'postgres'});
(async()=>{ let test; try { await admin.connect(); await admin.query(`CREATE DATABASE "${db}"`); test=new Client({...base,database:db}); await test.connect();
  await test.query('CREATE TABLE usuarios(id SERIAL PRIMARY KEY); CREATE TABLE prestaciones(id SERIAL PRIMARY KEY,nombre TEXT,precio_base NUMERIC);');
  const sql=fs.readFileSync(path.join(__dirname,'../../database/2026-11-10_aranceles_importacion_manual.sql'),'utf8'); await test.query(sql); await test.query(sql);
  const tables=await test.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN ('arancel_versiones','arancel_referencias','prestacion_arancel_referencias','arancel_auditoria')"); if(tables.rows[0].n!==4) throw new Error('Migracion incompleta'); console.log(JSON.stringify({ok:true,database:db,tables:tables.rows[0].n}));
} finally { if(test)await test.end().catch(()=>{}); await admin.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`).catch(()=>{}); await admin.end().catch(()=>{}); } })().catch(e=>{console.error(e);process.exitCode=1});
