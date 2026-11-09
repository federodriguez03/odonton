require('dotenv').config();
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');

const TAG = '[DATOS FICTICIOS DEMO 2026]';
const nombres = ['Sofía','Mateo','Valentina','Benjamín','Martina','Joaquín','Catalina','Bautista','Emilia','Thiago','Lucía','Lautaro','Camila','Tomás','Julieta','Santino','Malena','Franco','Renata','Bruno','María José','Juan Cruz','Ana Paula','Pedro'];
const apellidos = ['González','Rodríguez','Fernández','López','Martínez','Pérez','Gómez','Sánchez','Romero','Díaz','Álvarez','Ruiz','Torres','Suárez','Castro','Ortiz','Silva','Núñez','Molina','Rojas','Benítez','Acosta','Medina','Herrera'];
const paises = ['Argentina','Argentina','Argentina','Argentina','Paraguay','Bolivia','Chile','Perú','Uruguay','Venezuela'];
const alergias = [null,null,null,'Penicilina','Látex','Ibuprofeno','Anestésicos locales'];
const condiciones = [null,null,'Hipertensión controlada','Diabetes tipo 2 controlada','Bruxismo','Embarazo','Asma leve'];
const motivos = ['Control periódico','Dolor dental','Sensibilidad al frío','Limpieza preventiva','Consulta por caries','Molestia al masticar','Control de tratamiento','Sangrado de encías'];
const diagnosticos = ['Sin patología activa','Caries oclusal incipiente','Gingivitis leve','Desgaste dental compatible con bruxismo','Pieza con restauración filtrada','Sensibilidad dentinaria','Acumulación de placa y sarro','Evolución favorable'];
const tratamientos = ['Examen clínico y control','Profilaxis y educación de higiene','Obturación simple','Aplicación de flúor','Limpieza con ultrasonido','Ajuste oclusal','Radiografía de control indicada','Control postoperatorio'];
const planes = ['Control en seis meses','Reforzar higiene interdental','Continuar tratamiento indicado','Evaluar evolución en treinta días','Evitar alimentos duros por 48 horas','Utilizar pasta desensibilizante','Solicitar radiografía panorámica'];
const dientes = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
const caras = ['vestibular','mesial','distal','oclusal','lingual'];
const estados = ['existente','requerido','corona','protesis_fija','ausente','extraccion_indicada'];

function pick(list, seed) { return list[Math.abs(seed) % list.length]; }
function fechaLocal(month, day, hour) {
  return `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00-03:00`;
}
function sumarMinutos(iso, minutes) { return new Date(new Date(iso).getTime() + minutes * 60000).toISOString(); }
function snapshot(registros, meta, referencias, fecha) {
  return { version: 1, capturado_at: new Date(fecha).toISOString(), registros: registros.map((r) => ({...r})), meta: {...meta}, referencias };
}

