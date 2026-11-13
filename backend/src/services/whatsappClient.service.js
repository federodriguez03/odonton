const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { normalizePhoneToChatId } = require('../utils/whatsappPhone');

let client = null;
let ready = false;
let initializing = false;
let lastQrAt = null;
let lastQr = null;
let lastError = null;
let lastIncomingMessage = null;
let pollHandle = null;
let readyAt = null;
let connectionStatus = 'DISCONNECTED';
let operationInProgress = false;
let connectedNumber = null;
let lastConnectedAt = null;
let lastDisconnectedAt = null;
const processedMessageIds = new Set();
const recentProcessedFingerprints = new Map();
let clientGeneration = 0;
let initializationTimer = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let voluntaryDisconnect = false;
let operationQueue = Promise.resolve();
let sessionLock = null;
let diagnosticStartedAt = null;

const CONNECTION_STATUS = Object.freeze({
  DISCONNECTED: 'DISCONNECTED',
  CONNECTING: 'CONNECTING',
  WAITING_QR: 'WAITING_QR',
  AUTHENTICATING: 'AUTHENTICATING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  ERROR: 'ERROR',
});

function isDiagnosticMode() {
  return String(process.env.WHATSAPP_DIAGNOSTIC_MODE || '').trim().toLowerCase() === 'true';
}

function areExternalSendsBlocked() {
  return isDiagnosticMode()
    || String(process.env.ODONTON_DEMO_MODE || '').trim().toLowerCase() === 'true'
    || String(process.env.EXTERNAL_SENDS_ENABLED || 'true').trim().toLowerCase() === 'false';
}

