const { pool } = require('../config/db');
const questionnaire = require('../domain/declaracionSaludCuestionario');

const ANSWER_LABELS = { yes: 'Sí', no: 'No', unknown: 'No sabe', not_applicable: 'No corresponde' };

function normalizeText(value, max = 2000) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function validateDetail(detail, value) {
  if (value === null || value === undefined || value === '') return null;
  if (detail.type === 'multi') {
    if (!Array.isArray(value)) throw new Error(`Formato inválido en ${detail.id}`);
    const allowed = new Set(detail.options || []);
    const selected = [...new Set(value.map(String))].filter((item) => allowed.has(item));
    if (selected.length !== value.length) throw new Error(`Opción inválida en ${detail.id}`);
    return selected;
  }
  if (detail.type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(new Date(`${value}T00:00:00`).getTime())) throw new Error(`Fecha inválida en ${detail.id}`);
    return String(value);
  }
  if (detail.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 60) throw new Error(`Número inválido en ${detail.id}`);
    return number;
  }
  return normalizeText(value);
}

function validateAndNormalizeResponses(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Las respuestas deben ser un objeto');
  const unknown = Object.keys(raw).filter((id) => !questionnaire.byId.has(id));
  if (unknown.length) throw new Error('La declaración contiene preguntas desconocidas');
  const responses = {};
  for (const question of questionnaire.questions) {
    const source = raw[question.id];
    if (!source || source.answer === null || source.answer === undefined || source.answer === '') continue;
    const answer = String(source.answer);
    if (!question.answers.includes(answer)) throw new Error(`Respuesta inválida en ${question.id}`);
    const details = {};
    if (answer === 'yes') {
      for (const detail of question.details || []) {
        const value = validateDetail(detail, source.details?.[detail.id]);
        if (value !== null && (!Array.isArray(value) || value.length)) details[detail.id] = value;
      }
    }
    responses[question.id] = { answer, ...(Object.keys(details).length ? { details } : {}) };
  }
  return responses;
}

function getMissingFields({ respondidoPor, nombreTutor, responses }) {
  const missing = [];
  if (!['paciente', 'tutor'].includes(respondidoPor)) missing.push('respondido_por');
  if (respondidoPor === 'tutor' && !normalizeText(nombreTutor, 160)) missing.push('nombre_tutor');
  for (const question of questionnaire.questions) {
    const response = responses[question.id];
    if (!response) {
      missing.push(question.id);
      continue;
    }
    for (const detail of question.details || []) {
      if (!(detail.requiredWhen || []).includes(response.answer)) continue;
      const value = response.details?.[detail.id];
      if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) missing.push(`${question.id}.${detail.id}`);
    }
  }
  return missing;
}

function summarizeResponses(responses = {}) {
  return questionnaire.questions.flatMap((question) => {
    if (!question.summary) return [];
    const response = responses[question.id];
    const summaryWhen = question.summaryWhen || ['yes'];
    if (!response || !summaryWhen.includes(response.answer)) return [];
    const detailValues = Object.values(response.details || {}).flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
    return [{ id: question.id, label: question.summary, value: detailValues.length ? detailValues.join(' · ') : ANSWER_LABELS[response.answer] }];
  });
}

function serializeQuestionnaire() {
  return { version: questionnaire.VERSION, sections: questionnaire.sections };
}

async function assertPatient(client, patientId) {
  const result = await client.query('SELECT id FROM pacientes WHERE id = $1', [patientId]);
  if (!result.rowCount) throw new Error('Paciente no encontrado');
}

async function getByPatient(patientId) {
  const pid = Number(patientId);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Paciente inválido');
  await assertPatient(pool, pid);
  const { rows } = await pool.query(
    `SELECT d.id, d.paciente_id, d.numero_version, d.cuestionario_version, d.respondido_por,
            d.nombre_tutor, d.respuestas, d.estado, d.cargado_por_usuario_id,
            u.nombre AS cargado_por_nombre, d.reemplaza_declaracion_id, d.completada_at, d.created_at
       FROM declaraciones_salud d
       LEFT JOIN usuarios u ON u.id = d.cargado_por_usuario_id
      WHERE d.paciente_id = $1
      ORDER BY d.numero_version DESC`,
    [pid],
  );
  const latest = rows[0] || null;
  return {
    questionnaire: serializeQuestionnaire(),
    latest: latest ? { ...latest, resumen: summarizeResponses(latest.respuestas), faltantes: getMissingFields({ respondidoPor: latest.respondido_por, nombreTutor: latest.nombre_tutor, responses: latest.respuestas }) } : null,
    versions: rows.map(({ respuestas, ...row }) => row),
  };
}

async function saveVersion({ patientId, actorUserId, respondidoPor, nombreTutor, rawResponses }) {
  const pid = Number(patientId);
  const actor = Number(actorUserId);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Paciente inválido');
  if (!Number.isInteger(actor) || actor <= 0) throw new Error('Usuario cargador inválido');
  if (!['paciente', 'tutor'].includes(respondidoPor)) throw new Error('Debe indicar quién respondió');
  const tutor = respondidoPor === 'tutor' ? normalizeText(nombreTutor, 160) : null;
  if (respondidoPor === 'tutor' && !tutor) throw new Error('Debe indicar el nombre del tutor');
  const responses = validateAndNormalizeResponses(rawResponses);
  const missing = getMissingFields({ respondidoPor, nombreTutor: tutor, responses });
  const status = missing.length ? 'incompleta' : 'completa';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await assertPatient(client, pid);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [738211, pid]);
    const previous = await client.query('SELECT id, numero_version FROM declaraciones_salud WHERE paciente_id = $1 ORDER BY numero_version DESC LIMIT 1', [pid]);
    const previousRow = previous.rows[0] || null;
    const number = (previousRow?.numero_version || 0) + 1;
    const { rows } = await client.query(
      `INSERT INTO declaraciones_salud
        (paciente_id, numero_version, cuestionario_version, respondido_por, nombre_tutor, respuestas, estado,
         cargado_por_usuario_id, reemplaza_declaracion_id, completada_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::varchar,$8,$9,CASE WHEN $7::varchar = 'completa' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [pid, number, questionnaire.VERSION, respondidoPor, tutor, responses, status, actor, previousRow?.id || null],
    );
    await client.query('COMMIT');
    return { ...rows[0], faltantes: missing, resumen: summarizeResponses(responses) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { getByPatient, saveVersion, validateAndNormalizeResponses, getMissingFields, summarizeResponses, serializeQuestionnaire };
