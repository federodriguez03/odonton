const fs = require('fs/promises');
const { pool } = require('../config/db');
const { UPLOADS_ROOT } = require('../utils/documentPaths');

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('readiness timeout')), timeoutMs);
  })]).finally(() => clearTimeout(timer));
}

async function checkReadiness({ query = () => pool.query('SELECT 1'), accessUploads = () => fs.access(UPLOADS_ROOT, fs.constants.R_OK | fs.constants.W_OK), timeoutMs = Number.parseInt(process.env.READINESS_TIMEOUT_MS || '2000', 10) } = {}) {
  const safeTimeout = Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 2000;
  try {
    await withTimeout(Promise.all([query(), accessUploads()]), safeTimeout);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { checkReadiness, withTimeout };
