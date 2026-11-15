const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sensitivePhone = '5491112345678';
const sensitiveBody = '<mensaje privado de paciente>';
const sensitiveQr = 'qr-secret-value';

const servicePath = require.resolve('../src/services/whatsappClient.service');
require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: {
    getStatus: () => ({
      ok: true,
      status: 'CONNECTED',
      initialized: true,
      ready: true,
      connectedNumber: sensitivePhone,
      pushname: sensitiveBody,
      qr: sensitiveQr,
      last_error: `fallo para ${sensitivePhone} token=${sensitiveQr}`,
      last_incoming_message: { event: 'message', type: 'chat', from_me: false, at: '2026-11-15T00:00:00.000Z' },
    }),
    initializeWhatsAppClient: async () => {},
    getLastQr: () => null,
    destroyWhatsAppClient: async () => {},
    logoutWhatsAppClient: async () => {},
    restartWhatsAppClient: async () => {},
    pollRecentMessagesOnce: async () => ({ chats: [] }),
    sendWhatsAppMessage: async () => {},
  },
};

const reminderPath = require.resolve('../src/services/whatsappReminder.service');
require.cache[reminderPath] = {
  id: reminderPath,
  filename: reminderPath,
  loaded: true,
  exports: { sendAppointmentReminder: async () => {}, processAutomaticReminders: async () => {} },
};

const controller = require('../src/controllers/whatsapp.controller');
let responseBody;
const response = {
  status(code) { assert.equal(code, 200); return this; },
  json(body) { responseBody = body; return body; },
};

(async () => {
  await controller.getWhatsAppStatus({}, response);
  const serialized = JSON.stringify(responseBody);
  assert.equal(serialized.includes(sensitivePhone), false);
  assert.equal(serialized.includes(sensitiveBody), false);
  assert.equal(serialized.includes(sensitiveQr), false);
  assert.deepEqual(responseBody.last_incoming_message, {
    event: 'message', type: 'chat', from_me: false, at: '2026-11-15T00:00:00.000Z',
  });

  const sources = [
    'whatsappAutogestion.service.js',
    'whatsappReminder.service.js',
    'whatsappPaciente.service.js',
  ].map((name) => fs.readFileSync(path.join(__dirname, '..', 'src', 'services', name), 'utf8')).join('\n');
  assert.equal(/metadata\s*:\s*\{[^}]*\b(body|response_text|phone)\s*:/s.test(sources), false);

  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'whatsapp.routes.js'), 'utf8');
  assert.match(routes, /NODE_ENV\s*===\s*['"]production['"]/);
  assert.match(routes, /status\(404\)/);
  console.log('OK WhatsApp: estado y auditorias nuevas sin contenido ni telefonos completos');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
