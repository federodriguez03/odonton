const assert = require('node:assert/strict');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createMockPool() {
  let live = { turnos: [], solicitudes: [] };
  let transaction = null;
  let failRequestClose = false;
  let log = [];

  function compact(sql) {
    return String(sql).replace(/\s+/g, ' ').trim();
  }

  function result(rows = []) {
    return { rows, rowCount: rows.length };
  }

  function findTurno(store, id) {
    return store.turnos.find((turno) => Number(turno.id) === Number(id));
  }

  async function queryPool(sql, params = []) {
    const text = compact(sql);
    log.push({ scope: 'pool', text, params });

    if (text === 'SELECT * FROM turnos WHERE id = $1') {
      const turno = findTurno(live, params[0]);
      return result(turno ? [clone(turno)] : []);
    }
    if (text.includes('SELECT id, duracion_minutos FROM prestaciones WHERE id = $1')) {
      return result([{ id: Number(params[0]), duracion_minutos: 30 }]);
    }
    if (text.includes('SELECT id FROM usuarios WHERE id = $1')) {
      return result([{ id: Number(params[0]) }]);
    }
    if (text.includes('SELECT p.id FROM profesionales p')) return result([{ id: Number(params[0]) }]);
    if (text.includes('FROM profesionales_horarios_atencion')) {
      return result([{
        dia_semana: 1,
        activo: true,
        hora_desde: '00:00',
        hora_hasta: '23:59',
      }]);
    }
    if (text.startsWith('SELECT EXISTS (')) return result([{ existe: false }]);
    if (text.includes('FROM usuarios') && text.includes('LIMIT 1')) return result([{ id: 20 }]);
    if (text.startsWith('INSERT INTO auditoria')) return result([{ id: 1, created_at: new Date().toISOString() }]);

    return result();
  }

  async function queryClient(sql, params = []) {
    const text = compact(sql);
    log.push({ scope: 'client', text, params });

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
    if (!transaction) throw new Error('Consulta transaccional sin BEGIN');

    if (text.includes('FROM turnos WHERE id = $1 FOR UPDATE')) {
      const turno = findTurno(transaction, params[0]);
      if (!turno) return result();
      if (text.startsWith('SELECT id, estado')) {
        return result([{ id: turno.id, estado: turno.estado }]);
      }
      return result([clone(turno)]);
    }

    if (text.startsWith('UPDATE turno_solicitudes')) {
      if (failRequestClose) throw new Error('Fallo simulado al cerrar solicitud');

      const [turnoId, estadoFinal, tipos = null] = params;
      const rows = [];
      for (const solicitud of transaction.solicitudes) {
        const coincideTipo = !tipos || tipos.includes(solicitud.tipo_solicitud);
        if (
          Number(solicitud.turno_id) === Number(turnoId)
          && solicitud.estado === 'pendiente'
          && coincideTipo
        ) {
          solicitud.estado = estadoFinal;
          rows.push(clone(solicitud));
        }
      }
      return result(rows);
    }

    if (text.startsWith('UPDATE turnos') && text.includes("SET estado = 'realizado'")) {
      const max = Number(params[0]);
      const candidates = transaction.turnos
        .filter((turno) => (
          ['programado', 'confirmado', 'reprogramado'].includes(turno.estado)
          && new Date(turno.fecha_hora_fin) <= new Date()
        ))
        .sort((a, b) => new Date(a.fecha_hora_fin) - new Date(b.fecha_hora_fin))
        .slice(0, max);

      for (const turno of candidates) turno.estado = 'realizado';
      return result(candidates.map((turno) => ({ id: turno.id })));
    }

    if (text.startsWith('UPDATE turnos') && text.includes("estado = 'cancelado'")) {
      const turno = findTurno(transaction, params[0]);
      if (!turno) return result();
      turno.estado = 'cancelado';
      turno.fecha_cancelacion = new Date().toISOString();
      return result([clone(turno)]);
    }

    if (text.startsWith('UPDATE turnos') && text.includes("estado = 'confirmado'")) {
      const turno = findTurno(transaction, params[0]);
      if (!turno || turno.estado !== 'solicitado') return result();
      turno.profesional_perfil_id = params[1];
      turno.prestacion_id = params[2];
      turno.fecha_hora_inicio = params[3];
      turno.fecha_hora_fin = params[4];
      turno.estado = 'confirmado';
      return result([clone(turno)]);
    }

    if (text.startsWith('UPDATE turnos') && text.includes('SET estado = $3')) {
      const turno = findTurno(transaction, params[0]);
      if (!turno || turno.estado !== params[3]) return result();
      turno.estado = params[2];
      return result([clone(turno)]);
    }

    throw new Error(`Consulta no contemplada por la prueba: ${text}`);
  }

  const client = {
    query: queryClient,
    release() {
      log.push({ scope: 'client', text: 'RELEASE', params: [] });
    },
  };

  return {
    query: queryPool,
    async connect() {
      return client;
    },
    reset({ turnos, solicitudes, failOnRequestClose = false }) {
      live = clone({ turnos, solicitudes });
      transaction = null;
      failRequestClose = failOnRequestClose;
      log = [];
    },
    snapshot() {
      return clone(live);
    },
    transactionLog() {
      return log.filter((entry) => entry.scope === 'client').map((entry) => entry.text);
    },
  };
}