function logDiagnosticState(status, detail = '') {
  if (!isDiagnosticMode()) return;
  const elapsed = diagnosticStartedAt ? Date.now() - diagnosticStartedAt : 0;
  const safeDetail = String(detail || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
  console.info(`[WHATSAPP DIAGNOSTICO] estado=${status} elapsed_ms=${elapsed}${safeDetail ? ` detalle=${safeDetail}` : ''}`);
}

function getSessionName() {
  return process.env.WHATSAPP_SESSION_NAME || 'odonton';
}

function getSessionPath() {
  return path.join(getSessionDataPath(), `session-${getSessionName()}`);
}

function getSessionDataPath() {
  return process.env.WHATSAPP_AUTH_DATA_PATH
    ? path.resolve(process.env.WHATSAPP_AUTH_DATA_PATH)
    : path.resolve(__dirname, '..', '..', '.wwebjs_auth');
}

function getLockPath() {
  return path.join(getSessionDataPath(), `.${getSessionName()}.owner.lock`);
}

function getStatus() {
  return {
    ok: true,
    status: connectionStatus,
    initialized: Boolean(client),
    initializing,
    isInitializing: initializing || [CONNECTION_STATUS.CONNECTING, CONNECTION_STATUS.RECONNECTING].includes(connectionStatus),
    ready,
    isReady: ready,
    last_qr_at: lastQrAt,
    qrGeneratedAt: lastQrAt,
    has_qr: Boolean(lastQr),
    hasQr: Boolean(lastQr),
    last_error: lastError,
    lastError,
    last_incoming_message: lastIncomingMessage,
    session_name: getSessionName(),
    polling: Boolean(pollHandle),
    connected_user: connectedNumber || client?.info?.wid?._serialized || client?.info?.wid?.user || null,
    connectedNumber: connectedNumber || client?.info?.wid?._serialized || client?.info?.wid?.user || null,
    pushname: client?.info?.pushname || null,
    ready_at: readyAt,
    lastConnectedAt,
    lastDisconnectedAt,
    operationInProgress,
    diagnostic_mode: isDiagnosticMode(),
    external_sends_enabled: !areExternalSendsBlocked(),
  };
}

function normalizePhoneDigits(phone) {
  const raw = String(phone || '').trim();
  if (raw.endsWith('@lid')) return raw.toLowerCase();

  let value = String(phone || '').replace('@c.us', '').replace(/[^\d]/g, '');
  if (!value) return '';

  const countryCode = String(process.env.DEFAULT_COUNTRY_CODE || '54').replace(/\D/g, '');
  const mobilePrefix = String(process.env.DEFAULT_MOBILE_PREFIX || '9').replace(/\D/g, '');

  if (value.startsWith('00')) value = value.slice(2);
  if (value.startsWith(countryCode)) return value;

  if (countryCode === '54') {
    if (value.startsWith('0')) value = value.slice(1);
    if (value.length >= 10 && mobilePrefix) return `${countryCode}${mobilePrefix}${value}`;
    value = value.replace(/^(\d{2,4})15/, '$1');
  }

  return `${countryCode}${value}`;
}

function normalizePhoneForStorage(phone) {
  const raw = String(phone || '').trim();
  if (!raw || raw.endsWith('@lid')) return null;

  const digits = normalizePhoneDigits(raw);
  return /^\d{10,15}$/.test(digits) ? digits : null;
}

function isDirectChatId(chatId) {
  const value = String(chatId || '');
  return value.endsWith('@c.us') || value.endsWith('@lid');
}

function getPreferredIncomingChatId(message) {
  const candidates = [
    message?.from,
    message?.author,
    message?._data?.from,
    message?._data?.author,
    message?._data?.id?.remote,
    message?.fromMe ? message?.to : null,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return (
    candidates.find((item) => item.endsWith('@c.us')) ||
    candidates.find((item) => item.endsWith('@lid')) ||
    ''
  );
}

function firstValidStoragePhone(candidates = []) {
  for (const candidate of candidates) {
    const normalized = normalizePhoneForStorage(candidate);
    if (normalized) return normalized;
  }
  return null;
}

async function resolveIncomingPhoneForStorage(message, chatId = null, currentClient = client) {
  const incomingChatId = String(chatId || getPreferredIncomingChatId(message) || '').trim();
  const directPhone = firstValidStoragePhone([
    incomingChatId,
    message?.from,
    message?.author,
    message?._data?.from,
    message?._data?.author,
  ]);
  if (directPhone) return directPhone;
  if (!incomingChatId.endsWith('@lid')) return null;

  try {
    const contact = typeof message?.getContact === 'function'
      ? await message.getContact()
      : null;
    const contactId = contact?.id?._serialized
      || (contact?.id?.server === 'c.us' && contact?.id?.user
        ? `${contact.id.user}@c.us`
        : null);
    const contactPhone = firstValidStoragePhone([contactId]);
    if (contactPhone) return contactPhone;
  } catch (_) {
    // La resolucion del contacto es opcional; nunca se persiste el LID como telefono.
  }

  try {
    if (typeof currentClient?.getContactLidAndPhone !== 'function') return null;
    const mappings = await currentClient.getContactLidAndPhone([incomingChatId]);
    const match = Array.isArray(mappings)
      ? mappings.find((item) => String(item?.lid || '').trim() === incomingChatId)
      : null;
    return firstValidStoragePhone([match?.pn]);
  } catch (_) {
    return null;
  }
}

function isGroupOrStatus(chatId) {
  const value = String(chatId || '');
  return value.endsWith('@g.us') || value === 'status@broadcast';
}

function isSafeModeEnabled() {
  return String(process.env.WHATSAPP_SAFE_MODE || '').trim().toLowerCase() === 'true';
}

function getAllowedSafeModeNumbers() {
  return String(process.env.WHATSAPP_ALLOWED_NUMBERS || '')
    .split(',')
    .map((phone) => normalizePhoneDigits(phone))
    .filter(Boolean);
}

function isAllowedBySafeMode(chatId) {
  if (!isSafeModeEnabled()) return true;
  const allowed = getAllowedSafeModeNumbers();
  if (!allowed.length) return false;
  const digits = normalizePhoneDigits(chatId);
  return allowed.includes(digits);
}

function getWhatsAppClient() {
  return client;
}

function getPollingIntervalMs() {
  const seconds = Number.parseInt(process.env.WHATSAPP_POLL_INTERVAL_SECONDS || '5', 10);
  const safeSeconds = Number.isFinite(seconds) && seconds >= 3 ? seconds : 5;
  return safeSeconds * 1000;
}

function isMessagePollingEnabled() {
  return String(process.env.WHATSAPP_POLLING_ENABLED || '').trim().toLowerCase() === 'true';
}

function isWhatsAppDebugEnabled() {
  return String(process.env.WHATSAPP_DEBUG || '').trim().toLowerCase() === 'true';
}

function getMessageId(message) {
  return message?.id?._serialized || message?.id?.id || null;
}

function rememberProcessedMessage(message) {
  const id = getMessageId(message);
  if (!id) return false;
  if (processedMessageIds.has(id)) return true;
  processedMessageIds.add(id);
  if (processedMessageIds.size > 500) {
    const [first] = processedMessageIds;
    processedMessageIds.delete(first);
  }
  return false;
}

function rememberProcessedFingerprint(message) {
  const chatId = String(message.from || message.to || '');
  const body = String(message.body || '').trim().toLowerCase();
  if (!chatId || !body) return false;

  const timestamp = Number(message.timestamp || 0);
  const fingerprint = `${chatId}|${timestamp}|${body}`;
  if (recentProcessedFingerprints.has(fingerprint)) return true;

  recentProcessedFingerprints.set(fingerprint, Date.now());
  if (recentProcessedFingerprints.size > 500) {
    const now = Date.now();
    for (const [key, createdAt] of recentProcessedFingerprints.entries()) {
      if (now - createdAt > 10 * 60 * 1000 || recentProcessedFingerprints.size > 500) {
        recentProcessedFingerprints.delete(key);
      }
    }
  }

  return false;
}

/**
 * Lista mensajes recientes para diagnóstico sin reinyectarlos en el bot.
 */
async function pollRecentMessagesOnce({ limitChats = 50, limitMessages = 10, maxAgeMinutes = 120, process = false } = {}) {
  if (!client || !ready) {
    throw new Error('WhatsApp Web no esta listo');
  }

  const chats = await client.getChats();
  const recentChats = chats
    .filter((chat) => isDirectChatId(chat?.id?._serialized))
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, limitChats);

  const seen = [];
  for (const chat of recentChats) {
    const messages = await chat.fetchMessages({ limit: limitMessages });
    const mappedMessages = [];

    for (const message of messages) {
      const ageMs = Date.now() - Number(message.timestamp || 0) * 1000;
      const isRecent = ageMs <= maxAgeMinutes * 60 * 1000;

      mappedMessages.push({
        id: getMessageId(message),
        from: message.from,
        to: message.to,
        fromMe: Boolean(message.fromMe),
        body: message.body || '',
        timestamp: message.timestamp || null,
        age_minutes: Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null,
        is_recent: isRecent,
      });
    }

    seen.push({
      id: chat.id?._serialized || null,
      name: chat.name || chat.pushname || null,
      isGroup: Boolean(chat.isGroup),
      unreadCount: chat.unreadCount || 0,
      timestamp: chat.timestamp || null,
      lastMessage: chat.lastMessage
        ? {
            id: getMessageId(chat.lastMessage),
            from: chat.lastMessage.from,
            to: chat.lastMessage.to,
            fromMe: Boolean(chat.lastMessage.fromMe),
            body: chat.lastMessage.body || '',
            timestamp: chat.lastMessage.timestamp || null,
          }
        : null,
      messages: mappedMessages,
    });
  }

  return {
    chats: seen,
    total_chats_seen: seen.length,
    last_incoming_message: lastIncomingMessage,
    processing_requested: process === true,
    processing_enabled: false,
  };
}

function stopMessagePolling() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

function startMessagePolling() {
  if (pollHandle || !client || !isMessagePollingEnabled()) return;

  pollHandle = setInterval(async () => {
    try {
      if (!client || !ready) return;
      await pollRecentMessagesOnce({ limitChats: 20, limitMessages: 5, maxAgeMinutes: 30, process: false });
    } catch (error) {
      const message = error?.message || String(error);
      lastError = message;
      console.error('[WHATSAPP WEB] Error en polling de mensajes:', message);
      if (error?.stack) console.error(error.stack);
    }
  }, getPollingIntervalMs());

  if (typeof pollHandle.unref === 'function') pollHandle.unref();
}

async function handleIncomingMessage(message, sourceEvent) {
  try {
    const from = getPreferredIncomingChatId(message);
    const to = String(message?.to || '').trim();

    // Solo un evento entrante real y ajeno puede alimentar el flujo automático.
    if (message?.fromMe === true) return;
    if (sourceEvent !== 'message') return;

    if (from === 'status@broadcast' || to === 'status@broadcast') {
      console.log('[WHATSAPP WEB] Mensaje ignorado por ser estado');
      return;
    }

    if (from.endsWith('@g.us')) {
      console.log('[WHATSAPP WEB] Mensaje ignorado por ser grupo');
      return;
    }

    if (!isDirectChatId(from)) {
      console.log('[WHATSAPP WEB] Mensaje ignorado por origen no directo');
      return;
    }

    if (!isAllowedBySafeMode(from)) {
      console.log('[WHATSAPP WEB] Mensaje ignorado por modo seguro');
      return;
    }

    if (message?.type !== 'chat') {
      const { hasActiveAutogestionSession, processAutogestionNonTextMessage } = require('./whatsappAutogestion.service');
      if (await hasActiveAutogestionSession(from)) {
        await processAutogestionNonTextMessage(from);
      }
      return;
    }

    if (!message?.body || !String(message.body).trim()) return;

    if (rememberProcessedMessage(message)) return;
    if (rememberProcessedFingerprint(message)) return;

    const chatId = from;
    const text = String(message.body).trim();
    const {
      hasActiveAutogestionSession,
      processAutogestionMessage,
      shouldStartAutogestion,
    } = require('./whatsappAutogestion.service');
    const hasIntent = /^[123]$/.test(text) || await shouldStartAutogestion(text);
    const { hasPendingReminderForPhone, processPatientReply } = require('./whatsappReminder.service');
    const hasSessionContext = hasIntent ? false : await hasActiveAutogestionSession(chatId);
    const hasReminderContext = hasIntent || hasSessionContext ? false : await hasPendingReminderForPhone(chatId);

    if (!hasIntent && !hasSessionContext && !hasReminderContext) {
      if (isWhatsAppDebugEnabled()) {
        console.log('[WHATSAPP WEB] Mensaje ignorado por no tener intencion');
      }
      return;
    }

    lastIncomingMessage = {
      event: sourceEvent,
      from,
      to,
      fromMe: Boolean(message.fromMe),
      type: message.type,
      at: new Date().toISOString(),
    };

    console.log('[WHATSAPP WEB] Mensaje recibido', lastIncomingMessage);

    if (hasReminderContext) {
      const reminderResult = await processPatientReply(chatId, text, { replyWhenNoPending: false });
      if (reminderResult?.codigo !== 'NO_PENDING_REMINDER') return;
    }

    const storagePhone = await resolveIncomingPhoneForStorage(message, chatId);
    await processAutogestionMessage(chatId, text, {
      storagePhone,
      allowSessionStart: true,
      sourceEvent,
      messageId: getMessageId(message),
      messageTimestamp: message?.timestamp || null,
      fromMe: message?.fromMe,
    });
  } catch (error) {
    console.error('[WHATSAPP WEB] Error procesando mensaje entrante:', error.message);
  }
}

function execFileAsync(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error?.message || null,
      });
    });
  });
}

