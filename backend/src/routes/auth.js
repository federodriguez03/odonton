/**
 * Rutas de autenticación
 * POST /api/auth/login - Iniciar sesión
 * POST /api/auth/logout - Cerrar sesión
 */

const express = require('express');
const { body } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const { handleValidationErrors, validators } = require('../middleware/validation');
const { generateToken } = require('../utils/tokenUtils');
const User = require('../models/User');

const router = express.Router();

/**
 * POST /api/auth/login
 * Autentica al usuario (odontólogo)
 */
router.post('/login', 
  [
    validators.email(),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;

      // Validar credenciales
      const user = await User.validateCredentials(email, password);
      if (!user) {
        return res.status(401).json({ error: 'Email o contraseña incorrectos' });
      }

      // Generar token
      const token = generateToken(user);

      res.status(200).json({
        message: 'Autenticación exitosa',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error en la autenticación' });
    }
  }
);

/**
 * POST /api/auth/logout
 * Cierra sesión (validación de cliente)
 */
router.post('/logout', verifyToken, (req, res) => {
  res.status(200).json({ message: 'Sesión cerrada exitosamente' });
});

/**
 * GET /api/auth/me
 * Obtiene datos del usuario autenticado
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(200).json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener datos del usuario' });
  }
});

module.exports = router;
