const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { generarToken } = require('../utils/jwt');

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
  if (!user.activo) {
    throw crearErrorCredenciales();
  }

  const ok = await bcrypt.compare(rawPassword, user.password_hash);
  if (!ok) {
    throw crearErrorCredenciales();
  }

  const token = generarToken({ userId: user.id, email: user.email });

  return {
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
    },
  };
}

async function obtenerUsuarioPorId(id) {
  const { rows } = await pool.query(
    'SELECT id, nombre, email FROM usuarios WHERE id = $1 LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

module.exports = {
  login,
  obtenerUsuarioPorId,
};
