const express = require('express');
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { createLoginLimiter } = require('../config/httpSecurity');

const router = express.Router();

router.post('/login', createLoginLimiter(), authController.login);
router.get('/me', verifyToken, authController.me);
router.post('/cambiar-password', verifyToken, authController.cambiarPassword);

module.exports = router;
