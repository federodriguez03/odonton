const STATUS_POR_CODIGO = Object.freeze({
  CARGO_INMUTABLE: 409,
  CARGO_NO_ENCONTRADO: 404,
  CONCEPTO_INVALIDO: 400,
  FECHA_FUTURA: 400,
  FECHA_INVALIDA: 400,
  FECHA_PAGO_ANTERIOR: 400,
  FILTRO_INVALIDO: 400,
  ID_INVALIDO: 400,
  IMPORTE_INVALIDO: 400,
  METODO_PAGO_INVALIDO: 400,
  MOTIVO_ANULACION_INVALIDO: 400,
  PACIENTE_NO_ENCONTRADO: 404,
  PAGO_NO_ENCONTRADO: 404,
  PAGO_YA_ANULADO: 409,
  PRESTACION_NO_ENCONTRADA: 404,
  PRESTACION_TURNO_INCOMPATIBLE: 409,
  SOBREPAGO: 409,
  TEXTO_INVALIDO: 400,
  TURNO_NO_ENCONTRADO: 404,
  TURNO_PACIENTE_INCOMPATIBLE: 409,
  USUARIO_INVALIDO: 400,
});

function responderErrorPagos(res, error, mensajeInterno) {
  const status = STATUS_POR_CODIGO[error?.code] || 500;
  const conocido = status !== 500;

  return res.status(status).json({
    mensaje: conocido ? error.message : mensajeInterno,
    codigo: conocido ? error.code : 'ERROR_INTERNO',
  });
}

module.exports = {
  responderErrorPagos,
};
