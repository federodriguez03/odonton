const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sentMessages = [];
const auditEntries = [];

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

function createMockPool() {
  let session = null;
  let nextId = 1;

  return {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();

      if (text.startsWith('CREATE TABLE') || text.startsWith('CREATE INDEX')) return result();

      if (text.includes('expires_at <= NOW()')) return result();

      if (text.startsWith('SELECT * FROM whatsapp_conversations')) {
        return result(session?.status === 'active' ? [{ ...session }] : []);
      }

      if (text.startsWith('UPDATE whatsapp_conversations SET status = $2') && text.includes('WHERE phone = $1')) {
        if (session?.status === params[2]) session.status = params[1];
        return result();
      }

      if (text.startsWith('INSERT INTO whatsapp_conversations')) {
        session = {
          id: nextId,
          phone: params[0],
          status: 'active',
          step: params[1],
          data: JSON.parse(params[2]),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        };
        nextId += 1;
        return result([{ ...session }]);
      }

      if (text.startsWith('UPDATE whatsapp_conversations SET step = COALESCE')) {
        if (!session || Number(session.id) !== Number(params[0])) return result();
        session = {
          ...session,
          step: params[1] || session.step,
          paciente_id: params[2] || session.paciente_id,
          prestacion_id: params[3] || session.prestacion_id,
          profesional_id: params[4] || session.profesional_id,
          turno_id: params[5] || session.turno_id,
          data: JSON.parse(params[6]),
        };
        return result([{ ...session }]);
      }

      if (text.startsWith('UPDATE whatsapp_conversations SET status = $2') && text.includes('WHERE id = $1')) {
        if (session && Number(session.id) === Number(params[0])) session.status = params[1];
        return result();
      }

      throw new Error(`Consulta no contemplada por el mock: ${text}`);
    },
    reset() {
      session = null;
      sentMessages.length = 0;
      auditEntries.length = 0;
    },
    seedSession(step = 'esperando_opcion_menu', data = {}) {
      session = {
        id: nextId,
        phone: '5490000000000',
        status: 'active',
        step,
        data: { ...data },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
      nextId += 1;
      return { ...session };
    },
    snapshot() {
      return session ? JSON.parse(JSON.stringify(session)) : null;
    },
  };
}

function mockModule(relativePath, exports) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

const mockPool = createMockPool();

mockModule('../src/config/db', { pool: mockPool });
mockModule('../src/services/whatsappClient.service', {
  sendWhatsAppMessage: async (phone, message) => {
    sentMessages.push({ phone, message });
    return { id: { _serialized: 'mock-outgoing-id' } };
  },
  normalizePhoneDigits: (phone) => String(phone || '').replace(/\D/g, ''),
  normalizePhoneForStorage: (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits || null;
  },
  getStatus: () => ({ ready: false }),
  getLastQr: () => null,
  initializeWhatsAppClient: async () => null,
  destroyWhatsAppClient: async () => null,
  logoutWhatsAppClient: async () => null,
  restartWhatsAppClient: async () => null,
  pollRecentMessagesOnce: async () => ({ chats: [], processing_enabled: false }),
});
mockModule('../src/services/turnosService', {
  consultarDisponibilidad: async () => [],
  crearTurno: async () => null,
  crearSolicitudTurno: async () => null,
  reprogramarTurno: async () => null,
  obtenerTurnoDetalle: async () => null,
});
mockModule('../src/services/auditoriaService', {
  registrarAuditoria: async (entry) => {
    auditEntries.push(JSON.parse(JSON.stringify(entry)));
    return { id: auditEntries.length };
  },
});
mockModule('../src/services/configuracionService', {
  AUTOGESTION_KEYWORDS_DEFAULT: 'turno,cita',
  obtenerConfiguracion: async () => ({
    consultorio: { autogestion_keywords: 'cita' },
  }),
});
mockModule('../src/services/whatsappPaciente.service', {
  completarTelefonoPacienteSiVacio: async () => null,
  createPacienteMinimo: async () => null,
});
mockModule('../src/domain/turnoActivityRules', {
  TURN_STATES_WHATSAPP_CANCELABLE: [],
  TURN_STATES_WHATSAPP_REPROGRAMMABLE: [],
  determinarTipoPaciente: () => null,
});
mockModule('../src/services/turnoSolicitudesService', {
  crearSolicitudTurnoPendiente: async () => null,
  abrirSolicitudCambioTurno: async () => null,
  pacienteTieneTurnoOSolicitudActiva: async () => false,
  buildObservacionSolicitud: () => '',
});

const {
  processAutogestionMessage,
  shouldStartAutogestion,
} = require('../src/services/whatsappAutogestion.service');

function liveContext(overrides = {}) {
  return {
    allowSessionStart: true,
    sourceEvent: 'message',
    messageId: 'technical-message-id',
    messageTimestamp: 1787324852,
    fromMe: false,
    ...overrides,
  };
}