const mockPool = createMockPool();
const dbModulePath = require.resolve('../src/config/db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { pool: mockPool },
};

const turnosService = require('../src/services/turnosService');
const { marcarTurnosVencidosComoRealizados } = require('../src/services/turnoLifecycle.service');

function turno(id, estado, extra = {}) {
  return {
    id,
    estado,
    paciente_id: 9000 + id,
    prestacion_id: 10,
    profesional_id: 20,
    profesional_perfil_id: 20,
    fecha_hora_inicio: null,
    fecha_hora_fin: null,
    ...extra,
  };
}

function solicitud(id, turnoId, tipoSolicitud) {
  return {
    id,
    turno_id: turnoId,
    tipo_solicitud: tipoSolicitud,
    estado: 'pendiente',
  };
}

async function confirmarCaso(tipoSolicitud) {
  mockPool.reset({
    turnos: [turno(1, 'solicitado')],
    solicitudes: [solicitud(1, 1, tipoSolicitud)],
  });

  await turnosService.confirmarSolicitudTurno(1, {
    profesionalId: 20,
    prestacionId: 10,
    fechaHoraInicio: new Date('2099-08-17T10:00:00-03:00'),
    duracionMinutos: 30,
    acceso: { alcance: 'general', usuario_id: 2 },
  });

  const state = mockPool.snapshot();
  assert.equal(state.turnos[0].estado, 'confirmado');
  assert.equal(state.solicitudes[0].estado, 'resuelta');
}

async function cancelarCaso(tipoSolicitud, estadoTurno) {
  mockPool.reset({
    turnos: [turno(1, estadoTurno)],
    solicitudes: [solicitud(1, 1, tipoSolicitud)],
  });

  await turnosService.cancelarTurno(1, { acceso: { alcance: 'general', usuario_id: 2 } });

  const state = mockPool.snapshot();
  assert.equal(state.turnos[0].estado, 'cancelado');
  assert.equal(state.solicitudes[0].estado, 'resuelta');
}

async function rechazarCaso(tipoSolicitud, estadoInicial, estadoEsperado) {
  mockPool.reset({
    turnos: [turno(1, estadoInicial)],
    solicitudes: [solicitud(1, 1, tipoSolicitud)],
  });

  await turnosService.rechazarSolicitudTurno(1, { observaciones: 'Prueba controlada', acceso: { alcance: 'general', usuario_id: 2 } });

  const state = mockPool.snapshot();
  assert.equal(state.turnos[0].estado, estadoEsperado);
  assert.equal(state.solicitudes[0].estado, 'rechazada');
}

async function run() {
  await confirmarCaso('nuevo_turno');
  await confirmarCaso('primera_consulta');
  await cancelarCaso('cancelacion', 'cancelacion_solicitada');
  await cancelarCaso('reprogramacion', 'reprogramacion_solicitada');
  await rechazarCaso('nuevo_turno', 'solicitado', 'rechazado');
  await rechazarCaso('cancelacion', 'cancelacion_solicitada', 'programado');

  mockPool.reset({
    turnos: [turno(1, 'confirmado', {
      fecha_hora_inicio: '2020-01-01T09:00:00.000Z',
      fecha_hora_fin: '2020-01-01T09:30:00.000Z',
    })],
    solicitudes: [solicitud(1, 1, 'nuevo_turno')],
  });
  const lifecycle = await marcarTurnosVencidosComoRealizados();
  let state = mockPool.snapshot();
  assert.equal(lifecycle.processed, 1);
  assert.equal(state.turnos[0].estado, 'realizado');
  assert.equal(state.solicitudes[0].estado, 'resuelta');

  mockPool.reset({
    turnos: [turno(1, 'cancelacion_solicitada')],
    solicitudes: [solicitud(1, 1, 'cancelacion')],
    failOnRequestClose: true,
  });
  await assert.rejects(
    () => turnosService.cancelarTurno(1, { acceso: { alcance: 'general', usuario_id: 2 } }),
    /Fallo simulado al cerrar solicitud/,
  );
  state = mockPool.snapshot();
  assert.equal(state.turnos[0].estado, 'cancelacion_solicitada');
  assert.equal(state.solicitudes[0].estado, 'pendiente');
  assert.equal(mockPool.transactionLog().includes('COMMIT'), false);
  assert.equal(mockPool.transactionLog().includes('ROLLBACK'), true);

  console.log('OK: ciclo transaccional de turno_solicitudes (8 escenarios, rollback incluido)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