async function cleanupStaleWhatsAppBrowsers() {
  return { skipped: true, reason: 'global_cleanup_disabled' };
  /* Implementacion historica deshabilitada: no debe enumerar procesos ni borrar locks.
  if (process.platform !== 'win32') return { skipped: true, reason: 'unsupported_platform' };
  if (String(process.env.WHATSAPP_CLEAN_STALE_BROWSER || 'true').toLowerCase() === 'false') {
    return { skipped: true, reason: 'disabled' };
  }

  const escapedSession = getSessionPath().replace(/'/g, "''");
  const script = `
    $session = '${escapedSession}';
    $matches = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" |
      Where-Object {
        $_.CommandLine -and (
          $_.CommandLine -like "*$session*" -or
          $_.CommandLine -like "*session-${getSessionName()}*" -or
          $_.CommandLine -like "*\\\\.wwebjs_auth\\\\*" -or
          $_.CommandLine -like "*\\.cache\\puppeteer\\chrome*"
        )
      };
    $ids = @($matches | Select-Object -ExpandProperty ProcessId);
    foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
    $ids -join ','
  `;

  const result = await execFileAsync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ]);

  const killed = result.stdout
    .trim()
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (killed.length) {
    console.warn(`[WHATSAPP WEB] Procesos Chromium colgados cerrados: ${killed.join(', ')}`);
  }

  const singletonFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
  for (const file of singletonFiles) {
    await fs.rm(path.join(getSessionPath(), file), { force: true }).catch(() => null);
  }

  return { ...result, killed };
  */
}

