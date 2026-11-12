const express = require('express');
const router = express.Router();
const { listar, crear } = require('../controllers/tratamientosController');
const { middlewareAutenticacion, middlewareAuditoria } = require('../middlewares/turnosMiddleware');
const { autorizarClinicaPacientes, exigirProfesionalConfirmado } = require('../middlewares/pacientesAutorizacion');

router.get('/', middlewareAutenticacion, autorizarClinicaPacientes, middlewareAuditoria, (req,res,next)=>{req.auditAction='listar_tratamientos';next();}, listar);
router.post('/', middlewareAutenticacion, autorizarClinicaPacientes, exigirProfesionalConfirmado, middlewareAuditoria, (req,res,next)=>{req.auditAction='crear_tratamiento';next();}, crear);

module.exports = router;
