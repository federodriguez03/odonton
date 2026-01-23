/**
 * Middleware de validación y sanitización
 * Previene inyecciones y valida datos de entrada
 */

const { body, validationResult } = require('express-validator');

/**
 * Middleware que procesa errores de validación
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      errors: errors.array().map(e => ({ field: e.param, message: e.msg }))
    });
  }
  next();
};

/**
 * Validadores reutilizables
 */
const validators = {
  // Validación de email
  email: () => body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Email inválido'),

  // Validación de teléfono
  phone: (fieldName = 'phone') => body(fieldName)
    .matches(/^[\d\s\-\+\(\)]+$/)
    .withMessage('Teléfono inválido'),

  // Validación de DNI
  dni: () => body('dni')
    .matches(/^\d{7,8}$/)
    .withMessage('DNI debe tener 7 u 8 dígitos'),

  // Validación de contraseña
  password: () => body('password')
    .isLength({ min: 8 })
    .withMessage('Contraseña debe tener al menos 8 caracteres'),

  // Validación de nombre
  name: (fieldName = 'name') => body(fieldName)
    .trim()
    .isLength({ min: 2 })
    .withMessage('Nombre debe tener al menos 2 caracteres'),

  // Validación de fecha
  date: (fieldName = 'date') => body(fieldName)
    .isISO8601()
    .withMessage('Fecha inválida'),
};

module.exports = {
  handleValidationErrors,
  validators,
};
