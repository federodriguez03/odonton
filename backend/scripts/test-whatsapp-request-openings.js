const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockPool() {
  let live = { turnos: [], solicitudes: [] };
  let failTurnUpdate = false;
  let nextSolicitudId = 1;
  let log = [];

  function compact(sql) {
    return String(sql).replace(/\s+/g, ' ').trim();
  }

  function result(rows = []) {
    return { rows, rowCount: rows.length };
  }

  async function poolQuery(sql) {
    const text = compact(sql);
    log.push(text);
    if (text.startsWith('INSERT INTO auditoria')) {
      return result([{ id: 1, created_at: new Date().toISOString() }]);
    }
    return result();
  }

  function createClient() {
    let transaction = null;

    return {
      async query(sql, params = []) {
        const text = compact(sql);
        log.push(text);

        if (text === 'BEGIN') {
          transaction = clone(live);
          return result();
        }
        if (text === 'COMMIT') {
          live = transaction;
          transaction = null;
          return result();
        }
        if (text === 'ROLLBACK') {
          transaction = null;
          return result();
        }
        if (!transaction) throw new Error('Consulta sin transaccion');

        if (text === 'SELECT id, estado FROM turnos WHERE id = $1 FOR UPDATE') {
          const turno = transaction.turnos.find((item) => Number(item.id) === Number(params[0]));
          return result(turno ? [clone(turno)] : []);
        }

        if (text.startsWith('SELECT * FROM turno_solicitudes')) {
          const [turnoId, tipoSolicitud] = params;
          const solicitudes = transaction.solicitudes
            .filter((item) => (
              Number(item.turno_id) === Number(turnoId)
              && item.tipo_solicitud === tipoSolicitud
              && item.estado === 'pendiente'
            ))
            .sort((a, b) => Number(b.id) - Number(a.id));
          return result(solicitudes.length ? [clone(solicitudes[0])] : []);
        }

        if (text.startsWith('INSERT INTO turno_solicitudes')) {
          const solicitud = {
            id: nextSolicitudId,
            tipo_solicitud: params[0],
            estado: 'pendiente',
            paciente_id: params[1],
            nombre_apellido: params[2],
            dni: params[3],
            telefono: params[4],
            motivo: params[5],
            preferencia_horaria: params[6],
            turno_id: params[7],
            observaciones: params[8],
          };
          nextSolicitudId += 1;
          transaction.solicitudes.push(solicitud);
          return result([clone(solicitud)]);
        }

        if (text.startsWith('UPDATE turnos')) {
          if (failTurnUpdate) throw new Error('Fallo simulado al cambiar estado del turno');
          const [turnoId, estadoDestino, estadoOrigen] = params;
          const turno = transaction.turnos.find((item) => Number(item.id) === Number(turnoId));
          if (!turno || turno.estado !== estadoOrigen) return result();
          turno.estado = estadoDestino;
          return result([{ id: turno.id, estado: turno.estado }]);
        }

        throw new Error(`Consulta no contemplada: ${text}`);
      },
      release() {
        log.push('RELEASE');
      },
    };
  }

  return {
    query: poolQuery,
    async connect() {
      return createClient();
    },
    reset({ estadoTurno = 'confirmado', solicitudes = [], failOnTurnUpdate = false } = {}) {
      live = {
        turnos: [{ id: 10, estado: estadoTurno }],
        solicitudes: clone(solicitudes),
      };
      failTurnUpdate = failOnTurnUpdate;
      nextSolicitudId = solicitudes.length + 1;
      log = [];
    },
    snapshot() {
      return clone(live);
    },
    log() {
      return [...log];
    },
  };
}

const mockPool = createMockPool();
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { pool: mockPool },
};

const { abrirSolicitudCambioTurno } = require('../src/services/turnoSolicitudesService');

function payload(tipoSolicitud) {
  return {
    tipoSolicitud,
    pacienteId: 500,
    nombreApellido: 'Paciente de prueba',
    dni: 'dni-de-prueba',
    telefono: 'telefono-de-prueba',
    turnoId: 10,
    observaciones: 'Solicitud controlada sin WhatsApp real',
    auditoria: { source: 'test' },
  };
}

async function run() {
  mockPool.reset({ estadoTurno: 'confirmado' });
  let apertura = await abrirSolicitudCambioTurno(payload('cancelacion'));
  let state = mockPool.snapshot();
  assert.equal(apertura.creada, true);
  assert.equal(state.turnos[0].estado, 'cancelacion_solicitada');
  assert.equal(state.solicitudes.length, 1);
  assert.equal(state.solicitudes[0].tipo_solicitud, 'cancelacion');
  assert.equal(state.solicitudes[0].estado, 'pendiente');
  assert.equal(
    mockPool.log().includes('SELECT id, estado FROM turnos WHERE id = $1 FOR UPDATE'),
    true,
  );

  mockPool.reset({ estadoTurno: 'reprogramado' });
  apertura = await abrirSolicitudCambioTurno(payload('reprogramacion'));
  state = mockPool.snapshot();
  assert.equal(apertura.creada, true);
  assert.equal(state.turnos[0].estado, 'reprogramacion_solicitada');
  assert.equal(state.solicitudes[0].tipo_solicitud, 'reprogramacion');

  mockPool.reset({ estadoTurno: 'programado' });
  const primera = await abrirSolicitudCambioTurno(payload('cancelacion'));
  const segunda = await abrirSolicitudCambioTurno(payload('cancelacion'));
  state = mockPool.snapshot();
  assert.equal(primera.creada, true);
  assert.equal(segunda.creada, false);
  assert.equal(segunda.solicitud.id, primera.solicitud.id);
  assert.equal(state.solicitudes.length, 1, 'No debe duplicar solicitudes pendientes');
  assert.equal(state.turnos[0].estado, 'cancelacion_solicitada');

  mockPool.reset({ estadoTurno: 'confirmado', failOnTurnUpdate: true });
  await assert.rejects(
    () => abrirSolicitudCambioTurno(payload('reprogramacion')),
    /Fallo simulado al cambiar estado del turno/,
  );
  state = mockPool.snapshot();
  assert.equal(state.turnos[0].estado, 'confirmado');
  assert.equal(state.solicitudes.length, 0);
  assert.equal(mockPool.log().includes('ROLLBACK'), true);
  assert.equal(mockPool.log().includes('COMMIT'), false);

  const autogestionSource = fs.readFileSync(
    path.join(__dirname, '../src/services/whatsappAutogestion.service.js'),
    'utf8',
  );
  const reminderSource = fs.readFileSync(
    path.join(__dirname, '../src/services/whatsappReminder.service.js'),
    'utf8',
  );
  assert.equal((autogestionSource.match(/abrirSolicitudCambioTurno\(/g) || []).length, 4);
  assert.equal((reminderSource.match(/abrirSolicitudCambioTurno\(/g) || []).length, 1);
  assert.equal(autogestionSource.includes('crearSolicitudPendienteSiNoExiste'), false);
  assert.equal(reminderSource.includes('crearSolicitudPendienteSiNoExiste'), false);

  console.log('OK: aperturas atomicas WhatsApp (cancelacion, reprogramacion, rollback y duplicados)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