async function initializeWhatsAppClient() {
  if (client && ready && connectionStatus === 'READY') return client;
  if (operationInProgress || initializing || connectionStatus === 'INITIALIZING') return client;
  if (client && ['QR_READY', 'AUTHENTICATED'].includes(connectionStatus)) return client;

  operationInProgress = true;
  initializing = true;
  connectionStatus = 'INITIALIZING';
  ready = false;
  lastError = null;
  lastQr = null;
  console.log('[WhatsApp] Inicializando cliente...');

  if (client) {
    try {
      await client.destroy();
    } catch (_) {
      // Ignorar: el navegador puede haber quedado cerrado.
    }
    stopMessagePolling();
    client = null;
  }

  await cleanupStaleWhatsAppBrowsers().catch(() => null);

  client = new Client({
    authStrategy: new LocalAuth({
      clientId: getSessionName(),
      dataPath: getSessionDataPath(),
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
    },
  });

  client.on('qr', (qr) => {
    lastQrAt = new Date().toISOString();
    lastQr = qr;
    ready = false;
    initializing = false;
    operationInProgress = false;
    connectionStatus = 'QR_READY';
    console.log('[WhatsApp] QR generado');
  });

  client.on('authenticated', () => {
    connectionStatus = 'AUTHENTICATED';
    lastQr = null;
    console.log('[WhatsApp] Autenticado');
  });

  client.on('ready', () => {
    ready = true;
    initializing = false;
    operationInProgress = false;
    connectionStatus = 'READY';
    readyAt = new Date().toISOString();
    lastQr = null;
    lastError = null;
    connectedNumber = client?.info?.wid?._serialized || client?.info?.wid?.user || null;
    lastConnectedAt = new Date().toISOString();
    console.log('[WhatsApp] Cliente listo');
  });

  client.on('auth_failure', (message) => {
    ready = false;
    initializing = false;
    operationInProgress = false;
    stopMessagePolling();
    lastError = message || 'Fallo de autenticacion';
    connectionStatus = 'FAILED';
    client = null;
    console.error('[WhatsApp] Error de autenticación:', lastError);
  });

  client.on('disconnected', (reason) => {
    ready = false;
    initializing = false;
    operationInProgress = false;
    stopMessagePolling();
    lastError = reason || 'Cliente desconectado';
    lastQr = null;
    connectedNumber = null;
    readyAt = null;
    lastDisconnectedAt = new Date().toISOString();
    connectionStatus = 'DISCONNECTED';
    console.warn('[WhatsApp] Desconectado:', lastError);
    client = null;
  });

  client.on('message', (message) => handleIncomingMessage(message, 'message'));

  client.initialize()
    .catch((error) => {
      ready = false;
      initializing = false;
      operationInProgress = false;
      lastError = error.message;
      connectionStatus = 'FAILED';
      client = null;
      console.error('[WhatsApp] Error al inicializar:', error.message);
    });

  return client;
}

async function destroyWhatsAppClient() {
  const current = client;
  operationInProgress = true;
  connectionStatus = 'DISCONNECTING';
  ready = false;
  initializing = false;
  readyAt = null;
  stopMessagePolling();
  client = null;
  lastQr = null;
  connectedNumber = null;
  if (current) {
    try {
      await current.destroy();
    } catch (_) {
      // Ignorar: destroy puede fallar si Chromium ya termino.
    }
  }
  await cleanupStaleWhatsAppBrowsers();
  operationInProgress = false;
  connectionStatus = 'DISCONNECTED';
  lastDisconnectedAt = new Date().toISOString();
}

async function logoutWhatsAppClient() {
  const current = client;
  operationInProgress = true;
  connectionStatus = 'DISCONNECTING';
  ready = false;
  initializing = false;
  readyAt = null;
  stopMessagePolling();
  client = null;
  lastQr = null;
  lastQrAt = null;
  connectedNumber = null;

  if (current) {
    try {
      await current.logout();
    } catch (_) {
      // Si no hay sesion activa, limpiamos archivos locales abajo.
    }
    try {
      await current.destroy();
    } catch (_) {
      // Ignorar: Chromium puede haber terminado durante logout.
    }
  }

  await cleanupStaleWhatsAppBrowsers();
  await fs.rm(getSessionPath(), { recursive: true, force: true });
  lastError = null;
  operationInProgress = false;
  connectionStatus = 'DISCONNECTED';
  lastDisconnectedAt = new Date().toISOString();

  return {
    session_name: getSessionName(),
    session_path: getSessionPath(),
  };
}

async function restartWhatsAppClient() {
  if (operationInProgress) {
    return getStatus();
  }
  await destroyWhatsAppClient();
  await initializeWhatsAppClient();
  return getStatus();
}

function getLastQr() {
  return connectionStatus === 'QR_READY' ? lastQr : null;
}

function isDetachedFrameError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('detached frame') || text.includes('execution context was destroyed') || text.includes('target closed');
}

