const assert = require('node:assert/strict');
const { createGracefulShutdown } = require('../src/services/shutdownService');

async function run() {
  const calls = [];
  const server = {
    close(callback) {
      calls.push('stop-accepting');
      setTimeout(() => { calls.push('http-closed'); callback(); }, 5);
    },
    closeAllConnections() { calls.push('forced-close'); },
  };
  const shutdown = createGracefulShutdown({
    server,
    stopScheduler: async () => { calls.push('scheduler-stopped'); },
    stopWhatsApp: async () => { calls.push('whatsapp-stopped'); },
    closePool: async () => { calls.push('pool-closed'); },
    timeoutMs: 200,
    logger: { info() {} },
  });
  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.equal(first, second);
  await first;
  assert.deepEqual(calls, ['stop-accepting', 'scheduler-stopped', 'http-closed', 'whatsapp-stopped', 'pool-closed']);

  const timeoutCalls = [];
  const timeoutShutdown = createGracefulShutdown({
    server: { close() {}, closeAllConnections() { timeoutCalls.push('forced-close'); } },
    stopScheduler: async () => {}, stopWhatsApp: async () => {}, closePool: async () => {},
    timeoutMs: 10, logger: { info() {} },
  });
  await assert.rejects(() => timeoutShutdown(), (error) => error.code === 'SHUTDOWN_TIMEOUT');
  assert.deepEqual(timeoutCalls, ['forced-close']);
  console.log('OK cierre: orden, idempotencia y timeout');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
