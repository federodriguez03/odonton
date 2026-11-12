const crypto = require('crypto');
const { pool } = require('../config/db');

const HEADERS = ['codigo','categoria','nombre','precio_ars','estado_precio','pagina_pdf'];

function parseCsv(text) {
  const rows=[]; let row=[]; let field=''; let quoted=false;
  for (let i=0;i<text.length;i+=1) {
    const char=text[i];
    if (quoted) {
      if (char==='"' && text[i+1]==='"') { field+='"'; i+=1; }
      else if (char==='"') quoted=false; else field+=char;
    } else if (char==='"') quoted=true;
    else if (char===',') { row.push(field); field=''; }
    else if (char==='\n') { row.push(field.replace(/\r$/,'')); rows.push(row); row=[]; field=''; }
    else field+=char;
  }
  if (quoted) throw new Error('CSV invalido: comillas sin cerrar');
  if (field || row.length) { row.push(field.replace(/\r$/,'')); rows.push(row); }
  return rows.filter((item)=>item.some((value)=>String(value).trim()!==''));
}

function normalizeName(value) {
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function similarity(a,b) {
  const aa=new Set(normalizeName(a).split(' ').filter((x)=>x.length>2)); const bb=new Set(normalizeName(b).split(' ').filter((x)=>x.length>2));
  if (!aa.size || !bb.size) return 0;
  let common=0; aa.forEach((x)=>{ if(bb.has(x)) common+=1; }); return (2*common)/(aa.size+bb.size);
}
function metadata(input) {
  const result={ fuente:String(input.fuente||'').trim(),version_documental:String(input.version_documental||'').trim(),moneda:String(input.moneda||'').trim().toUpperCase(),vigencia:String(input.vigencia||'').trim() };
  if (!result.fuente || !result.version_documental || !result.moneda) throw new Error('Fuente, version documental y moneda son obligatorias');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.vigencia)) throw new Error('La vigencia explicita es obligatoria (AAAA-MM-DD)');
  return result;
}
function validateFile(file) {
  if (!file?.buffer?.length) throw new Error('Archivo CSV requerido');
  if (file.buffer.length > 2*1024*1024) throw new Error('El CSV supera el limite de 2 MB');
  const hash=crypto.createHash('sha256').update(file.buffer).digest('hex');
  const matrix=parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/,''));
  if (!matrix.length) throw new Error('CSV vacio');
  const headers=matrix[0].map((h)=>String(h).trim().toLowerCase());
  if (HEADERS.some((h,i)=>headers[i]!==h) || headers.length!==HEADERS.length) throw new Error(`Encabezados requeridos: ${HEADERS.join(', ')}`);
  const seen=new Map(); const valid=[]; const errors=[];
  matrix.slice(1).forEach((values,index)=>{
    const line=index+2; const [codigoRaw,categoriaRaw,nombreRaw,precioRaw,estadoRaw,paginaRaw]=values;
    const codigo=String(codigoRaw||'').trim(), categoria=String(categoriaRaw||'').trim(), nombre=String(nombreRaw||'').trim();
    const estado_precio=String(estadoRaw||'').trim(), precioText=String(precioRaw||'').trim(), pageText=String(paginaRaw||'').trim();
    const reasons=[];
    if (!codigo) reasons.push('codigo requerido'); if(!categoria) reasons.push('categoria requerida'); if(!nombre) reasons.push('nombre requerido'); if(!estado_precio) reasons.push('estado_precio requerido');
    let precio=null; if(precioText) { precio=Number(precioText); if(!Number.isFinite(precio)||precio<=0) reasons.push('precio_ars debe ser positivo o estar vacio'); }
    if(estado_precio==='Precio indicado' && precio===null) reasons.push('Precio indicado requiere precio_ars');
    const pagina_pdf=Number(pageText); if(!Number.isSafeInteger(pagina_pdf)||pagina_pdf<=0) reasons.push('pagina_pdf debe ser entero positivo');
    if(seen.has(codigo)) reasons.push(`codigo duplicado; primera aparicion en fila ${seen.get(codigo)}`); else if(codigo) seen.set(codigo,line);
    const item={ fila_csv:line,codigo,categoria,nombre,precio,estado_precio,pagina_pdf:Number.isSafeInteger(pagina_pdf)?pagina_pdf:null };
    if(reasons.length) errors.push({ fila_csv:line,codigo,motivos:reasons }); else valid.push(item);
  });
  return { hash, valid, errors };
}