function waitForWhatsAppReady(timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (client && ready) return resolve(true);
      if (lastQr) return reject(new Error('WhatsApp Web requiere escanear el QR nuevamente.'));
      if (lastError && !initializing) return reject(new Error(lastError));
      if (Date.now() - startedAt >= timeoutMs) {
        return reject(new Error('WhatsApp Web esta reiniciando. Intenta nuevamente en unos segundos.'));
      }
      return setTimeout(tick, 1000);
    };
    tick();
  });
}

async function recoverWhatsAppClientAfterBrowserError(error) {
  ready = false;
  initializing = false;
  lastError = error?.message || String(error || 'Error de navegador de WhatsApp Web');
  console.warn('[WHATSAPP WEB] Cliente inestable, reiniciando:', lastError);

  await destroyManagedWhatsAppClient();
  await initializeManagedWhatsAppClient();
  await waitForWhatsAppReady();
}

async function sendWhatsAppMessage(phone, message, { retryOnBrowserError = true } = {}) {
  if (areExternalSendsBlocked()) {
    const error = new Error('Los envíos de WhatsApp están bloqueados en el modo de diagnóstico local.');
    error.code = 'WHATSAPP_EXTERNAL_SENDS_DISABLED';
    throw error;
  }
  if (!client || !ready) {
    throw new Error('WhatsApp Web no esta listo. Escanea el QR o espera la conexion.');
  }

  const chatId = normalizePhoneToChatId(phone);
  const text = String(message || '').trim();
  if (!text) throw new Error('Mensaje vacio');

  try {
    return await client.sendMessage(chatId, text);
  } catch (error) {
    if (retryOnBrowserError && isDetachedFrameError(error)) {
      await recoverWhatsAppClientAfterBrowserError(error);
      return sendWhatsAppMessage(phone, message, { retryOnBrowserError: false });
    }
    lastError = error.message;
    throw error;
  }
}

