export function buildOdontogramaChangePayloads({ pacienteId, registros, dirtyKeys }) {
  return [...dirtyKeys].map((key) => {
    const [diente, cara] = key.split('-');
    const estado = registros.get(key);
    if (!estado || estado === 'sin_evaluar') throw new Error(`Cambio de odontograma inválido: ${key}`);
    return { paciente_id: pacienteId, diente: Number(diente), cara, estado };
  });
}

export function getOdontogramaTargetFaces({ face, alcance, faces }) {
  return alcance === 'pieza' ? [...faces] : [face];
}