async function previewImport({ file, input }) {
  const meta=metadata(input); const parsed=validateFile(file);
  const [catalog, previous, existingHash]=await Promise.all([
    pool.query('SELECT id,codigo,nombre,categoria,duracion_minutos,precio_base,precio_modalidad FROM prestaciones ORDER BY nombre'),
    pool.query(`SELECT DISTINCT ON (r.codigo) r.codigo,r.nombre,r.categoria,r.precio,r.estado_precio,r.pagina_pdf
      FROM arancel_referencias r JOIN arancel_versiones v ON v.id=r.version_id WHERE LOWER(v.fuente)=LOWER($1)
      ORDER BY r.codigo,v.vigencia DESC,v.id DESC`,[meta.fuente]),
    pool.query('SELECT id FROM arancel_versiones WHERE archivo_hash_sha256=$1',[parsed.hash]),
  ]);
  const old=new Map(previous.rows.map((r)=>[r.codigo,r]));
  const rows=parsed.valid.map((item)=>{
    const prior=old.get(item.codigo); let tipo='nueva';
    if(prior) tipo=['nombre','categoria','precio','estado_precio','pagina_pdf'].some((key)=>String(prior[key]??'')!==String(item[key]??''))?'cambio':'sin_cambios';
    const candidates=catalog.rows.map((p)=>({ prestacion_id:p.id,nombre:p.nombre,score:normalizeName(p.nombre)===normalizeName(item.nombre)?1:similarity(p.nombre,item.nombre) }))
      .filter((candidate)=>candidate.score>=0.55).sort((a,b)=>b.score-a.score).slice(0,3);
    return { ...item,tipo,candidatos:candidates };
  });
  return { metadata:meta,archivo:{ nombre:file.originalname,hash_sha256:parsed.hash,ya_importado:Boolean(existingHash.rowCount) },
    resumen:{ validas:rows.length,errores:parsed.errors.length,nuevas:rows.filter(r=>r.tipo==='nueva').length,cambios:rows.filter(r=>r.tipo==='cambio').length,sin_cambios:rows.filter(r=>r.tipo==='sin_cambios').length,correspondencias:rows.filter(r=>r.candidatos.length).length },
    filas:rows,errores:parsed.errors,prestaciones:catalog.rows };
}

