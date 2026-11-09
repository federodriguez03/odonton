const express = require('express');
const router = express.Router();

const {
	registrarPaciente,
	actualizarPaciente,
} = require('../controllers/pacientesController');

const {
	middlewareAutenticacion,
	autorizarOdontologo,
	middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');

const {
	validarEntradaPaciente,
	validarConsultaPacientes,
} = require('../middlewares/pacientesMiddleware');
const consultasController = require('../controllers/consultasClinicasController');

router.get('/:id/consultas', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, consultasController.listar);
router.post('/:id/consultas', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req,res,next) => {
	req.auditAction = 'registrar_atencion_clinica'; next();
}, consultasController.crear);
router.put('/:id/consultas/:consultaId', middlewareAutenticacion, autorizarOdontologo, middlewareAuditoria, (req,res,next) => {
	req.auditAction = 'actualizar_atencion_clinica'; next();
}, consultasController.actualizar);

// Crear paciente
router.post(
	'/',
	middlewareAutenticacion,
	autorizarOdontologo,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'registrar_paciente';
		next();
	},
	validarEntradaPaciente,
	registrarPaciente
);

// Actualizar paciente
router.put(
	'/:id',
	middlewareAutenticacion,
	autorizarOdontologo,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'actualizar_paciente';
		next();
	},
	validarEntradaPaciente,
	actualizarPaciente
);

// Listar pacientes (GET /)
router.get(
	'/',
	middlewareAutenticacion,
	autorizarOdontologo,
	validarConsultaPacientes,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'ver_listado_pacientes';
		next();
	},
	// consultas en query: page, limit, q, dni, sort
	// no requiere validarEntradaPaciente
	(require('../controllers/pacientesController').listarPacientes)
);

// Ficha clínica de paciente (debe ir antes de '/:id')
router.get(
	'/:id/ficha-clinica',
	middlewareAutenticacion,
	autorizarOdontologo,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'consultar_ficha_clinica';
		next();
	},
	(require('../controllers/pacientesController').fichaClinica)
);

// Obtener detalle de paciente
router.get(
	'/:id',
	middlewareAutenticacion,
	autorizarOdontologo,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'ver_paciente';
		next();
	},
	(require('../controllers/pacientesController').obtenerPaciente)
);

module.exports = router;

