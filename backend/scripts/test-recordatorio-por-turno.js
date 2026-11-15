const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function compact(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createTurnosPool() {
  let state = { turnos: [], solicitudes: [], turnoPrestaciones: [] };
  let nextId = 1;

  function execute(target, sql, params = []) {
    const text = compact(sql);

    if (text.includes('information_schema.columns')) return result([{ ok: true }]);
    if (text === 'SELECT id FROM pacientes WHERE id = $1') return result([{ id: params[0] }]);
    if (text.includes('FROM prestaciones') && text.includes('ANY($1::int[])')) {
      return result(params[0].map((id) => ({ id: Number(id), nombre: `Prestacion ${id}`, duracion_minutos: 30 })));
    }
    if (text.includes('SELECT p.id FROM profesionales p')) return result([{ id: params[0] }]);
    if (text.includes('FROM profesionales_horarios_atencion')) {
      return result([{ dia_semana: 1, activo: true, hora_desde: '00:00', hora_hasta: '23:59' }]);
    }
    if (text.startsWith('SELECT EXISTS')) return result([{ existe: false }]);

    if (text.startsWith('INSERT INTO turnos')) {
      const turno = {
        id: nextId++,
        paciente_id: params[0],
        prestacion_id: params[1],
        profesional_id: null,
        profesional_perfil_id: params[2],
        fecha_hora_inicio: params[3],
        fecha_hora_fin: params[4],
        estado: 'programado',
        origen: params[5],
        observaciones: params[6],
        recordatorio_habilitado: params[7],
      };
      target.turnos.push(turno);
      return result([clone(turno)]);
    }

    if (text === 'SELECT * FROM turnos WHERE id = $1') {
      const turno = target.turnos.find((item) => Number(item.id) === Number(params[0]));
      return result(turno ? [clone(turno)] : []);
    }
    if (text === 'SELECT * FROM turnos WHERE id = $1 FOR UPDATE') {
      const turno = target.turnos.find((item) => Number(item.id) === Number(params[0]));
      return result(turno ? [clone(turno)] : []);
    }
    if (text.startsWith('SELECT prestacion_id, orden, nombre_snapshot')) {
      return result(target.turnoPrestaciones.filter((item) => Number(item.turno_id) === Number(params[0])).map(clone));
    }
    if (text === 'DELETE FROM turno_prestaciones WHERE turno_id = $1') {
      target.turnoPrestaciones = target.turnoPrestaciones.filter((item) => Number(item.turno_id) !== Number(params[0]));
      return result();
    }
    if (text.startsWith('INSERT INTO turno_prestaciones')) {
      target.turnoPrestaciones.push({ turno_id: params[0], prestacion_id: params[1], orden: params[2], nombre_snapshot: params[3], duracion_minutos_snapshot: params[4] });
      return result([{ id: target.turnoPrestaciones.length }]);
    }

    if (text.startsWith('UPDATE turnos SET paciente_id=$1')) {
      const turno = target.turnos.find((item) => Number(item.id) === Number(params[7]));
      turno.paciente_id = params[0];
      turno.prestacion_id = params[1];
      turno.profesional_id = null;
      turno.profesional_perfil_id = params[2];
      turno.fecha_hora_inicio = params[3];
      turno.fecha_hora_fin = params[4];
      turno.observaciones = params[5];
      if (params[6] !== undefined && params[6] !== null) turno.recordatorio_habilitado = params[6];
      return result([clone(turno)]);
    }

    if (text === 'SELECT id, estado FROM turnos WHERE id = $1 FOR UPDATE') {
      const turno = target.turnos.find((item) => Number(item.id) === Number(params[0]));
      return result(turno ? [{ id: turno.id, estado: turno.estado }] : []);
    }

    if (text.startsWith('UPDATE turnos SET profesional_id = NULL')) {
      const turno = target.turnos.find((item) => Number(item.id) === Number(params[0]));
      if (!turno || turno.estado !== 'solicitado') return result();
      turno.profesional_id = null;
      turno.profesional_perfil_id = params[1];
      turno.prestacion_id = params[2];
      turno.fecha_hora_inicio = params[3];
      turno.fecha_hora_fin = params[4];
      if (params[5] !== null && params[5] !== undefined) turno.observaciones = params[5];
      if (params[6] !== null && params[6] !== undefined) turno.recordatorio_habilitado = params[6];
      turno.estado = 'confirmado';
      return result([clone(turno)]);
    }

    if (text.startsWith('UPDATE turno_solicitudes SET estado = $2')) {
      const [turnoId, estadoFinal, tipos] = params;
      const changed = [];
      for (const solicitud of target.solicitudes) {
        if (
          Number(solicitud.turno_id) === Number(turnoId)
          && solicitud.estado === 'pendiente'
          && (!tipos || tipos.includes(solicitud.tipo_solicitud))
        ) {
          solicitud.estado = estadoFinal;
          changed.push(clone(solicitud));
        }
      }
      return result(changed);
    }

    throw new Error(`Consulta de turnos no contemplada: ${text}`);
  }

  return {
    async query(sql, params) {
      return execute(state, sql, params);
    },
    async connect() {
      let transaction = null;
      return {
        async query(sql, params) {
          const text = compact(sql);
          if (text === 'BEGIN') {
            transaction = clone(state);
            return result();
          }
          if (text === 'COMMIT') {
            state = transaction;
            transaction = null;
            return result();
          }
          if (text === 'ROLLBACK') {
            transaction = null;
            return result();
          }
          return execute(transaction, sql, params);
        },
        release() {},
      };
    },
    seedSolicitud() {
      const turno = {
        id: nextId++,
        paciente_id: 10,
        prestacion_id: 20,
        profesional_id: null,
        profesional_perfil_id: null,
        fecha_hora_inicio: null,
        fecha_hora_fin: null,
        estado: 'solicitado',
        origen: 'autogestion_whatsapp',
        observaciones: null,
        recordatorio_habilitado: true,
      };
      state.turnos.push(turno);
      state.solicitudes.push({ id: 100, turno_id: turno.id, tipo_solicitud: 'nuevo_turno', estado: 'pendiente' });
      return turno.id;
    },
    snapshot() {
      return clone(state);
    },
  };
}

async function testPersistenceAndBooleans() {
  const { resolverRecordatorioHabilitado } = require('../src/domain/recordatorioTurno');
  assert.equal(resolverRecordatorioHabilitado(true, { defaultValue: false }), true);
  assert.equal(resolverRecordatorioHabilitado(false, { defaultValue: true }), false);
  assert.equal(resolverRecordatorioHabilitado(undefined, { defaultValue: true }), true);
  assert.equal(resolverRecordatorioHabilitado(undefined), undefined);
  assert.throws(() => resolverRecordatorioHabilitado('false'), /debe ser booleano/);

  const booleansUrl = pathToFileURL(path.resolve(__dirname, '../../frontend/src/js/utils/booleans.js')).href;
  const { checkboxToBoolean } = await import(booleansUrl);
  assert.equal(checkboxToBoolean({ checked: true }), true);
  assert.equal(checkboxToBoolean({ checked: false }), false);

  const mockPool = createTurnosPool();
  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: mockPool } };
  const turnosServicePath = require.resolve('../src/services/turnosService');
  delete require.cache[turnosServicePath];
  const turnosService = require(turnosServicePath);
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const base = {
    pacienteId: 10,
    prestacionId: 20,
    profesionalPerfilId: 30,
    fechaHoraInicio: future,
  };
  const withTrue = await turnosService.crearTurno({ ...base, recordatorioHabilitado: true });
  const withFalse = await turnosService.crearTurno({ ...base, recordatorioHabilitado: false });
  const compatible = await turnosService.crearTurno(base);
  assert.equal(withTrue.recordatorio_habilitado, true);
  assert.equal(withFalse.recordatorio_habilitado, false);
  assert.equal(compatible.recordatorio_habilitado, true);

  let edited = await turnosService.editarTurno(withTrue.id, {
    ...base,
    recordatorioHabilitado: false,
  });
  assert.equal(edited.recordatorio_habilitado, false);
  edited = await turnosService.editarTurno(withTrue.id, base);
  assert.equal(edited.recordatorio_habilitado, false, 'La edicion antigua debe conservar FALSE');

  const solicitudTurnoId = mockPool.seedSolicitud();
  const confirmed = await turnosService.confirmarSolicitudTurno(solicitudTurnoId, {
    profesionalPerfilId: 30,
    prestacionId: 20,
    fechaHoraInicio: future,
    duracionMinutos: 30,
    recordatorioHabilitado: false,
  });
  assert.equal(confirmed.estado, 'confirmado');
  assert.equal(confirmed.recordatorio_habilitado, false);
  const finalState = mockPool.snapshot();
  assert.equal(finalState.solicitudes.find((item) => item.turno_id === solicitudTurnoId).estado, 'resuelta');
}