async function testExplicitCommands() {
  assert.equal(await shouldStartAutogestion('turno'), true);
  assert.equal(await shouldStartAutogestion('  TURNO  '), true);
  assert.equal(await shouldStartAutogestion('Sí, tengo un turno hoy disponible'), false);
  assert.equal(await shouldStartAutogestion('Me cambiaron el turno'), false);
  assert.equal(await shouldStartAutogestion('Tu turno es mañana'), false);
  assert.equal(await shouldStartAutogestion('Después veo lo del turno'), false);

  mockPool.reset();
  const opened = await processAutogestionMessage('5490000000000@c.us', 'turno', liveContext());
  assert.equal(opened.started, true);
  assert.equal(mockPool.snapshot().step, 'esperando_opcion_menu');
  assert.equal(sentMessages.length, 1);
  assert.equal(auditEntries[0].metadata.sourceEvent, 'message');
  assert.equal(auditEntries[0].metadata.messageId, 'technical-message-id');
  assert.equal(auditEntries[0].metadata.messageTimestamp, 1787324852);
  assert.equal(auditEntries[0].metadata.trigger, 'exact_keyword');
  assert.equal(Object.hasOwn(auditEntries[0].metadata, 'body'), false);
}

async function testBlockedSources() {
  for (const phrase of ['Sí, tengo un turno hoy disponible', 'Me cambiaron el turno']) {
    mockPool.reset();
    const resultValue = await processAutogestionMessage('5490000000000@c.us', phrase, liveContext());
    assert.equal(resultValue.handled, false);
    assert.equal(mockPool.snapshot(), null);
    assert.equal(sentMessages.length, 0);
  }

  mockPool.reset();
  let resultValue = await processAutogestionMessage('5490000000000@c.us', 'turno', liveContext({
    sourceEvent: 'manual_poll',
  }));
  assert.equal(resultValue.codigo, 'SESSION_START_NOT_ALLOWED');
  assert.equal(mockPool.snapshot(), null);
  assert.equal(sentMessages.length, 0);

  mockPool.reset();
  resultValue = await processAutogestionMessage('5490000000000@c.us', 'turno', liveContext({
    fromMe: true,
  }));
  assert.equal(resultValue.codigo, 'SESSION_START_NOT_ALLOWED');
  assert.equal(mockPool.snapshot(), null);
  assert.equal(sentMessages.length, 0);

  mockPool.reset();
  resultValue = await processAutogestionMessage('5490000000000@c.us', 'turno');
  assert.equal(resultValue.codigo, 'SESSION_START_NOT_ALLOWED');
  assert.equal(mockPool.snapshot(), null);
  assert.equal(sentMessages.length, 0);
}

async function testExistingSessionAndCancel() {
  mockPool.reset();
  mockPool.seedSession('esperando_opcion_menu');
  const continued = await processAutogestionMessage('5490000000000@c.us', '1');
  assert.equal(continued.handled, true);
  assert.equal(mockPool.snapshot().step, 'esperando_dni');
  assert.equal(sentMessages.length, 1);

  mockPool.reset();
  mockPool.seedSession('esperando_dni', { tipo_solicitud: 'nuevo_turno' });
  const cancelled = await processAutogestionMessage('5490000000000@c.us', '0');
  assert.equal(cancelled.cancelled, true);
  assert.equal(mockPool.snapshot().status, 'cancelled');
  assert.equal(sentMessages.length, 1);
}

async function testDirectMenuCommands() {
  for (const command of ['1', '2', '3']) {
    mockPool.reset();
    const opened = await processAutogestionMessage(`549000000000${command}@c.us`, command, liveContext({
      messageId: `direct-${command}`,
    }));
    assert.equal(opened.started, true);
    assert.equal(mockPool.snapshot().step, 'esperando_dni');
    assert.equal(auditEntries[0].metadata.trigger, 'direct_command');
    assert.equal(auditEntries[0].metadata.command, command);
    assert.equal(auditEntries[0].metadata.sourceEvent, 'message');
  }
}

async function testSimulationIsTransportFree() {
  mockModule('../src/services/whatsappReminder.service', {
    sendAppointmentReminder: async () => null,
    processAutomaticReminders: async () => null,
    processPatientReply: async () => {
      throw new Error('simulate-reply no debe llamar processPatientReply');
    },
  });

  const { simulateReply } = require('../src/controllers/whatsapp.controller');
  let statusCode = null;
  let responseBody = null;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return body;
    },
  };

  mockPool.reset();
  await simulateReply({ body: { phone: 'telefono-mock', body: 'turno' } }, response);
  assert.equal(statusCode, 200);
  assert.equal(responseBody.resultado.codigo, 'SIMULATION_ONLY_NO_REAL_TRANSPORT');
  assert.equal(mockPool.snapshot(), null);
  assert.equal(sentMessages.length, 0);
}

function testStaticClientGuards() {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/services/whatsappClient.service.js'),
    'utf8',
  );
  const pollStart = source.indexOf('async function pollRecentMessagesOnce');
  const pollEnd = source.indexOf('function stopMessagePolling', pollStart);
  const pollSource = source.slice(pollStart, pollEnd);
  const readyStart = source.indexOf("client.on('ready'");
  const readyEnd = source.indexOf("client.on('auth_failure'", readyStart);
  const readySource = source.slice(readyStart, readyEnd);

  assert.equal(pollSource.includes('handleIncomingMessage('), false);
  assert.equal(readySource.includes('startMessagePolling('), false);
  assert.equal(source.includes('if (message?.fromMe === true) return;'), true);
  assert.equal(source.includes("if (sourceEvent !== 'message') return;"), true);
}

async function run() {
  await testExplicitCommands();
  await testBlockedSources();
  await testExistingSessionAndCancel();
  await testDirectMenuCommands();
  await testSimulationIsTransportFree();
  testStaticClientGuards();
  console.log('OK: hotfix de inicio de sesión WhatsApp validado sin transporte ni PostgreSQL reales');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
