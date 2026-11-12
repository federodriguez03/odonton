const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { generarToken } = require('../utils/jwt');
const { obtenerIdentidadVigente } = require('./identidadService');

function crearErrorCredenciales() {
  const err = new Error('Credenciales inválidas');
  err.status = 401;
  return err;
}

async function login({ email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');

  if (!normalizedEmail || !rawPassword) {
    throw crearErrorCredenciales();
  }

  const { rows } = await pool.query(
    'SELECT id, nombre, email, password_hash, activo FROM usuarios WHERE email = $1 LIMIT 1',
    [normalizedEmail]
  );

  if (rows.length === 0) {
    throw crearErrorCredenciales();
  }

  const user = rows[0];
  const ok = await bcrypt.compare(rawPassword, user.password_hash);
  if (!ok) {
    throw crearErrorCredenciales();
  }

  const identity = await obtenerIdentidadVigente(user.id);
  const token = generarToken({ userId: user.id, tokenVersion: identity.token_version });

  return {
    token,
    user: identity,
  };
}

async function obtenerUsuarioPorId(id) {
  return obtenerIdentidadVigente(id);
}

module.exports = {
  login,
  obtenerUsuarioPorId,
};
