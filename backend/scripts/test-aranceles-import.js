require('dotenv').config();
const fs=require('fs'); const path=require('path'); const crypto=require('crypto');
const {pool}=require('../src/config/db'); const service=require('../src/services/arancelesImportService');
(async()=>{
  const db=(await pool.query('SELECT current_database() db')).rows[0].db; if(db!=='odonton_ficha_20261109_test')throw new Error(`Base no autorizada: ${db}`);
  const user=(await pool.query('SELECT id FROM usuarios ORDER BY id LIMIT 1')).rows[0]; const prestation=(await pool.query('SELECT id,precio_base,nombre,duracion_minutos FROM prestaciones ORDER BY id LIMIT 1')).rows[0];
  const cargoBefore=(await pool.query('SELECT count(*)::int cantidad,COALESCE(sum(importe_total),0)::text total FROM cargos')).rows[0];
  const sourceBuffer=fs.readFileSync(path.join(process.env.USERPROFILE,'Downloads','prestaciones_odonton_agosto_2026.csv'));
  const buffer=Buffer.concat([sourceBuffer,Buffer.from('\r\n')]);
  const file={buffer,originalname:'prestaciones_odonton_agosto_2026.csv'}; const input={fuente:`TEST Colegio ${Date.now()}`,version_documental:'TEST manual',moneda:'ARS',vigencia:'2026-01-15'};
  const hash=crypto.createHash('sha256').update(buffer).digest('hex'); let versionId;
  try {
    const preview=await service.previewImport({file,input}); if(preview.resumen.validas!==254||preview.resumen.errores!==0)throw new Error('Vista previa inesperada');
    const mapping=[{codigo:preview.filas[0].codigo,prestacion_id:prestation.id}];
    const results=await Promise.all([service.confirmImport({file,input,mappings:mapping,userId:user.id}),service.confirmImport({file,input,mappings:mapping,userId:user.id})]); versionId=results[0].version_id;
    const counts=(await pool.query(`SELECT (SELECT count(*) FROM arancel_versiones WHERE archivo_hash_sha256=$1)::int versiones,
      (SELECT count(*) FROM arancel_referencias WHERE version_id=$2)::int referencias,
      (SELECT count(*) FROM prestacion_arancel_referencias l JOIN arancel_referencias r ON r.id=l.referencia_id WHERE r.version_id=$2)::int vinculos`,[hash,versionId])).rows[0];
    const after=await pool.query('SELECT precio_base,nombre,duracion_minutos FROM prestaciones WHERE id=$1',[prestation.id]); const cargoAfter=(await pool.query('SELECT count(*)::int cantidad,COALESCE(sum(importe_total),0)::text total FROM cargos')).rows[0];
    if(counts.versiones!==1||counts.referencias!==254||counts.vinculos!==1)throw new Error('Idempotencia o vinculo incorrecto');
    if(String(after.rows[0].precio_base)!==String(prestation.precio_base)||after.rows[0].nombre!==prestation.nombre||after.rows[0].duracion_minutos!==prestation.duracion_minutos)throw new Error('Se altero la prestacion operativa');
    if(JSON.stringify(cargoBefore)!==JSON.stringify(cargoAfter))throw new Error('Se alteraron cargos historicos');
    const invalid=Buffer.from(buffer.toString('utf8')+'\n101,Duplicada,Fila duplicada,10,Precio indicado,3\n'); const bad=await service.previewImport({file:{buffer:invalid,originalname:'invalido.csv'},input}); if(!bad.errores.length)throw new Error('No se detecto codigo duplicado');
    console.log(JSON.stringify({ok:true,database:db,preview:preview.resumen,simultaneas:results.map(r=>r.reutilizada),...counts,precios_y_cargos_conservados:true,errores_detectados:bad.errores.length}));
  } finally {
    const versions=await pool.query('SELECT id FROM arancel_versiones WHERE archivo_hash_sha256=$1',[hash]); for(const v of versions.rows){await pool.query('DELETE FROM prestacion_arancel_referencias WHERE referencia_id IN (SELECT id FROM arancel_referencias WHERE version_id=$1)',[v.id]);await pool.query('DELETE FROM arancel_auditoria WHERE version_id=$1',[v.id]);await pool.query('DELETE FROM arancel_referencias WHERE version_id=$1',[v.id]);await pool.query('DELETE FROM arancel_versiones WHERE id=$1',[v.id]);}
    await pool.end();
  }
})().catch(e=>{console.error(e);process.exitCode=1});
