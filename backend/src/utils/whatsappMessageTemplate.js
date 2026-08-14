const PLACEHOLDERS_BY_MESSAGE_TYPE = Object.freeze({
  principal_whatsapp: Object.freeze([
    'paciente',
    'consultorio',
    'whatsapp_consultorio',
  ]),
  recordatorio_turno: Object.freeze([
    'paciente',
    'fecha',
    'hora',
    'prestacion',
    'profesional',
    'turno_id',
    'consultorio',
    'whatsapp_consultorio',
  ]),
  confirmacion_turno: Object.freeze([
    'paciente',
    'fecha',
    'hora',
    'prestacion',
    'profesional',
    'turno_id',
    'consultorio',
    'whatsapp_consultorio',
  ]),
  cancelacion_turno: Object.freeze([
    'paciente',
    'fecha',
    'hora',
    'prestacion',
    'profesional',
    'turno_id',
    'consultorio',
    'whatsapp_consultorio',
  ]),
  reprogramacion_turno: Object.freeze([
    'paciente',
    'fecha',
    'hora',
    'prestacion',
    'profesional',
    'turno_id',
    'consultorio',
    'whatsapp_consultorio',
  ]),
});

function extraerPlaceholders(template) {
  return [...String(template ?? '').matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
}

function interpolarTemplate(template, context = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => {
    const value = context[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function resolverMensajeConfigurado({ tipo, mensajes = [], context = {} } = {}) {
  const mensaje = mensajes.find((item) => item.tipo === tipo) || null;
  if (!mensaje) {
    return { estado: 'inexistente', contenido: null, placeholdersNoSoportados: [] };
  }

  if (mensaje.activo !== true) {
    return { estado: 'inactivo', contenido: null, placeholdersNoSoportados: [] };
  }

  const permitidos = new Set(PLACEHOLDERS_BY_MESSAGE_TYPE[tipo] || []);
  const placeholdersNoSoportados = [...new Set(
    extraerPlaceholders(mensaje.contenido).filter((placeholder) => !permitidos.has(placeholder)),
  )];

  if (placeholdersNoSoportados.length > 0) {
    return { estado: 'invalido', contenido: null, placeholdersNoSoportados };
  }

  return {
    estado: 'activo',
    contenido: interpolarTemplate(mensaje.contenido, context).trim(),
    placeholdersNoSoportados: [],
  };
}

module.exports = {
  PLACEHOLDERS_BY_MESSAGE_TYPE,
  extraerPlaceholders,
  interpolarTemplate,
  resolverMensajeConfigurado,
};
