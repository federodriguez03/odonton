const { pool } = require('../config/db');

const { requireSchema } = require('./schemaValidationService');

let columnasReady = false;
const CAMPOS = 'id, codigo, nombre, categoria, duracion_minutos, precio_base, precio_modalidad, activo';

async function asegurarColumnasPrestaciones() {
  if (columnasReady) return;
  await requireSchema('prestaciones', ['prestaciones.activo', 'prestaciones.updated_at']);
  columnasReady = true;
}

const limpiar = (value) => String(value || '').trim();
const opcional = (value) => limpiar(value) || null;

function validarPrestacion(data) {
  const nombre = limpiar(data.nombre);
  if (!nombre) throw new Error('nombre requerido');
  const duracion = Number(data.duracion_minutos);
  if (!Number.isFinite(duracion) || duracion < 15) throw new Error('duracion_minutos invalida (min 15)');
  const modalidad = data.precio_modalidad;
  if (!['fijo', 'a_convenir', 'sin_definir'].includes(modalidad)) throw new Error('modalidad de precio requerida');
  let precio = null;
  if (modalidad === 'fijo') {
    precio = Number(data.precio_base);
    if (!Number.isFinite(precio) || precio <= 0) throw new Error('El precio fijo debe ser mayor que cero');
  }
  return { codigo: opcional(data.codigo), nombre, categoria: opcional(data.categoria), duracion, precio, modalidad };
}

async function existeDuplicado(client, campo, value, excludeId = null) {
  if (!value) return false;
  const params = excludeId ? [value, excludeId] : [value];
  const result = await client.query(
    `SELECT id FROM prestaciones WHERE LOWER(TRIM(${campo}))=LOWER(TRIM($1)) ${excludeId ? 'AND id<>$2' : ''} LIMIT 1`, params,
  );
  return result.rowCount > 0;
}

async function auditar(client, id, usuarioId, accion, anterior, nuevo) {
  await client.query(
    `INSERT INTO prestaciones_historial (prestacion_id,usuario_id,accion,valores_anteriores,valores_nuevos)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)`,
    [id, usuarioId || null, accion, anterior ? JSON.stringify(anterior) : null, JSON.stringify(nuevo)],
  );
}

async function listarPrestaciones({ incluirInactivas = false, estado = null } = {}) {
  await asegurarColumnasPrestaciones();
  let filtro='AND activo=true';
  if(incluirInactivas||estado==='todas') filtro='';
  if(estado==='inactivas') filtro='AND activo=false';
  if(estado==='pendientes') filtro='AND duracion_minutos IS NULL';
  const { rows } = await pool.query(`WITH normalizadas AS (
    SELECT ${CAMPOS}, ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(nombre)) ORDER BY activo DESC,id ASC) rn
    FROM prestaciones WHERE nombre IS NOT NULL AND TRIM(nombre)<>'' ${filtro}
  ) SELECT ${CAMPOS} FROM normalizadas WHERE rn=1 ORDER BY nombre`);
  if (rows.length) {
    const ids=rows.map((row)=>row.id);
    const linked=await pool.query(`SELECT DISTINCT ON (l.prestacion_id) l.prestacion_id,
      r.codigo,r.nombre,r.categoria,r.precio,r.estado_precio,r.pagina_pdf,
      v.fuente,v.version_documental,v.moneda,v.vigencia::text,v.archivo_hash_sha256
      FROM prestacion_arancel_referencias l
      JOIN arancel_referencias r ON r.id=l.referencia_id
      JOIN arancel_versiones v ON v.id=r.version_id
      WHERE l.prestacion_id=ANY($1::int[])
      ORDER BY l.prestacion_id,v.vigencia DESC,v.id DESC`,[ids]);
    const byId=new Map(linked.rows.map((item)=>[Number(item.prestacion_id),item]));
    rows.forEach((row)=>{ row.referencia_arancel=byId.get(Number(row.id)) || null; });
  }
  return { total: rows.length, prestaciones: rows };
}

