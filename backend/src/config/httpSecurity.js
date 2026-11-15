const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const LOCAL_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'];

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getAllowedOrigins(env = process.env) {
  const configured = String(env.CORS_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (configured.length) return new Set(configured);
  return new Set(env.NODE_ENV === 'production' ? [] : LOCAL_ORIGINS);
}

function createCorsMiddleware(env = process.env) {
  const allowedOrigins = getAllowedOrigins(env);
  return cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      const error = new Error('Origen no permitido');
      error.status = 403;
      error.code = 'CORS_ORIGIN_NOT_ALLOWED';
      return callback(error);
    },
  });
}

function configureTrustedProxy(app, env = process.env) {
  const hops = Number.parseInt(env.TRUST_PROXY_HOPS || '0', 10);
  app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : false);
}

function createSecurityHeaders(env = process.env) {
  return helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"],
      frameSrc: ["'self'", 'blob:'], objectSrc: ["'self'", 'blob:'],
      baseUri: ["'self'"], formAction: ["'self'"],
    } },
    crossOriginEmbedderPolicy: false,
    hsts: env.NODE_ENV === 'production' ? undefined : false,
  });
}

function createLoginLimiter(env = process.env) {
  return rateLimit({
    windowMs: positiveInteger(env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    limit: positiveInteger(env.LOGIN_RATE_LIMIT_MAX, 5),
    standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true,
    validate: { xForwardedForHeader: false },
    handler(req, res) {
      return res.status(429).json({ mensaje: 'Demasiados intentos de inicio de sesión. Esperá unos minutos antes de volver a intentar.', codigo: 'LOGIN_RATE_LIMITED' });
    },
  });
}

module.exports = { LOCAL_ORIGINS, configureTrustedProxy, createCorsMiddleware, createLoginLimiter, createSecurityHeaders, getAllowedOrigins, positiveInteger };
