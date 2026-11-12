const express = require('express');
const router = express.Router();

const {
	registrarPaciente,
	actualizarPaciente,
} = require('../controllers/pacientesController');

const {
	middlewareAutenticacion,
	middlewareAuditoria,
} = require('../middlewares/turnosMiddleware');
const {
	autorizarAdministracionPacientes,
	autorizarClinicaPacientes,
	rechazarCamposClinicosEnAdministracion,
	exigirProfesionalConfirmado,
} = require('../middlewares/pacientesAutorizacion');

const {
	validarEntradaPaciente,
	validarConsultaPacientes,
} = require('../middlewares/pacientesMiddleware');
const declaracionesSaludController = require('../controllers/declaracionesSaludController');

// Crear paciente
router.post(
	'/',
	middlewareAutenticacion,
	autorizarAdministracionPacientes,
	rechazarCamposClinicosEnAdministracion,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'registrar_paciente';
		next();
	},
	validarEntradaPaciente,
	registrarPaciente
);

router.put(
	'/:id/atenciones/:atencionId',
	middlewareAutenticacion,
	autorizarClinicaPacientes,
	exigirProfesionalConfirmado,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'corregir_atencion_clinica';
		next();
	},
	(require('../controllers/pacientesController').editarAtencion)
);

// Actualizar paciente
router.put(
	'/:id',
	middlewareAutenticacion,
	autorizarAdministracionPacientes,
	rechazarCamposClinicosEnAdministracion,
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
	autorizarAdministracionPacientes,
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
	autorizarClinicaPacientes,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'consultar_ficha_clinica';
		next();
	},
	(require('../controllers/pacientesController').fichaClinica)
);

router.get(
	'/:id/declaracion-salud',
	middlewareAutenticacion,
	autorizarClinicaPacientes,
	middlewareAuditoria,
	(req, res, next) => { req.auditAction = 'consultar_declaracion_salud'; next(); },
	declaracionesSaludController.getDeclaration
);

router.post(
	'/:id/declaracion-salud',
	middlewareAutenticacion,
	autorizarClinicaPacientes,
	exigirProfesionalConfirmado,
	middlewareAuditoria,
	(req, res, next) => { req.auditAction = 'guardar_declaracion_salud'; next(); },
	declaracionesSaludController.saveDeclaration
);

router.post(
	'/:id/atenciones',
	middlewareAutenticacion,
	autorizarClinicaPacientes,
	exigirProfesionalConfirmado,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'registrar_atencion_clinica';
		next();
	},
	(require('../controllers/pacientesController').registrarAtencion)
);

// Obtener detalle de paciente
router.get(
	'/:id',
	middlewareAutenticacion,
	autorizarAdministracionPacientes,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'ver_paciente';
		next();
	},
	(require('../controllers/pacientesController').obtenerPaciente)
);

module.exports = router;