async function main() {
  // Comprobar configuración antes de abrir una conexión o escribir datos.
  validarEntornoDemo(process.env, process.argv.slice(2), pool.options.database || process.env.DB_NAME);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query("SELECT COUNT(*)::int total FROM pacientes WHERE observaciones LIKE $1", [`${TAG}%`]);
    if (existing.rows[0].total > 0) {
      await client.query('ROLLBACK');
      console.log(`La carga demo ya existe (${existing.rows[0].total} pacientes). No se duplicó.`);
      return;
    }
    const profesional = (await client.query('SELECT id FROM usuarios WHERE activo=TRUE ORDER BY id LIMIT 1')).rows[0];
    if (!profesional) throw new Error('No existe un profesional activo para asociar la actividad demo');
    const prestaciones = (await client.query('SELECT DISTINCT ON (nombre) id,nombre FROM prestaciones WHERE activo=TRUE ORDER BY nombre,id')).rows;
    if (!prestaciones.length) throw new Error('No existen prestaciones activas');
    const referencias = (await client.query('SELECT codigo,nombre,color FROM odontograma_referencias ORDER BY id')).rows;
    const totals = { pacientes:0, turnos:0, consultas:0, odontograma:0, metas:0 };

    for (let i=0; i<55; i++) {
      const month = (i % 11) + 1;
      const day = 2 + ((i * 5) % 24);
      const nombre = pick(nombres,i*7);
      const apellido = `${pick(apellidos,i*5)}${i >= apellidos.length ? ` ${pick(apellidos,i*11+3)}` : ''}`;
      const dni = String(91000001 + i);
      const nacimientoYear = 1955 + ((i*7)%50);
      const alergia = pick(alergias,i*3);
      const condicion = pick(condiciones,i*4);
      const created = fechaLocal(month,day,8);
      const patient = await client.query(
        `INSERT INTO pacientes(nombre,apellido,dni,nacionalidad,domicilio,telefono,email,fecha_nacimiento,observaciones,alergias,condiciones,estado_tratamiento,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
        [nombre,apellido,dni,pick(paises,i),`Calle Demo ${100+i}, Córdoba`, `54935155${String(1000+i).padStart(4,'0')}`, `paciente.demo${i+1}@odonton.local`, `${nacimientoYear}-${String((i%12)+1).padStart(2,'0')}-${String((i%27)+1).padStart(2,'0')}`, `${TAG} Paciente generado para pruebas locales.`, alergia, condicion, pick(['En control','Tratamiento activo','Alta preventiva'],i), created],
      );
      const pacienteId = patient.rows[0].id; totals.pacientes++;
      const meta = { sarro:i%4===0, periodontal:i%9===0, observaciones:`${TAG} Control odontológico simulado.` };
      await client.query('INSERT INTO odontograma_meta(paciente_id,sarro,periodontal,observaciones,updated_at) VALUES($1,$2,$3,$4,$5)',[pacienteId,meta.sarro,meta.periodontal,meta.observaciones,created]); totals.metas++;

      const finalRecords=[];
      const recordCount=8+(i%10);
      const used=new Set();
      for(let r=0;r<recordCount;r++){
        const diente=pick(dientes,i*13+r*7), cara=pick(caras,i+r*3), key=`${diente}-${cara}`;
        if(used.has(key)) continue; used.add(key);
        finalRecords.push({diente,cara,estado:pick(estados,i+r*5)});
      }
      const consultationCount=2+(i%4);
      for(let c=0;c<consultationCount;c++){
        const cMonth=Math.min(11,month+c*2);
        const cDay=Math.min(28,day+c*2);
        const start=fechaLocal(cMonth,cDay,9+((i+c)%8));
        const prestacion=pick(prestaciones,i+c);
        const turno=await client.query(
          `INSERT INTO turnos(paciente_id,prestacion_id,fecha_hora_inicio,fecha_hora_fin,estado,origen,observaciones,created_at,updated_at,profesional_id,recordatorio_habilitado)
           VALUES($1,$2,$3,$4,'realizado','interno',$5,$3,$3,$6,FALSE) RETURNING id`,
          [pacienteId,prestacion.id,start,sumarMinutos(start,45),`${TAG} Turno clínico simulado.`,profesional.id],
        ); totals.turnos++;
        const visibleCount=Math.max(2,Math.ceil(finalRecords.length*(c+1)/consultationCount));
        const snap=snapshot(finalRecords.slice(0,visibleCount),meta,referencias,start);
        await client.query(
          `INSERT INTO historias_clinicas(paciente_id,turno_id,descripcion,created_at,fecha_atencion,profesional_id,motivo_consulta,diagnostico,tratamientos_realizados,plan_indicaciones,observaciones,odontograma_snapshot)
           VALUES($1,$2,$3,$4,$4,$5,$3,$6,$7,$8,$9,$10)`,
          [pacienteId,turno.rows[0].id,pick(motivos,i+c*2),start,profesional.id,pick(diagnosticos,i*2+c),pick(tratamientos,i+c*3),pick(planes,i*4+c),`${TAG} Evolución ficticia sin valor clínico.`,JSON.stringify(snap)],
        ); totals.consultas++;
      }
      if(i%3===0){
        const cancelDate=fechaLocal(Math.min(11,month+1),Math.min(27,day+1),15);
        await client.query(`INSERT INTO turnos(paciente_id,prestacion_id,fecha_hora_inicio,fecha_hora_fin,estado,origen,observaciones,created_at,updated_at,fecha_cancelacion,profesional_id,recordatorio_habilitado) VALUES($1,$2,$3,$4,'cancelado','interno',$5,$3,$3,$3,$6,FALSE)`,[pacienteId,pick(prestaciones,i+2).id,cancelDate,sumarMinutos(cancelDate,30),`${TAG} Cancelación simulada.`,profesional.id]); totals.turnos++;
      }
      if(i%4===0){
        const future=fechaLocal(11,10+(i%18),10+(i%6));
        await client.query(`INSERT INTO turnos(paciente_id,prestacion_id,fecha_hora_inicio,fecha_hora_fin,estado,origen,observaciones,created_at,updated_at,profesional_id,recordatorio_habilitado) VALUES($1,$2,$3,$4,'programado','interno',$5,$6,$6,$7,FALSE)`,[pacienteId,pick(prestaciones,i+4).id,future,sumarMinutos(future,45),`${TAG} Turno futuro simulado.`,created,profesional.id]); totals.turnos++;
      }
      for(const record of finalRecords){
        await client.query('INSERT INTO odontograma(paciente_id,diente,cara,estado,fecha) VALUES($1,$2,$3,$4,$5)',[pacienteId,record.diente,record.cara,record.estado,fechaLocal(11,Math.min(28,day),16)]); totals.odontograma++;
      }
    }
    await client.query('COMMIT');
    console.log(JSON.stringify(totals,null,2));
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); await pool.end(); }
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
