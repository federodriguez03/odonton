const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function generarToken(payload) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado');
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verificarToken(token) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado');
  }

  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  generarToken,
  verificarToken,
};