async function crearPrestacion(payload, usuarioId = null) {
  await asegurarColumnasPrestaciones();
  const data = validarPrestacion(payload);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (await existeDuplicado(client, 'nombre', data.nombre)) throw new Error('Prestacion ya registrada');
    if (await existeDuplicado(client, 'codigo', data.codigo)) throw new Error('Codigo de prestacion ya registrado');
    const { rows } = await client.query(
      `INSERT INTO prestaciones (codigo,nombre,categoria,duracion_minutos,precio_base,precio_modalidad,activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${CAMPOS}`,
      [data.codigo,data.nombre,data.categoria,data.duracion,data.precio,data.modalidad,payload.activo !== false],
    );
    await auditar(client, rows[0].id, usuarioId, 'crear', null, rows[0]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function actualizarPrestacion(id, payload, usuarioId = null) {
  await asegurarColumnasPrestaciones();
  const data = validarPrestacion(payload);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT ${CAMPOS} FROM prestaciones WHERE id=$1 FOR UPDATE`, [id]);
    if (!before.rowCount) throw new Error('Prestacion no encontrada');
    if (await existeDuplicado(client, 'nombre', data.nombre, id)) throw new Error('Prestacion ya registrada');
    if (await existeDuplicado(client, 'codigo', data.codigo, id)) throw new Error('Codigo de prestacion ya registrado');
    const { rows } = await client.query(
      `UPDATE prestaciones SET codigo=$1,nombre=$2,categoria=$3,duracion_minutos=$4,precio_base=$5,
       precio_modalidad=$6,activo=$7,updated_at=NOW() WHERE id=$8 RETURNING ${CAMPOS}`,
      [data.codigo,data.nombre,data.categoria,data.duracion,data.precio,data.modalidad,payload.activo !== false,id],
    );
    await auditar(client, id, usuarioId, 'actualizar', before.rows[0], rows[0]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function setActivoPrestacion(id, activo, usuarioId = null) {
  await asegurarColumnasPrestaciones();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query(`SELECT ${CAMPOS} FROM prestaciones WHERE id=$1 FOR UPDATE`, [id]);
    if (!before.rowCount) throw new Error('Prestacion no encontrada');
    if (activo && (!Number.isFinite(Number(before.rows[0].duracion_minutos)) || Number(before.rows[0].duracion_minutos) < 15)) {
      throw new Error('Para activar la prestacion debe configurar una duracion valida (min 15)');
    }
    const { rows } = await client.query(`UPDATE prestaciones SET activo=$1,updated_at=NOW() WHERE id=$2 RETURNING ${CAMPOS}`, [Boolean(activo),id]);
    await auditar(client, id, usuarioId, activo ? 'activar' : 'desactivar', before.rows[0], rows[0]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

async function configurarDuracionYActivar(idsInput, duracionInput, usuarioId = null) {
  const ids=(Array.isArray(idsInput)?idsInput:[]).map(Number);
  if(!ids.length||ids.some((id)=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length) throw new Error('Debe seleccionar prestaciones validas sin duplicados');
  const duracion=Number(duracionInput);
  if(!Number.isFinite(duracion)||!Number.isInteger(duracion)||duracion<15) throw new Error('La duracion debe ser un entero de al menos 15 minutos');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const current=await client.query(`SELECT ${CAMPOS} FROM prestaciones WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE`,[ids]);
    if(current.rowCount!==ids.length) throw new Error('Una o mas prestaciones no existen');
    const updated=[];
    for(const before of current.rows) {
      const after=(await client.query(`UPDATE prestaciones SET duracion_minutos=$1,activo=true,updated_at=NOW() WHERE id=$2 RETURNING ${CAMPOS}`,[duracion,before.id])).rows[0];
      await auditar(client,before.id,usuarioId,'configurar_duracion_y_activar',before,after);
      updated.push(after);
    }
    await client.query('COMMIT');
    return {cantidad:updated.length,duracion_minutos:duracion,prestaciones:updated};
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}

async function normalizarPrestacionesDuplicadas() {
  await asegurarColumnasPrestaciones();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const duplicates = await client.query(`SELECT LOWER(TRIM(nombre)) nombre_normalizado FROM prestaciones WHERE nombre IS NOT NULL AND TRIM(nombre)<>'' GROUP BY LOWER(TRIM(nombre)) HAVING COUNT(*)>1`);
    const result = { grupos: duplicates.rowCount, canonicas: [], archivadas: [], turnos_reasignados: 0 };
    for (const duplicate of duplicates.rows) {
      const group = await client.query('SELECT id,nombre,activo FROM prestaciones WHERE LOWER(TRIM(nombre))=$1 ORDER BY activo DESC,id ASC', [duplicate.nombre_normalizado]);
      const [canonical, ...others] = group.rows;
      if (!others.length) continue;
      result.canonicas.push({ id: canonical.id, nombre: canonical.nombre });
      for (const item of others) {
        await client.query(`UPDATE turno_prestaciones tp SET prestacion_id=$1 WHERE tp.prestacion_id=$2 AND NOT EXISTS (SELECT 1 FROM turno_prestaciones e WHERE e.turno_id=tp.turno_id AND e.prestacion_id=$1)`, [canonical.id,item.id]);
        const turns = await client.query('UPDATE turnos SET prestacion_id=$1 WHERE prestacion_id=$2', [canonical.id,item.id]);
        result.turnos_reasignados += turns.rowCount;
        const archivedName = `${limpiar(item.nombre)} [archivada #${item.id}]`;
        await client.query('UPDATE prestaciones SET nombre=$1,activo=false,updated_at=NOW() WHERE id=$2', [archivedName,item.id]);
        result.archivadas.push({ id:item.id,nombre_original:item.nombre,nombre_nuevo:archivedName,canonica_id:canonical.id });
      }
    }
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

module.exports = { listarPrestaciones, crearPrestacion, actualizarPrestacion, setActivoPrestacion, configurarDuracionYActivar, normalizarPrestacionesDuplicadas };