// Ciclo de conexion seguro. Se mantiene separado del transporte del bot para no
// alterar solicitudes, respuestas ni recordatorios en esta etapa.
function serializeConnectionOperation(operation) {
  const pending = operationQueue.then(operation, operation);
  operationQueue = pending.catch(() => null);
  return pending;
}

function clearConnectionTimers() {
  if (initializationTimer) clearTimeout(initializationTimer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  initializationTimer = null;
  reconnectTimer = null;
}

function isOwnerProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error?.code === 'EPERM'; }
}

async function acquireConnectionLock() {
  if (sessionLock) return sessionLock;
  await fs.mkdir(getSessionDataPath(), { recursive: true });
  const lockPath = getLockPath();
  const token = crypto.randomUUID();
  try {
    const handle = await fs.open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, hostname: os.hostname(), token, createdAt: new Date().toISOString() }), 'utf8');
    await handle.close();
    sessionLock = { lockPath, token };
    return sessionLock;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let owner = null;
    try { owner = JSON.parse(await fs.readFile(lockPath, 'utf8')); } catch (_) { /* lock ambiguo: conservar */ }
    if (owner?.hostname === os.hostname() && !isOwnerProcessAlive(Number(owner.pid))) {
      const stalePath = `${lockPath}.stale-${owner.pid}-${Date.now()}`;
      try {
        await fs.rename(lockPath, stalePath);
        await fs.rm(stalePath, { force: true });
        return acquireConnectionLock();
      } catch (_) { /* otro proceso resolvio el lock */ }
    }
    const lockError = new Error('La sesion de WhatsApp esta siendo utilizada por otro proceso.');
    lockError.code = 'WHATSAPP_SESSION_IN_USE';
    throw lockError;
  }
}

async function releaseConnectionLock() {
  const owned = sessionLock;
  sessionLock = null;
  if (!owned) return;
  try {
    const saved = JSON.parse(await fs.readFile(owned.lockPath, 'utf8'));
    if (saved?.token === owned.token) await fs.rm(owned.lockPath, { force: true });
  } catch (_) { /* nunca borrar un lock cuya propiedad no se pudo comprobar */ }
}

async function destroyCurrentInstance(instance) {
  if (!instance) return;
  try { await instance.destroy(); } catch (_) { /* ya puede estar cerrada */ }
}

function setConnectionError(error) {
  ready = false;
  initializing = false;
  operationInProgress = false;
  lastError = error?.message || String(error || 'No se pudo iniciar WhatsApp');
  connectionStatus = CONNECTION_STATUS.ERROR;
  logDiagnosticState(connectionStatus, lastError);
}

