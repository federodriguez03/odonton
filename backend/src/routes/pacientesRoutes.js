const express = require('express');
const router = express.Router();

const {
	registrarPaciente,
	actualizarPaciente,
	generarLinkSolicitudTurno,
	validarTokenSolicitudTurno,
	consultarDisponibilidadSolicitudTurno,
	confirmarSolicitudTurno,
	generarLinkCancelacionTurno,
	validarTokenCancelacionTurno,
	listarTurnosCancelables,
	cancelarTurnoPropio,
	generarLinkReprogramacionTurno,
	validarTokenReprogramacionTurno,
	listarTurnosReprogramables,
	consultarDisponibilidadReprogramacion,
	reprogramarTurnoPropio,
} = require('../controllers/pacientesController');

const {
	middlewareAutenticacion,
	autorizarOdontologo,
	middlewareAuditoria,
	asignarActorSistema,
} = require('../middlewares/turnosMiddleware');

const {
	validarEntradaPaciente,
	validarConsultaPacientes,
	validarOdontogramaPieza,
} = require('../middlewares/pacientesMiddleware');

// Autogestion paciente: generar link seguro de solicitud de turno (canal WhatsApp / sistema)
router.post(
	'/autogestion/solicitar-turno/link',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_generar_link_solicitud_turno';
		next();
	},
	generarLinkSolicitudTurno
);

// Autogestion paciente: validar token antes de mostrar formulario
router.get(
	'/autogestion/solicitar-turno/token/:token',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_validar_token_solicitud_turno';
		next();
	},
	validarTokenSolicitudTurno
);

// Autogestion paciente: consultar disponibilidad para token activo
router.post(
	'/autogestion/solicitar-turno/disponibilidad',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_consultar_disponibilidad_turnos';
		next();
	},
	consultarDisponibilidadSolicitudTurno
);

// Autogestion paciente: confirmar solicitud (crea/actualiza paciente y confirma turno)
router.post(
	'/autogestion/solicitar-turno/confirmar',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_confirmar_turno';
		next();
	},
	confirmarSolicitudTurno
);

// Autogestion paciente: generar link seguro para cancelar turno propio
router.post(
	'/autogestion/cancelar-turno/link',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_generar_link_cancelacion_turno';
		next();
	},
	generarLinkCancelacionTurno
);

// Autogestion paciente: validar token de cancelacion
router.get(
	'/autogestion/cancelar-turno/token/:token',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_validar_token_cancelacion_turno';
		next();
	},
	validarTokenCancelacionTurno
);

// Autogestion paciente: listar turnos cancelables del paciente
router.post(
	'/autogestion/cancelar-turno/listar',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_listar_turnos_cancelables';
		next();
	},
	listarTurnosCancelables
);

// Autogestion paciente: cancelar turno propio con confirmacion explicita
router.post(
	'/autogestion/cancelar-turno/confirmar',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_cancelar_turno_propio';
		next();
	},
	cancelarTurnoPropio
);

// Autogestion paciente: generar link seguro para reprogramar turno propio
router.post(
	'/autogestion/reprogramar-turno/link',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_generar_link_reprogramacion_turno';
		next();
	},
	generarLinkReprogramacionTurno
);

// Autogestion paciente: validar token de reprogramacion
router.get(
	'/autogestion/reprogramar-turno/token/:token',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_validar_token_reprogramacion_turno';
		next();
	},
	validarTokenReprogramacionTurno
);

// Autogestion paciente: listar turnos reprogramables del paciente
router.post(
	'/autogestion/reprogramar-turno/listar',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_listar_turnos_reprogramables';
		next();
	},
	listarTurnosReprogramables
);

// Autogestion paciente: consultar disponibilidad para el turno elegido
router.post(
	'/autogestion/reprogramar-turno/disponibilidad',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_consultar_disponibilidad_reprogramacion';
		next();
	},
	consultarDisponibilidadReprogramacion
);

// Autogestion paciente: reprogramar turno propio con confirmacion explicita
router.post(
	'/autogestion/reprogramar-turno/confirmar',
	asignarActorSistema,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'autogestion_reprogramar_turno_propio';
		next();
	},
	reprogramarTurnoPropio
);

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

// Obtener odontograma completo de paciente
router.get(
	'/:id/odontograma',
	middlewareAutenticacion,
	autorizarOdontologo,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'consultar_odontograma';
		next();
	},
	(require('../controllers/pacientesController').obtenerOdontograma)
);

// Guardar estado de una pieza del odontograma
router.put(
	'/:id/odontograma/piezas/:pieza',
	middlewareAutenticacion,
	autorizarOdontologo,
	validarOdontogramaPieza,
	middlewareAuditoria,
	(req, res, next) => {
		req.auditAction = 'actualizar_odontograma_pieza';
		next();
	},
	(require('../controllers/pacientesController').guardarOdontogramaPieza)
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

