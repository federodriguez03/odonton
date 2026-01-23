/**
 * Utilidades para cifrado y contraseñas
 * Hashing y validación segura de contraseñas
 */

const bcrypt = require('bcryptjs');

/**
 * Cifra una contraseña
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<string>} Contraseña cifrada
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Compara una contraseña con su hash
 * @param {string} password - Contraseña en texto plano
 * @param {string} hash - Hash almacenado
 * @returns {Promise<boolean>} True si coinciden
 */
const comparePassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

module.exports = {
  hashPassword,
  comparePassword,
};
