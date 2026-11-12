const express = require('express');
const router = express.Router();
const { crear, listar } = require('../controllers/protesisFijasController');
const { middlewareAutenticacion, middlewareAuditoria } = require('../middlewares/turnosMiddleware');
const { autorizarClinicaPacientes, exigirProfesionalConfirmado } = require('../middlewares/pacientesAutorizacion');

router.post('/', middlewareAutenticacion, autorizarClinicaPacientes, exigirProfesionalConfirmado, middlewareAuditoria, (req,res,next)=>{req.auditAction='crear_protesis_fija';next();}, crear);
router.get('/', middlewareAutenticacion, autorizarClinicaPacientes, middlewareAuditoria, (req,res,next)=>{req.auditAction='listar_protesis_fijas';next();}, listar);

module.exports = router;