async function testScheduler() {
  const appointments = [
    { id: 1, estado: 'programado', recordatorio_habilitado: true },
    { id: 2, estado: 'programado', recordatorio_habilitado: false },
  ];
  let sendAttempts = 0;
  const reminderPool = {
    async query(sql, params = []) {
      const text = compact(sql);
      if (text.includes('information_schema.columns')) return result([{ ok: true }]);
      if (text.startsWith('SELECT t.id FROM turnos')) {
        assert.match(text, /t\.recordatorio_habilitado = TRUE/);
        return result(appointments.filter((item) => item.recordatorio_habilitado).map(({ id }) => ({ id })));
      }
      if (text.includes('FROM turnos t') && text.includes('WHERE t.id = $1')) {
        const appointment = appointments.find((item) => item.id === Number(params[0]));
        return result(appointment ? [{
          ...appointment,
          paciente_id: 10,
          prestacion_id: 20,
          profesional_id: 30,
          fecha_hora_inicio: new Date(Date.now() + 60 * 60 * 1000),
          fecha_hora_fin: new Date(Date.now() + 2 * 60 * 60 * 1000),
          paciente_nombre: 'Paciente',
          paciente_apellido: 'Prueba',
          paciente_telefono: '3515555555',
        }] : []);
      }
      if (text.includes('FROM whatsapp_reminders') && text.includes('WHERE appointment_id = $1')) return result();
      throw new Error(`Consulta de reminder no contemplada: ${text}`);
    },
  };

  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: reminderPool } };
  const clientPath = require.resolve('../src/services/whatsappClient.service');
  require.cache[clientPath] = {
    id: clientPath,
    filename: clientPath,
    loaded: true,
    exports: {
      async sendWhatsAppMessage() {
        sendAttempts += 1;
        throw new Error('La prueba no permite WhatsApp real');
      },
      normalizePhoneDigits: (value) => String(value || '').replace(/\D/g, ''),
      normalizePhoneToChatId: (value) => value,
    },
  };
  const configPath = require.resolve('../src/services/configuracionService');
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: { renderizarMensajeAutomatico: async () => null },
  };
  const auditPath = require.resolve('../src/services/auditoriaService');
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: { registrarAuditoria: async () => null },
  };
  const reminderPath = require.resolve('../src/services/whatsappReminder.service');
  delete require.cache[reminderPath];
  const reminderService = require(reminderPath);

  const candidates = await reminderService.findUpcomingAppointmentsForReminders();
  assert.deepEqual(candidates, [{ id: 1 }]);
  const disabled = await reminderService.sendAppointmentReminder(2, { automatic: true });
  assert.equal(disabled.reason, 'AUTOMATIC_REMINDER_DISABLED');

  const previousEnabled = process.env.REMINDERS_ENABLED;
  process.env.REMINDERS_ENABLED = 'false';
  const globalOff = await reminderService.processAutomaticReminders();
  assert.equal(globalOff.enabled, false);

  process.env.REMINDERS_ENABLED = 'true';
  const templateOff = await reminderService.processAutomaticReminders();
  assert.equal(templateOff.processed, 1);
  assert.equal(templateOff.sent, 0);
  assert.equal(templateOff.failed, 0);
  assert.equal(templateOff.results[0].reason, 'MESSAGE_DISABLED');
  assert.equal(sendAttempts, 0);

  if (previousEnabled === undefined) delete process.env.REMINDERS_ENABLED;
  else process.env.REMINDERS_ENABLED = previousEnabled;
}

async function run() {
  await testPersistenceAndBooleans();
  await testScheduler();
  console.log('OK: recordatorio opcional por turno (10 escenarios, sin WhatsApp real)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
