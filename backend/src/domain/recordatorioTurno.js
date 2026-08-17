function resolverRecordatorioHabilitado(value, { defaultValue } = {}) {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') {
    throw new Error('recordatorioHabilitado debe ser booleano');
  }
  return value;
}

module.exports = {
  resolverRecordatorioHabilitado,
};
