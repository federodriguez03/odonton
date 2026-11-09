const assert=require('node:assert/strict');
const dbPath=require.resolve('../src/config/db');
let activa=true;
const pool={async query(sql,params=[]){const q=String(sql).replace(/\s+/g,' ').trim().toLowerCase();
  if(q.startsWith('update odontograma_referencias')){activa=Boolean(params[1]);return{rows:[{id:1,codigo:'existente',nombre:'Existente',color:'#FF4D4D',activa}],rowCount:1};}
  if(q.startsWith('select'))return{rows:[{id:1,codigo:'existente',nombre:'Existente',color:'#FF4D4D',activa}],rowCount:1};
  throw new Error(`SQL no esperado: ${q}`);
}};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{pool}};
const service=require('../src/services/odontogramaReferenciasService');
(async()=>{await service.cambiarActiva(1,false);const todas=await service.listar();assert.equal(todas.length,1);assert.equal(todas[0].activa,false);console.log('OK - una referencia inactiva permanece disponible para visualizar registros anteriores');})().catch(e=>{console.error(e);process.exitCode=1;});