async function failCurrentGeneration(generation, instance, error) {
  if (generation !== clientGeneration) return;
  clientGeneration += 1;
  clearConnectionTimers();
  stopMessagePolling();
  if (client === instance) client = null;
  setConnectionError(error);
  await destroyCurrentInstance(instance);
  await releaseConnectionLock();
}

function armInitializationTimeout(generation, instance) {
  if (initializationTimer) clearTimeout(initializationTimer);
  const configured = Number.parseInt(process.env.WHATSAPP_INIT_TIMEOUT_MS || '60000', 10);
  const timeoutMs = Number.isFinite(configured) && configured >= 1000 ? configured : 60000;
  initializationTimer = setTimeout(() => {
    serializeConnectionOperation(() => failCurrentGeneration(generation, instance, new Error('La conexion excedio el tiempo de espera. Podes reintentar sin perder la sesion.')));
  }, timeoutMs);
  initializationTimer.unref?.();
}

function scheduleLimitedReconnect(reason) {
  if (voluntaryDisconnect || reconnectTimer) return;
  const configured = Number.parseInt(process.env.WHATSAPP_RECONNECT_MAX_ATTEMPTS || '3', 10);
  const maximum = Number.isFinite(configured) && configured >= 0 ? configured : 3;
  if (reconnectAttempt >= maximum) {
    setConnectionError(new Error(`La conexion se interrumpio y agoto ${maximum} reintentos.`));
    releaseConnectionLock();
    return;
  }
  reconnectAttempt += 1;
  connectionStatus = CONNECTION_STATUS.RECONNECTING;
  lastError = reason || 'Conexion interrumpida';
  const delayMs = Math.min(30000, 1000 * (2 ** (reconnectAttempt - 1)));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    serializeConnectionOperation(() => startManagedClient({ reconnecting: true })).catch(setConnectionError);
  }, delayMs);
  reconnectTimer.unref?.();
}

async function startManagedClient({ reconnecting = false } = {}) {
  operationInProgress = true;
  initializing = true;
  ready = false;
  lastError = null;
  lastQr = null;
  connectionStatus = reconnecting ? CONNECTION_STATUS.RECONNECTING : CONNECTION_STATUS.CONNECTING;
  voluntaryDisconnect = false;
  diagnosticStartedAt = Date.now();
  logDiagnosticState(connectionStatus);
  await acquireConnectionLock();

  const previous = client;
  client = null;
  await destroyCurrentInstance(previous);
  const generation = ++clientGeneration;
  const instance = new Client({
    authStrategy: new LocalAuth({ clientId: getSessionName(), dataPath: getSessionDataPath() }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions'],
    },
  });
  client = instance;
  const isCurrent = () => generation === clientGeneration && client === instance;

  instance.on('qr', (qr) => {
    if (!isCurrent()) return;
    if (initializationTimer) clearTimeout(initializationTimer);
    initializationTimer = null;
    lastQrAt = new Date().toISOString();
    lastQr = qr;
    ready = false;
    initializing = false;
    operationInProgress = false;
    connectionStatus = CONNECTION_STATUS.WAITING_QR;
    logDiagnosticState(connectionStatus);
  });
  instance.on('authenticated', () => {
    if (!isCurrent()) return;
    connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
    logDiagnosticState(connectionStatus);
    lastQr = null;
    armInitializationTimeout(generation, instance);
  });
  instance.on('ready', () => {
    if (!isCurrent()) return;
    if (initializationTimer) clearTimeout(initializationTimer);
    initializationTimer = null;
    ready = true;
    initializing = false;
    operationInProgress = false;
    connectionStatus = CONNECTION_STATUS.CONNECTED;
    readyAt = new Date().toISOString();
    lastQr = null;
    lastError = null;
    reconnectAttempt = 0;
    connectedNumber = instance?.info?.wid?._serialized || instance?.info?.wid?.user || null;
    lastConnectedAt = new Date().toISOString();
    logDiagnosticState(connectionStatus);
    if (!isDiagnosticMode()) startMessagePolling();
  });
  instance.on('auth_failure', (message) => {
    if (!isCurrent()) return;
    voluntaryDisconnect = true;
    serializeConnectionOperation(() => failCurrentGeneration(generation, instance, new Error(message || 'La sesion fue rechazada. Desvinculala para generar un QR nuevo.')));
  });
  instance.on('disconnected', (reason) => {
    if (!isCurrent()) return;
    clientGeneration += 1;
    if (initializationTimer) clearTimeout(initializationTimer);
    initializationTimer = null;
    stopMessagePolling();
    client = null;
    ready = false;
    initializing = false;
    operationInProgress = false;
    lastQr = null;
    connectedNumber = null;
    readyAt = null;
    lastDisconnectedAt = new Date().toISOString();
    connectionStatus = CONNECTION_STATUS.RECONNECTING;
    destroyCurrentInstance(instance).finally(() => scheduleLimitedReconnect(reason));
  });
  if (!isDiagnosticMode()) {
    instance.on('message', (message) => {
      if (isCurrent()) handleIncomingMessage(message, 'message');
    });
  }
  armInitializationTimeout(generation, instance);
  Promise.resolve(instance.initialize()).catch((error) => serializeConnectionOperation(() => failCurrentGeneration(generation, instance, error)));
  return instance;
}

