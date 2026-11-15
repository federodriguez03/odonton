const crypto = require('crypto');
const processDiagnosticSalt = crypto.randomBytes(32);

function diagnosticFingerprint(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const salt = process.env.WHATSAPP_DIAGNOSTIC_HASH_SALT || process.env.JWT_SECRET || processDiagnosticSalt;
  return crypto.createHmac('sha256', salt).update(normalized).digest('hex').slice(0, 16);
}

function minimalIncomingEvent({ sourceEvent, type, fromMe } = {}) {
  return {
    event: String(sourceEvent || 'message').slice(0, 40),
    type: String(type || 'unknown').slice(0, 40),
    from_me: fromMe === true,
    at: new Date().toISOString(),
  };
}

module.exports = { diagnosticFingerprint, minimalIncomingEvent };
