const assert = require('node:assert/strict');
const dbPath = require.resolve('../src/config/db');
const odontoPath = require.resolve('../src/services/odontogramaService');
let documentPatient = 2;
const events=[];
const client={
  async query(sql,params=[]){const q=String(sql).replace(/\s+/g,' ').trim();events.push(q);
    if(q==='BEGIN'||q==='COMMIT'||q==='ROLLBACK')return{rows:[],rowCount:0};
    if(q.startsWith('SELECT EXISTS'))return{rows:[{paciente:true,profesional:true}],rowCount:1};
    if(q.startsWith('SELECT id FROM historias_clinicas WHERE id='))return{rows:[{id:9}],rowCount:1};
    if(q.startsWith('INSERT INTO historias_clinicas'))return{rows:[{id:9,paciente_id:1,odontograma_snapshot:{registros:[{diente:11,estado:'sano'}]}}],rowCount:1};
    if(q.startsWith('UPDATE historias_clinicas SET'))return{rows:[{id:9,paciente_id:1,motivo_consulta:params[3]}],rowCount:1};
    if(q.startsWith('UPDATE documentos_paciente'))return documentPatient===params[2]?{rows:[{id:params[1]}],rowCount:1}:{rows:[],rowCount:0};
    return{rows:[],rowCount:0};
  }, release(){events.push('RELEASE');}
};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{pool:{connect:async()=>client}}};
require.cache[odontoPath]={id:odontoPath,filename:odontoPath,loaded:true,exports:{
  guardarOdontogramaCompleto:async()=>events.push('ODONTO_UPDATE'),
  crearSnapshot:async()=>({version:1,registros:[{diente:11,estado:'sano'}]}),
}};
const service=require('../src/services/consultasClinicasService');
(async()=>{
  const ok=await service.crearConsulta({pacienteId:1,actorId:3,datos:{motivo_consulta:'Control',odontograma:{},documento_ids:[]}});
  assert.equal(ok.id,9);assert.ok(events.includes('COMMIT'));
  events.length=0;documentPatient=2;
  await assert.rejects(service.crearConsulta({pacienteId:1,actorId:3,datos:{motivo_consulta:'Control',documento_ids:[5]}}),/otro paciente/);
  assert.ok(events.includes('ROLLBACK'),'Una asociación cruzada debe revertir toda la atención');
  events.length=0;
  const editada=await service.actualizarConsulta({pacienteId:1,consultaId:9,datos:{fecha_atencion:'2026-11-01T10:00:00-03:00',profesional_id:3,motivo_consulta:'Control editado',diagnostico:'Sin cambios'}});
  assert.equal(editada.motivo_consulta,'Control editado');
  const updateSql=events.find((event)=>event.startsWith('UPDATE historias_clinicas SET'));
  assert.ok(updateSql && !updateSql.includes('odontograma_snapshot'),'Editar la atención no debe reescribir el snapshot histórico');
  console.log('OK - atención y snapshot se coordinan en transacción');
  console.log('OK - documentos de otro paciente se rechazan y hacen rollback');
  console.log('OK - la edición conserva intacto el snapshot histórico');
})().catch(e=>{console.error(e);process.exitCode=1;});