async function disconnectManagedClient({ preserveSession = true, unlink = false } = {}) {
  voluntaryDisconnect = true;
  clearConnectionTimers();
  const instance = client;
  clientGeneration += 1;
  client = null;
  ready = false;
  initializing = false;
  readyAt = null;
  lastQr = null;
  connectedNumber = null;
  stopMessagePolling();
  if (unlink && instance) {
    try { await instance.logout(); } catch (_) { /* continuar con destruccion local */ }
  }
  await destroyCurrentInstance(instance);
  if (!preserveSession) await fs.rm(getSessionPath(), { recursive: true, force: true });
  await releaseConnectionLock();
  operationInProgress = false;
  connectionStatus = CONNECTION_STATUS.DISCONNECTED;
  lastDisconnectedAt = new Date().toISOString();
  logDiagnosticState(connectionStatus);
}

function requestManagedConnection({ retry = false } = {}) {
  const activeStates = [CONNECTION_STATUS.CONNECTING, CONNECTION_STATUS.AUTHENTICATING, CONNECTION_STATUS.RECONNECTING, CONNECTION_STATUS.CONNECTED, CONNECTION_STATUS.WAITING_QR];
  if (activeStates.includes(connectionStatus) && !retry) return getStatus();
  connectionStatus = retry ? CONNECTION_STATUS.RECONNECTING : CONNECTION_STATUS.CONNECTING;
  initializing = true;
  operationInProgress = true;
  serializeConnectionOperation(async () => {
    if (retry) await disconnectManagedClient({ preserveSession: true });
    await startManagedClient({ reconnecting: retry });
  }).catch(setConnectionError);
  return getStatus();
}

async function initializeManagedWhatsAppClient() {
  requestManagedConnection({ retry: false });
  return client;
}

async function restartManagedWhatsAppClient() {
  return requestManagedConnection({ retry: true });
}

async function destroyManagedWhatsAppClient() {
  return serializeConnectionOperation(() => disconnectManagedClient({ preserveSession: true }));
}

async function logoutManagedWhatsAppClient({ confirmed = false } = {}) {
  if (confirmed !== true) {
    const error = new Error('La desvinculacion requiere confirmacion explicita.');
    error.code = 'WHATSAPP_UNLINK_CONFIRMATION_REQUIRED';
    throw error;
  }
  await serializeConnectionOperation(() => disconnectManagedClient({ preserveSession: false, unlink: true }));
  lastQrAt = null;
  lastError = null;
  reconnectAttempt = 0;
  return { session_name: getSessionName(), unlinked: true };
}

function getManagedLastQr() {
  return connectionStatus === CONNECTION_STATUS.WAITING_QR ? lastQr : null;
}

async function cleanupOwnedWhatsAppBrowser() {
  return { skipped: true, reason: 'managed_client_destroy_only' };
}

module.exports = {
  initializeWhatsAppClient: initializeManagedWhatsAppClient,
  getWhatsAppClient,
  sendWhatsAppMessage,
  normalizePhoneToChatId,
  normalizePhoneDigits,
  normalizePhoneForStorage,
  resolveIncomingPhoneForStorage,
  getStatus,
  getLastQr: getManagedLastQr,
  destroyWhatsAppClient: destroyManagedWhatsAppClient,
  logoutWhatsAppClient: logoutManagedWhatsAppClient,
  restartWhatsAppClient: restartManagedWhatsAppClient,
  cleanupStaleWhatsAppBrowsers: cleanupOwnedWhatsAppBrowser,
  pollRecentMessagesOnce,
};
