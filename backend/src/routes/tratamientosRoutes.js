const express = require('express');
const router = express.Router();
const { listar, crear } = require('../controllers/tratamientosController');
const { middlewareAutenticacion, middlewareAuditoria } = require('../middlewares/turnosMiddleware');
const { autorizarEscrituraClinica, autorizarLecturaClinica } = require('../middleware/authorizationMiddleware');

router.get('/', middlewareAutenticacion, autorizarLecturaClinica, middlewareAuditoria, (req,res,next)=>{req.auditAction='listar_tratamientos';next();}, listar);
router.post('/', middlewareAutenticacion, autorizarEscrituraClinica, middlewareAuditoria, (req,res,next)=>{req.auditAction='crear_tratamiento';next();}, crear);

module.exports = router;
