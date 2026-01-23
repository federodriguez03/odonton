/**
 * Modelo de Usuario (Odontólogo)
 * Gestiona autenticación y datos del administrador
 */

const db = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/cryptoUtils');

const User = {
  /**
   * Busca un usuario por email
   */
  findByEmail: async (email) => {
    const result = await db.query(
      'SELECT id, email, password, role, created_at FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  /**
   * Busca un usuario por ID
   */
  findById: async (id) => {
    const result = await db.query(
      'SELECT id, email, role, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Crea un nuevo usuario
   */
  create: async (email, password, role = 'admin') => {
    const hashedPassword = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, hashedPassword, role]
    );
    return result.rows[0];
  },

  /**
   * Valida credenciales
   */
  validateCredentials: async (email, password) => {
    const user = await User.findByEmail(email);
    if (!user) return null;

    const isValid = await comparePassword(password, user.password);
    return isValid ? { id: user.id, email: user.email, role: user.role } : null;
  },
};

module.exports = User;
