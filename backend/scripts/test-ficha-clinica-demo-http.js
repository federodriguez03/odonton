const assert=require('node:assert/strict');
require('dotenv').config();
const {pool}=require('../src/config/db');
const {generarToken}=require('../src/utils/jwt');
(async()=>{
  const paciente=(await pool.query("SELECT id FROM pacientes WHERE observaciones LIKE '[DATOS FICTICIOS DEMO 2026]%' ORDER BY id LIMIT 1")).rows[0];
  assert.ok(paciente,'Debe existir al menos un paciente demo');
  const token=generarToken({userId:1,email:'verificacion.local@odonton.local',rol:'odontologo'});
  const response=await fetch(`http://127.0.0.1:3000/api/pacientes/${paciente.id}/ficha-clinica`,{headers:{Authorization:`Bearer ${token}`}});
  const data=await response.json();
  assert.equal(response.status,200,data.mensaje);
  assert.ok(data.profesionales.length>0,'La ficha debe ofrecer profesionales');
  assert.ok(data.turnosParaConsulta.length>0,'La ficha debe ofrecer turnos asociables');
  assert.ok(data.historiasClinicas.some((consulta)=>consulta.odontograma_snapshot?.registros?.length),'Debe exponer snapshots gráficos históricos');
  console.log(`OK - ficha demo ${paciente.id}: ${data.historiasClinicas.length} atenciones, ${data.turnosParaConsulta.length} turnos asociables y ${data.profesionales.length} profesionales`);
  await pool.end();
})().catch(async(error)=>{console.error(error);await pool.end();process.exitCode=1;});