async function confirmImport({ file, input, mappings, userId }) {
  const meta=metadata(input); const parsed=validateFile(file);
  if(parsed.errors.length) { const error=new Error('El CSV contiene errores; no se aplicaron cambios'); error.details=parsed.errors; throw error; }
  const mapArray=Array.isArray(mappings)?mappings:[];
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[parsed.hash]);
    let version=(await client.query('SELECT * FROM arancel_versiones WHERE archivo_hash_sha256=$1',[parsed.hash])).rows[0];
    let reused=Boolean(version);
    if(!version) {
      version=(await client.query(`INSERT INTO arancel_versiones (fuente,version_documental,moneda,vigencia,archivo_nombre,archivo_hash_sha256,creado_por_usuario_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[meta.fuente,meta.version_documental,meta.moneda,meta.vigencia,file.originalname,parsed.hash,userId])).rows[0];
      for(const row of parsed.valid) await client.query(`INSERT INTO arancel_referencias (version_id,fila_csv,codigo,nombre,categoria,precio,estado_precio,pagina_pdf) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[version.id,row.fila_csv,row.codigo,row.nombre,row.categoria,row.precio,row.estado_precio,row.pagina_pdf]);
    }
    const refs=await client.query('SELECT id,codigo FROM arancel_referencias WHERE version_id=$1',[version.id]); const byCode=new Map(refs.rows.map(r=>[r.codigo,r.id]));
    const usedPrest=new Set(); const usedCode=new Set();
    for(const mapping of mapArray) {
      const code=String(mapping.codigo||'').trim(); const prestationId=Number(mapping.prestacion_id);
      if(!byCode.has(code)) throw new Error(`Correspondencia invalida para codigo ${code}`);
      if(!Number.isSafeInteger(prestationId)||prestationId<=0) throw new Error(`Prestacion invalida para codigo ${code}`);
      if(usedCode.has(code)||usedPrest.has(prestationId)) throw new Error('Correspondencias duplicadas en la confirmacion');
      usedCode.add(code); usedPrest.add(prestationId);
      const exists=await client.query('SELECT id FROM prestaciones WHERE id=$1',[prestationId]); if(!exists.rowCount) throw new Error(`Prestacion inexistente: ${prestationId}`);
      await client.query(`INSERT INTO prestacion_arancel_referencias (prestacion_id,referencia_id,vinculado_por_usuario_id) VALUES ($1,$2,$3)
        ON CONFLICT (referencia_id) DO UPDATE SET prestacion_id=EXCLUDED.prestacion_id,vinculado_por_usuario_id=EXCLUDED.vinculado_por_usuario_id,created_at=NOW()`,[prestationId,byCode.get(code),userId]);
    }
    await client.query(`INSERT INTO arancel_auditoria (version_id,usuario_id,accion,detalle) VALUES ($1,$2,$3,$4::jsonb)`,[version.id,userId,reused?'reimportar_archivo':'importar_archivo',JSON.stringify({ hash_sha256:parsed.hash,filas:parsed.valid.length,correspondencias:mapArray,reutilizada:reused })]);
    await client.query('COMMIT');
    return { version_id:version.id,reutilizada:reused,referencias:refs.rowCount,correspondencias:mapArray.length,hash_sha256:parsed.hash };
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function getVersion(queryable, versionId = null) {
  const result=versionId
    ? await queryable.query('SELECT * FROM arancel_versiones WHERE id=$1',[versionId])
    : await queryable.query('SELECT * FROM arancel_versiones ORDER BY vigencia DESC,id DESC LIMIT 1');
  if(!result.rowCount) throw new Error('No hay una version de aranceles importada');
  return result.rows[0];
}

async function bulkCatalogPreview({ versionId = null } = {}) {
  const version=await getVersion(pool,versionId);
  const [refs,catalog]=await Promise.all([
    pool.query(`SELECT r.*,l.prestacion_id FROM arancel_referencias r LEFT JOIN prestacion_arancel_referencias l ON l.referencia_id=r.id WHERE r.version_id=$1 ORDER BY r.fila_csv`,[version.id]),
    pool.query('SELECT id,codigo,nombre,categoria,duracion_minutos,precio_base,precio_modalidad,activo FROM prestaciones ORDER BY nombre'),
  ]);
  const rows=refs.rows.map((ref)=>{
    if(ref.prestacion_id) return {...ref,estado_carga:'ya_vinculada',candidatos:[]};
    const candidates=catalog.rows.map((p)=>{
      const sameCode=Boolean(ref.codigo && p.codigo && normalizeName(ref.codigo)===normalizeName(p.codigo));
      return {...p,coincide_codigo:sameCode,score:sameCode?1:(normalizeName(p.nombre)===normalizeName(ref.nombre)?1:similarity(p.nombre,ref.nombre))};
    }).filter((p)=>p.coincide_codigo||p.score>=0.55).sort((a,b)=>Number(b.coincide_codigo)-Number(a.coincide_codigo)||b.score-a.score).slice(0,5);
    return {...ref,estado_carga:candidates.length?'pendiente_resolver':'lista_para_crear',candidatos:candidates};
  });
  return {version,filas:rows,resumen:{total:rows.length,crear:rows.filter(r=>r.estado_carga==='lista_para_crear').length,ya_vinculadas:rows.filter(r=>r.estado_carga==='ya_vinculada').length,pendientes:rows.filter(r=>r.estado_carga==='pendiente_resolver').length}};
}

function initialCatalogValues(ref) {
  if(ref.estado_precio==='Precio indicado' && ref.precio!==null) return {precio:Number(ref.precio),modalidad:'fijo',origen:ref.id};
  if(ref.estado_precio==='A convenir') return {precio:null,modalidad:'a_convenir',origen:null};
  return {precio:null,modalidad:'sin_definir',origen:null};
}

async function confirmBulkCatalog({ versionId, resolutions, userId }) {
  const decisions=new Map((Array.isArray(resolutions)?resolutions:[]).map((item)=>[Number(item.referencia_id),item]));
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('prestaciones-carga-masiva'))");
    const version=await getVersion(client,versionId);
    const refs=await client.query(`SELECT r.*,l.prestacion_id FROM arancel_referencias r LEFT JOIN prestacion_arancel_referencias l ON l.referencia_id=r.id WHERE r.version_id=$1 ORDER BY r.fila_csv FOR UPDATE OF r`,[version.id]);
    let created=0,linked=0,already=0,pending=0;
    for(const ref of refs.rows) {
      if(ref.prestacion_id) { already+=1; continue; }
      const catalog=(await client.query(`SELECT p.id,p.codigo,p.nombre FROM prestaciones p WHERE NOT EXISTS (
        SELECT 1 FROM prestacion_arancel_referencias l JOIN arancel_referencias same_ref ON same_ref.id=l.referencia_id
        WHERE l.prestacion_id=p.id AND same_ref.version_id=$1)`,[version.id])).rows;
      const candidates=catalog.map((p)=>({ ...p,coincide_codigo:Boolean(p.codigo&&normalizeName(p.codigo)===normalizeName(ref.codigo)),score:normalizeName(p.nombre)===normalizeName(ref.nombre)?1:similarity(p.nombre,ref.nombre) }))
        .filter((p)=>p.coincide_codigo||p.score>=0.55);
      const decision=decisions.get(Number(ref.id));
      if(candidates.length && !decision) { pending+=1; continue; }
      let prestationId;
      if(decision?.accion==='vincular') {
        prestationId=Number(decision.prestacion_id);
        if(!Number.isSafeInteger(prestationId)||prestationId<=0) throw new Error(`Prestacion invalida para referencia ${ref.codigo}`);
        const target=await client.query('SELECT id FROM prestaciones WHERE id=$1',[prestationId]); if(!target.rowCount) throw new Error(`Prestacion inexistente para referencia ${ref.codigo}`);
        linked+=1;
      } else if(!candidates.length || decision?.accion==='crear') {
        if(candidates.some((p)=>p.coincide_codigo)) throw new Error(`El codigo ${ref.codigo} ya pertenece a otra prestacion; debe vincularse`);
        const values=initialCatalogValues(ref);
        const inserted=await client.query(`INSERT INTO prestaciones
          (codigo,nombre,categoria,duracion_minutos,precio_base,precio_modalidad,activo,precio_inicial_referencia_id)
          VALUES ($1,$2,$3,NULL,$4,$5,false,$6) RETURNING id,codigo,nombre,categoria,duracion_minutos,precio_base,precio_modalidad,activo,precio_inicial_referencia_id`,
          [ref.codigo,ref.nombre,ref.categoria,values.precio,values.modalidad,values.origen]);
        prestationId=inserted.rows[0].id; created+=1;
        await auditarCatalogCreation(client,inserted.rows[0],userId);
      } else { pending+=1; continue; }
      await client.query(`INSERT INTO prestacion_arancel_referencias (prestacion_id,referencia_id,vinculado_por_usuario_id) VALUES ($1,$2,$3)
        ON CONFLICT (referencia_id) DO NOTHING`,[prestationId,ref.id,userId]);
    }
    const result={version_id:version.id,creadas:created,ya_vinculadas:already,vinculadas_existentes:linked,pendientes:pending};
    await client.query(`INSERT INTO arancel_auditoria (version_id,usuario_id,accion,detalle) VALUES ($1,$2,'cargar_catalogo',$3::jsonb)`,[version.id,userId,JSON.stringify({...result,resoluciones:[...decisions.values()]})]);
    await client.query('COMMIT'); return result;
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}

async function auditarCatalogCreation(client,prestation,userId) {
  await client.query(`INSERT INTO prestaciones_historial (prestacion_id,usuario_id,accion,valores_anteriores,valores_nuevos)
    VALUES ($1,$2,'crear_desde_arancel',NULL,$3::jsonb)`,[prestation.id,userId||null,JSON.stringify(prestation)]);
}

module.exports={ previewImport,confirmImport,validateFile,bulkCatalogPreview,confirmBulkCatalog };
