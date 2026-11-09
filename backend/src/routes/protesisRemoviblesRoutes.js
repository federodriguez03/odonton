const express = require('express');
const router = express.Router();
const { crear, listar } = require('../controllers/protesisRemoviblesController');
const { middlewareAutenticacion, middlewareAuditoria } = require('../middlewares/turnosMiddleware');
const { autorizarEscrituraClinica, autorizarLecturaClinica } = require('../middleware/authorizationMiddleware');

router.post('/', middlewareAutenticacion, autorizarEscrituraClinica, middlewareAuditoria, (req,res,next)=>{req.auditAction='crear_protesis_removible';next();}, crear);
router.get('/', middlewareAutenticacion, autorizarLecturaClinica, middlewareAuditoria, (req,res,next)=>{req.auditAction='listar_protesis_removibles';next();}, listar);

module.exports = router;
