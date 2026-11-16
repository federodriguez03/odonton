const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const instances = [];

class FakeClient extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.loggedOut = false;
    this.info = null;
    instances.push(this);
  }

  async initialize() {}
  async destroy() { this.destroyed = true; }
  async logout() { this.loggedOut = true; }
}

class FakeLocalAuth {
  constructor(options) { this.options = options; }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 2500) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timeout esperando condicion de prueba');
    await wait(10);
  }
}

async function run() {
  const temporaryAuthPath = await fs.mkdtemp(path.join(os.tmpdir(), 'odonton-whatsapp-connection-'));
  process.env.WHATSAPP_AUTH_DATA_PATH = temporaryAuthPath;
  process.env.WHATSAPP_SESSION_NAME = 'lifecycle-test';
  process.env.WHATSAPP_INIT_TIMEOUT_MS = '1000';
  process.env.WHATSAPP_RECONNECT_MAX_ATTEMPTS = '1';
  process.env.WHATSAPP_DIAGNOSTIC_MODE = 'true';
  process.env.EXTERNAL_SENDS_ENABLED = 'false';

  const whatsappModule = require.resolve('whatsapp-web.js');
  require.cache[whatsappModule] = {
    id: whatsappModule,
    filename: whatsappModule,
    loaded: true,
    exports: { Client: FakeClient, LocalAuth: FakeLocalAuth },
  };

  const service = require('../src/services/whatsappClient.service');
  try {
    // Un lock vivo de otro proceso impide crear un cliente para la misma sesion.
    const lockPath = path.join(temporaryAuthPath, '.lifecycle-test.owner.lock');
    await fs.writeFile(lockPath, JSON.stringify({ pid: process.pid, hostname: os.hostname(), token: 'other-process' }));
    await service.initializeWhatsAppClient();
    await waitFor(() => service.getStatus().status === 'ERROR');
    assert.equal(instances.length, 0);
    await fs.rm(lockPath, { force: true });

    // Inicio lento y operaciones concurrentes: una sola instancia, sin falso conectado.
    await Promise.all([
      service.initializeWhatsAppClient(),
      service.initializeWhatsAppClient(),
      service.initializeWhatsAppClient(),
    ]);
    await waitFor(() => instances.length === 1);
    assert.equal(service.getStatus().status, 'CONNECTING');
    assert.equal(service.getStatus().ready, false);

    // QR renovado y descarte del QR al autenticar.
    instances[0].emit('qr', 'qr-one');
    assert.equal(service.getStatus().status, 'WAITING_QR');
    assert.equal(service.getLastQr(), 'qr-one');
    instances[0].emit('qr', 'qr-two');
    assert.equal(service.getLastQr(), 'qr-two');
    instances[0].emit('authenticated');
    assert.equal(service.getStatus().status, 'AUTHENTICATING');
    assert.equal(service.getLastQr(), null);
    instances[0].info = { wid: { user: 'simulated' } };
    instances[0].emit('ready');
    assert.equal(service.getStatus().status, 'CONNECTED');
    assert.equal(service.getStatus().diagnostic_mode, true);
    assert.equal(service.getStatus().external_sends_enabled, false);
    await assert.rejects(
      () => service.sendWhatsAppMessage('5490000000000', 'mensaje de prueba'),
      /envíos de WhatsApp están bloqueados/,
    );

    // Reintento conserva la carpeta de sesion y destruye la instancia anterior.
    const sessionPath = path.join(temporaryAuthPath, 'session-lifecycle-test');
    await fs.mkdir(sessionPath, { recursive: true });
    await fs.writeFile(path.join(sessionPath, 'preserve.me'), 'test');
    await service.restartWhatsAppClient();
    await waitFor(() => instances.length === 2);
    assert.equal(instances[0].destroyed, true);
    assert.equal(await fs.readFile(path.join(sessionPath, 'preserve.me'), 'utf8'), 'test');

    // Fallo recuperable y eventos tardios ignorados.
    instances[1].emit('auth_failure', 'rejected');
    await waitFor(() => service.getStatus().status === 'ERROR');
    instances[1].emit('ready');
    assert.equal(service.getStatus().status, 'ERROR');
    assert.equal(instances[1].destroyed, true);

    // Timeout libera la operacion y permite recuperar.
    await service.restartWhatsAppClient();
    await waitFor(() => instances.length === 3);
    await waitFor(() => service.getStatus().status === 'ERROR', 1800);
    assert.equal(instances[2].destroyed, true);

    // Desconexion inesperada: un unico reintento progresivo.
    await service.restartWhatsAppClient();
    await waitFor(() => instances.length === 4);
    instances[3].emit('ready');
    instances[3].emit('disconnected', 'network');
    assert.equal(service.getStatus().status, 'RECONNECTING');
    await waitFor(() => instances.length === 5, 1800);
    instances[4].emit('disconnected', 'network-again');
    await waitFor(() => service.getStatus().status === 'ERROR');
    await wait(1200);
    assert.equal(instances.length, 5);

    // La limpieza no enumera procesos. Desvincular exige confirmación.
    assert.deepEqual(await service.cleanupStaleWhatsAppBrowsers(), {
      skipped: true,
      reason: 'managed_client_destroy_only',
    });
    await assert.rejects(() => service.logoutWhatsAppClient(), /confirmación explícita/);
    await service.logoutWhatsAppClient({ confirmed: true });
    await assert.rejects(() => fs.access(sessionPath));
  } finally {
    await service.destroyWhatsAppClient().catch(() => null);
    await fs.rm(temporaryAuthPath, { recursive: true, force: true });
  }

  console.log('OK: ciclo de conexión WhatsApp validado con cliente y sesión temporales');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
