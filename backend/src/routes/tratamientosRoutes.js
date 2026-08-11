const express = require('express');
const router = express.Router();
const { listar, crear } = require('../controllers/tratamientosController');
const { middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria } = require('../middlewares/turnosMiddleware');

router.get('/', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req,res,next)=>{req.auditAction='listar_tratamientos';next();}, listar);
router.post('/', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req,res,next)=>{req.auditAction='crear_tratamiento';next();}, crear);

module.exports = router;
