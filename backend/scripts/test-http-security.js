const assert = require('node:assert/strict');
const express = require('express');
const {
  configureTrustedProxy, createCorsMiddleware, createLoginLimiter, createSecurityHeaders,
} = require('../src/config/httpSecurity');
const { checkReadiness } = require('../src/services/readinessService');

async function run() {
  const env = {
    NODE_ENV: 'test', CORS_ALLOWED_ORIGINS: 'http://allowed.test', TRUST_PROXY_HOPS: '0',
    LOGIN_RATE_LIMIT_MAX: '2', LOGIN_RATE_LIMIT_WINDOW_MS: '60000',
  };
  const app = express();
  configureTrustedProxy(app, env);
  app.use(createSecurityHeaders(env));
  app.use(createCorsMiddleware(env));
  app.use(express.json({ limit: '1kb' }));
  app.post('/login', createLoginLimiter(env), (req, res) => res.status(401).json({ mensaje: 'Credenciales inválidas' }));
  app.post('/echo', (req, res) => res.json({ ok: true }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ codigo: 'PAYLOAD_TOO_LARGE' });
    if (error.code === 'CORS_ORIGIN_NOT_ALLOWED') return res.status(403).json({ codigo: error.code });
    return next(error);
  });

  assert.equal(app.get('trust proxy'), false);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const allowed = await fetch(`${base}/echo`, { method: 'POST', headers: { Origin: 'http://allowed.test', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://allowed.test');
    assert.ok(allowed.headers.get('content-security-policy'));
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');

    const denied = await fetch(`${base}/echo`, { method: 'POST', headers: { Origin: 'http://evil.test', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).codigo, 'CORS_ORIGIN_NOT_ALLOWED');

    const oversized = await fetch(`${base}/echo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(2048) }) });
    assert.equal(oversized.status, 413);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${attempt}` }, body: '{}' });
      assert.equal(response.status, attempt < 3 ? 401 : 429);
      if (attempt === 3) assert.equal((await response.json()).codigo, 'LOGIN_RATE_LIMITED');
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  assert.equal(await checkReadiness({ query: async () => {}, accessUploads: async () => {}, timeoutMs: 50 }), true);
  assert.equal(await checkReadiness({ query: async () => { throw new Error('db'); }, accessUploads: async () => {}, timeoutMs: 50 }), false);
  assert.equal(await checkReadiness({ query: () => new Promise(() => {}), accessUploads: async () => {}, timeoutMs: 10 }), false);
  console.log('OK HTTP: CORS, headers, payload, login, proxy y readiness');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
