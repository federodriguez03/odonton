/**
 * Utilidades para tokens JWT
 * Generación de tokens de autenticación y temporales
 */

const jwt = require('jsonwebtoken');

/**
 * Genera token JWT para autenticación
 * @param {object} user - Datos del usuario
 * @returns {string} Token JWT
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
  );
};

/**
 * Genera token temporal para autogestión de pacientes
 * Expira en 30 minutos por defecto
 * @param {string} appointmentId - ID del turno
 * @param {string} patientEmail - Email del paciente
 * @returns {string} Token temporal
 */
const generateTempToken = (appointmentId, patientEmail) => {
  return jwt.sign(
    {
      type: 'temp',
      appointmentId,
      patientEmail,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
};

/**
 * Verifica y decodifica un token
 * @param {string} token - Token a verificar
 * @returns {object|null} Datos decodificados o null si es inválido
 */
const verifyTokenData = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
};

module.exports = {
  generateToken,
  generateTempToken,
  verifyTokenData,
};
