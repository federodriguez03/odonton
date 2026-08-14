const assert = require('node:assert/strict');

const trace = [];
let templateEnabled = true;
let whatsappReady = true;
let sendShouldFail = false;
let sendCalls = 0;

const whatsappClientPath = require.resolve('../src/services/whatsappClient.service');
require.cache[whatsappClientPath] = {
  id: whatsappClientPath,
  filename: whatsappClientPath,
  loaded: true,
  exports: {
    getStatus() {
      return { ready: whatsappReady };
    },
    async sendWhatsAppMessage() {
      sendCalls += 1;
      trace.push('whatsapp_attempt');
      if (sendShouldFail) throw new Error('Fallo simulado de WhatsApp');
      return { id: 'mock-message-id' };
    },
  },
};

const configuracionServicePath = require.resolve('../src/services/configuracionService');
require.cache[configuracionServicePath] = {
  id: configuracionServicePath,
  filename: configuracionServicePath,
  loaded: true,
  exports: {
    async renderizarMensajeAutomatico(tipo, payload) {
      assert.equal(tipo, 'rechazo_solicitud_turno');
      assert.ok(payload?.turno);
      return templateEnabled ? 'Solicitud rechazada de prueba' : null;
    },
  },
};

const whatsappServicePath = require.resolve('../src/services/whatsappService');
delete require.cache[whatsappServicePath];
const whatsappService = require('../src/services/whatsappService');

const turnoDetalle = {
  id: 101,
  estado: 'rechazado',
  paciente: {
    id: 501,
    nombre: 'Paciente',
    apellido: 'De prueba',
    telefono: 'telefono-de-prueba',
  },
  prestacion: { id: null, nombre: null },
  profesional: { id: null, nombre: null },
};

async function probarServicio() {
  templateEnabled = true;
  whatsappReady = true;
  sendShouldFail = false;
  sendCalls = 0;
  let result = await whatsappService.notificarRechazoSolicitudTurnoPorWhatsapp({
    telefono: turnoDetalle.paciente.telefono,
    turno: turnoDetalle,
  });
  assert.deepEqual(result, { intentado: true, enviado: true, advertencia: null });
  assert.equal(sendCalls, 1);

  templateEnabled = false;
  result = await whatsappService.notificarRechazoSolicitudTurnoPorWhatsapp({
    telefono: turnoDetalle.paciente.telefono,
    turno: turnoDetalle,
  });
  assert.deepEqual(result, { intentado: false, enviado: false, advertencia: null });
  assert.equal(sendCalls, 1, 'Una plantilla inactiva no debe intentar el envio');

  templateEnabled = true;
  result = await whatsappService.notificarRechazoSolicitudTurnoPorWhatsapp({
    telefono: '',
    turno: turnoDetalle,
  });
  assert.equal(result.intentado, false);
  assert.equal(result.enviado, false);
  assert.match(result.advertencia, /registrado/i);

  whatsappReady = false;
  result = await whatsappService.notificarRechazoSolicitudTurnoPorWhatsapp({
    telefono: turnoDetalle.paciente.telefono,
    turno: turnoDetalle,
  });
  assert.equal(result.intentado, true);
  assert.equal(result.enviado, false);
  assert.match(result.advertencia, /no est.+ listo/i);

  whatsappReady = true;
  sendShouldFail = true;
  result = await whatsappService.notificarRechazoSolicitudTurnoPorWhatsapp({
    telefono: turnoDetalle.paciente.telefono,
    turno: turnoDetalle,
  });
  assert.equal(result.intentado, true);
  assert.equal(result.enviado, false);
  assert.match(result.advertencia, /no se pudo enviar/i);
}

async function probarControllerDespuesDePersistir() {
  const persisted = {
    turno: 'solicitado',
    solicitud: 'pendiente',
  };

  const turnosServicePath = require.resolve('../src/services/turnosService');
  require.cache[turnosServicePath] = {
    id: turnosServicePath,
    filename: turnosServicePath,
    loaded: true,
    exports: {
      async rechazarSolicitudTurno() {
        persisted.turno = 'rechazado';
        persisted.solicitud = 'rechazada';
        trace.push('persistencia_commit');
        return { id: turnoDetalle.id, estado: persisted.turno };
      },
      async obtenerTurnoDetalle() {
        assert.equal(persisted.turno, 'rechazado');
        assert.equal(persisted.solicitud, 'rechazada');
        trace.push('detalle_post_commit');
        return turnoDetalle;
      },
    },
  };

  const recordatoriosServicePath = require.resolve('../src/services/recordatoriosService');
  require.cache[recordatoriosServicePath] = {
    id: recordatoriosServicePath,
    filename: recordatoriosServicePath,
    loaded: true,
    exports: {
      procesarRecordatoriosAutomaticos: async () => ({}),
      enviarRecordatorioManualTurno: async () => ({}),
    },
  };

  const solicitudesServicePath = require.resolve('../src/services/turnoSolicitudesService');
  require.cache[solicitudesServicePath] = {
    id: solicitudesServicePath,
    filename: solicitudesServicePath,
    loaded: true,
    exports: { listarSolicitudesTurno: async () => [] },
  };

  const controllerPath = require.resolve('../src/controllers/turnosController');
  delete require.cache[controllerPath];
  const controller = require('../src/controllers/turnosController');

  templateEnabled = true;
  whatsappReady = true;
  sendShouldFail = true;
  trace.length = 0;

  const req = {
    params: { id: String(turnoDetalle.id) },
    body: { observaciones: 'Prueba controlada' },
  };
  const res = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return payload;
    },
  };

  await controller.rechazarSolicitudTurno(req, res);

  assert.equal(trace.indexOf('persistencia_commit') < trace.indexOf('whatsapp_attempt'), true);
  assert.equal(persisted.turno, 'rechazado');
  assert.equal(persisted.solicitud, 'rechazada');
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.notificacion.enviado, false);
  assert.match(res.payload.notificacion.advertencia, /no se pudo enviar/i);
  assert.equal(Array.isArray(res.payload.advertencias), true);
}

async function run() {
  await probarServicio();
  await probarControllerDespuesDePersistir();
  console.log('OK: notificacion de rechazo posterior a persistencia (6 escenarios)');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
