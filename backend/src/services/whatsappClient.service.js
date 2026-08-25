const qrcode = require('qrcode-terminal');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
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

function getSessionName() {
  return process.env.WHATSAPP_SESSION_NAME || 'odonton';
}

function getSessionPath() {
  return path.resolve(__dirname, '..', '..', '.wwebjs_auth', `session-${getSessionName()}`);
}

function getSessionDataPath() {
  return path.resolve(__dirname, '..', '..', '.wwebjs_auth');
}

function getStatus() {
  return {
    ok: true,
    status: connectionStatus,
    initialized: Boolean(client),
    initializing,
    isInitializing: initializing || connectionStatus === 'INITIALIZING',
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
    session_path: getSessionPath(),
    polling: Boolean(pollHandle),
    connected_user: connectedNumber || client?.info?.wid?._serialized || client?.info?.wid?.user || null,
    connectedNumber: connectedNumber || client?.info?.wid?._serialized || client?.info?.wid?.user || null,
    pushname: client?.info?.pushname || null,
    ready_at: readyAt,
    lastConnectedAt,
    lastDisconnectedAt,
    operationInProgress,
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
    qrcode.generate(qr, { small: true });
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

  await destroyWhatsAppClient();
  await initializeWhatsAppClient();
  await waitForWhatsAppReady();
}

async function sendWhatsAppMessage(phone, message, { retryOnBrowserError = true } = {}) {
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

module.exports = {
  initializeWhatsAppClient,
  getWhatsAppClient,
  sendWhatsAppMessage,
  normalizePhoneToChatId,
  normalizePhoneDigits,
  normalizePhoneForStorage,
  resolveIncomingPhoneForStorage,
  getStatus,
  getLastQr,
  destroyWhatsAppClient,
  logoutWhatsAppClient,
  restartWhatsAppClient,
  cleanupStaleWhatsAppBrowsers,
  pollRecentMessagesOnce,
};
