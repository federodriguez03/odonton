const assert = require('node:assert/strict');

process.env.WHATSAPP_RECOVER_MISSED_TURNOS = 'true';
process.env.WHATSAPP_RECOVERY_MAX_AGE_MINUTES = '120';
process.env.WHATSAPP_DIAGNOSTIC_MODE = 'false';
process.env.ODONTON_DEMO_MODE = 'false';
process.env.EXTERNAL_SENDS_ENABLED = 'true';
process.env.WHATSAPP_SAFE_MODE = 'false';

const handledIds = new Set();
const processed = [];

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    pool: {
      query: async (_query, values) => ({ rowCount: handledIds.has(values?.[0]) ? 1 : 0, rows: [] }),
    },
  },
};

const autogestionPath = require.resolve('../src/services/whatsappAutogestion.service');
require.cache[autogestionPath] = {
  id: autogestionPath,
  filename: autogestionPath,
  loaded: true,
  exports: {
    hasActiveAutogestionSession: async () => false,
    shouldStartAutogestion: async (text) => String(text).trim().toLowerCase() === 'turno',
    processAutogestionMessage: async (_chatId, _text, options) => {
      handledIds.add(options.messageId);
      processed.push(options.messageId);
      return { handled: true };
    },
  },
};

const reminderPath = require.resolve('../src/services/whatsappReminder.service');
require.cache[reminderPath] = {
  id: reminderPath,
  filename: reminderPath,
  loaded: true,
  exports: {
    hasPendingReminderForPhone: async () => false,
    processPatientReply: async () => ({ codigo: 'NO_PENDING_REMINDER' }),
  },
};

const now = Math.floor(Date.now() / 1000);
const message = (id, body, timestamp, extra = {}) => ({
  id: { _serialized: id },
  from: `549110000000${id.slice(-1)}@c.us`,
  to: '5491199999999@c.us',
  fromMe: false,
  type: 'chat',
  body,
  timestamp,
  ...extra,
});
const chat = (id, messages) => ({
  id: { _serialized: id },
  isGroup: false,
  timestamp: now,
  fetchMessages: async () => messages,
});

const fakeClient = {
  getChats: async () => [
    chat('5491100000001@c.us', [message('m-1', 'turno', now - 60), message('m-2', 'Quiero un turno', now - 10)]),
    chat('5491100000002@c.us', [message('m-3', 'turno', now - 30, { fromMe: true })]),
    chat('5491100000003@c.us', [message('m-4', 'turno', now - 3 * 60 * 60)]),
  ],
};

(async () => {
  const service = require('../src/services/whatsappClient.service');
  assert.equal(service.isExactTurnKeyword(' TURNO '), true);
  assert.equal(service.isExactTurnKeyword('quiero un turno'), false);

  const first = await service.recoverMissedTurnRequestsOnce(fakeClient);
  assert.equal(first.candidates, 1);
  assert.equal(first.recovered, 1);
  assert.deepEqual(processed, ['m-1']);

  const second = await service.recoverMissedTurnRequestsOnce(fakeClient);
  assert.equal(second.candidates, 1);
  assert.equal(second.recovered, 0);
  assert.equal(second.duplicates, 1);
  assert.deepEqual(processed, ['m-1']);

  console.log('OK: recuperación acotada de mensajes exactos "turno" sin duplicados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
