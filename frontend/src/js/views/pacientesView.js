import {
  createAtencion,
  createPaciente,
  deleteDocumento,
  downloadDocumento,
  getDocumentoPreview,
  getFichaClinica,
  getDocumentos,
  getOdontogramaPaciente,
  getOdontogramaReferencias,
  getPacientes,
  getProtesisFijas,
  getProtesisRemovibles,
  postOdontograma,
  updateAtencion,
  updatePaciente,
  uploadDocumento,
} from '../api.js';
import { renderAlert } from '../components/alerts.js';
import { buildOdontogramaChangePayloads } from '../odontogramaChanges.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const permanentes = {
  superior: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  inferior: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
};

const temporales = {
  superior: [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  inferior: [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
};

const estados = {
  sin_evaluar: '#e5e7eb',
  sano: '#ffffff',
  existente: '#ff4d4d', // prestaciones existentes
  requerido: '#4d79ff', // prestaciones requeridas
  corona: '#ffcc00',
  corona_completa: '#f59e0b',
  protesis_fija: '#cbd5ff',
  protesis_removible: '#9dd6c8',
  ausente: '#4b5563',
};

const FACES = ['vestibular', 'mesial', 'distal', 'oclusal', 'lingual'];

const FACE_POLYGONS = {
  vestibular: '0,0 100,0 75,25 25,25',
  mesial: '0,0 25,25 25,75 0,100',
  distal: '100,0 100,100 75,75 75,25',
  oclusal: '25,25 75,25 75,75 25,75',
  lingual: '0,100 100,100 75,75 25,75',
};

const state = {
  page: 1,
  limit: 10,
  q: '',
  dni: '',
  sort: 'apellido:asc',
  total: 0,
  mode: 'create',
  ficha: {
    pacienteId: null,
    page: 1,
    limit: 5,
    estado: '',
    sort: 'fecha:desc',
    total: 0,
    documentoUrls: new Map(),
  },
  odontograma: {
    pacienteId: null,
    selectedTooth: null,
    registros: new Map(),
    dirtyKeys: new Set(),
    metaDirty: false,
    referencias: new Map(),
  },
};

const ui = {
  alertContainer: document.getElementById('alert-container'),
  tbody: document.getElementById('pacientes-tbody'),
  paginationMeta: document.getElementById('pagination-meta'),
  prevButton: document.getElementById('prev-page'),
  nextButton: document.getElementById('next-page'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-q'),
  searchDniInput: document.getElementById('search-dni'),
  searchSortInput: document.getElementById('search-sort'),
  clearSearchButton: document.getElementById('clear-search'),
  createForm: document.getElementById('create-paciente-form'),
  openCreateModalButton: document.getElementById('open-create-modal'),
  pacienteIdInput: document.getElementById('paciente-id'),
  modalTitle: document.getElementById('paciente-modal-label'),
  modalSubmitButton: document.getElementById('paciente-submit-btn'),
  nacionalidadTipo: document.getElementById('nacionalidad-tipo'),
  nacionalidadPais: document.getElementById('nacionalidad'),
  nacionalidadPaisGroup: document.getElementById('nacionalidad-pais-group'),
  pacientesListView: document.getElementById('pacientes-list-view'),
  fichaView: document.getElementById('paciente-ficha-view'),
  fichaContent: document.getElementById('paciente-ficha-content'),
  documentoPreviewContent: document.getElementById('documento-preview-content'),
  documentoPreviewLabel: document.getElementById('documento-preview-label'),
  odontoModalLabel: document.getElementById('odontograma-paciente-info'),
  odontoSvg: document.getElementById('odontograma-svg'),
  odontoForm: document.getElementById('odontograma-form'),
  odontoSelectedPiece: document.getElementById('odontograma-pieza-selected'),
  odontoEstadoClinico: document.getElementById('odonto-estado-clinico'),
  odontoObservaciones: document.getElementById('odonto-observaciones'),
  odontoSaveBtn: document.getElementById('odontograma-save-btn'),
  odontoSarro: document.getElementById('odonto-sarro'),
  odontoPeriodontal: document.getElementById('odonto-periodontal'),
  odontoCount: document.getElementById('odonto-count-existentes'),
  odontoCountProtesisFijas: document.getElementById('odonto-count-protesis-fijas'),
  odontoCountProtesisRemovibles: document.getElementById('odonto-count-protesis-removibles'),
  odontoCountMarcasHeredadas: document.getElementById('odonto-count-marcas-protesis-heredadas'),
  odontoDenticion: document.getElementById('odonto-denticion'),
  odontoExportPdf: document.getElementById('odonto-export-pdf'),
  odontoDetails: document.getElementById('odontograma-tooth-details'),
  odontoLegend: document.getElementById('odontograma-legend'),
};

const pacienteModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('paciente-modal'));
const documentoPreviewModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('documento-preview-modal'));
const odontoModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('odontograma-modal'));

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR');
}

function formatText(value) {
  return value && String(value).trim() ? value : '-';
}

function getHistoriaDateParts(value) {
  if (!value) return { day: '—', month: 'Sin fecha', year: '', time: '' };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '—', month: 'Sin fecha', year: '', time: '' };
  const hasTime = /(?:T|\s)\d{2}:\d{2}/.test(String(value));
  return {
    day: date.toLocaleDateString('es-AR', { day: '2-digit' }),
    month: date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').toUpperCase(),
    year: date.toLocaleDateString('es-AR', { year: 'numeric' }),
    time: hasTime ? date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
  };
}

function getHistoriaProfesional(historia) {
  const profesional = historia.profesional;
  if (typeof profesional === 'string') return profesional.trim() || 'Sin registrar';
  if (profesional && typeof profesional === 'object') {
    const nombre = [profesional.nombre, profesional.apellido].filter(Boolean).join(' ').trim();
    return nombre || profesional.nombre_completo || 'Sin registrar';
  }
  return historia.profesional_nombre || historia.nombre_profesional || 'Sin registrar';
}

function getHistoriaPrestaciones(historia) {
  if (Array.isArray(historia.prestaciones)) {
    const nombres = historia.prestaciones
      .map((prestacion) => (typeof prestacion === 'string' ? prestacion : prestacion?.nombre))
      .filter(Boolean);
    return nombres.length ? nombres.join(', ') : 'Sin registrar';
  }
  return historia.prestacion?.nombre || historia.prestacion_nombre || historia.prestacion || 'Sin registrar';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function serializePacienteForDataset(paciente) {
  return encodeURIComponent(
    JSON.stringify({
      id: paciente.id,
      nombre: paciente.nombre,
      apellido: paciente.apellido,
      dni: paciente.dni,
      telefono: paciente.telefono,
      email: paciente.email,
      nacionalidad: paciente.nacionalidad,
      domicilio: paciente.domicilio,
      fecha_nacimiento: paciente.fecha_nacimiento,
      observaciones: paciente.observaciones,
    }),
  );
}

function renderRows(pacientes) {
  if (!pacientes.length) {
    ui.tbody.innerHTML = '<div class="col-12"><div class="text-center text-secondary border rounded-3 py-5">No se encontraron pacientes</div></div>';
    return;
  }

  ui.tbody.innerHTML = pacientes
    .map((paciente) => {
      const pacienteData = serializePacienteForDataset(paciente);
      return `
      <div class="col-12 col-md-6 col-xl-4">
        <article class="card h-100 border shadow-sm">
          <div class="card-body d-flex flex-column">
            <div class="mb-3">
              <h3 class="h5 mb-1">${paciente.nombre} ${paciente.apellido}</h3>
              <div class="text-secondary small">DNI</div>
              <div class="fw-semibold">${paciente.dni}</div>
            </div>
            <div class="mb-3">
              <div class="text-secondary small">Teléfono</div>
              <div>${formatText(paciente.telefono)}</div>
            </div>
            <div class="d-flex flex-wrap gap-2 mt-auto">
            <button class="btn btn-sm btn-outline-primary" type="button" data-action="ficha" data-id="${paciente.id}" aria-label="Ver ficha clinica">
              <i class="bi bi-journal-medical me-1"></i>Ver ficha
            </button>
            <button class="btn btn-sm btn-outline-secondary" type="button" data-action="edit" data-id="${paciente.id}" data-paciente="${pacienteData}" aria-label="Editar paciente">
              <i class="bi bi-pencil-square me-1"></i>Editar
            </button>
            </div>
          </div>
        </article>
      </div>
    `;
    })
    .join('');
}

function getPacienteFromRowButton(button) {
  const raw = button.dataset.paciente;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  ui.paginationMeta.textContent = `Pagina ${state.page} de ${totalPages} | Total: ${state.total}`;
  ui.prevButton.disabled = state.page <= 1;
  ui.nextButton.disabled = state.page >= totalPages;
}

function clearPacienteErrors() {
  ui.createForm.querySelectorAll('.is-invalid').forEach((field) => field.classList.remove('is-invalid'));
  ui.createForm.querySelectorAll('.invalid-feedback.dynamic').forEach((feedback) => feedback.remove());
}

function setPacienteFieldError(fieldName, message) {
  const field = ui.createForm.elements[fieldName] || (fieldName === 'nacionalidad' ? ui.nacionalidadPais : null);
  if (!field) return;
  field.classList.add('is-invalid');
  const feedback = document.createElement('div');
  feedback.className = 'invalid-feedback dynamic';
  feedback.textContent = message;
  field.insertAdjacentElement('afterend', feedback);
}

function syncNacionalidadFields() {
  const isOther = ui.nacionalidadTipo.value === 'Otra';
  ui.nacionalidadPaisGroup.classList.toggle('d-none', !isOther);
  ui.nacionalidadPais.required = isOther;
}

function setNacionalidadValue(value) {
  const nationality = String(value || '').trim();
  if (!nationality) {
    ui.nacionalidadTipo.value = '';
    ui.nacionalidadPais.value = '';
  } else if (nationality.toLocaleLowerCase('es') === 'argentina') {
    ui.nacionalidadTipo.value = 'Argentina';
    ui.nacionalidadPais.value = '';
  } else {
    ui.nacionalidadTipo.value = 'Otra';
    if (![...ui.nacionalidadPais.options].some((option) => option.value === nationality)) ui.nacionalidadPais.add(new Option(nationality, nationality));
    ui.nacionalidadPais.value = nationality;
  }
  syncNacionalidadFields();
}

function validatePacientePayload(payload) {
  const errors = {};
  const nameRegex = /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;
  for (const field of ['nombre', 'apellido']) {
    payload[field] = String(payload[field] || '').normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!payload[field]) errors[field] = `El ${field} es obligatorio`;
    else if (!nameRegex.test(payload[field])) errors[field] = 'Usá sólo letras, espacios, guiones y apóstrofes';
  }
  payload.dni = String(payload.dni || '').trim();
  if (!payload.dni) errors.dni = 'El DNI es obligatorio';
  else if (!/^[0-9]{7,10}$/.test(payload.dni)) errors.dni = 'El DNI debe contener entre 7 y 10 dígitos';
  const phone = String(payload.telefono || '').trim();
  if (phone && !/^[+()\d\s.-]+$/.test(phone)) errors.telefono = 'Ingresá un teléfono válido';
  const email = String(payload.email || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Ingresá un email válido';
  if (payload.fecha_nacimiento) {
    const selected = new Date(`${payload.fecha_nacimiento}T00:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (Number.isNaN(selected.getTime())) errors.fecha_nacimiento = 'Ingresá una fecha válida';
    else if (selected > today) errors.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura';
  }
  if (ui.nacionalidadTipo.value === 'Otra' && !String(payload.nacionalidad || '').trim()) errors.nacionalidad = 'Seleccioná un país';
  return errors;
}

function openCreateModal() {
  state.mode = 'create';
  ui.modalTitle.textContent = 'Nuevo paciente';
  ui.modalSubmitButton.textContent = 'Guardar paciente';
  ui.pacienteIdInput.value = '';
  ui.createForm.reset();
  clearPacienteErrors();
  syncNacionalidadFields();
  pacienteModal?.show();
}

function openEditModal(paciente) {
  state.mode = 'edit';
  ui.modalTitle.textContent = 'Editar paciente';
  ui.modalSubmitButton.textContent = 'Guardar cambios';
  ui.pacienteIdInput.value = paciente.id;
  ui.createForm.elements.nombre.value = paciente.nombre;
  ui.createForm.elements.apellido.value = paciente.apellido;
  ui.createForm.elements.dni.value = paciente.dni === '-' ? '' : paciente.dni;
  ui.createForm.elements.telefono.value = paciente.telefono || '';
  ui.createForm.elements.email.value = paciente.email || '';
  clearPacienteErrors();
  setNacionalidadValue(paciente.nacionalidad);
  ui.createForm.elements.domicilio.value = paciente.domicilio || '';
  ui.createForm.elements.fecha_nacimiento.value = paciente.fecha_nacimiento ? String(paciente.fecha_nacimiento).slice(0, 10) : '';
  ui.createForm.elements.observaciones.value = paciente.observaciones || '';
  pacienteModal?.show();
}

function renderFichaContentLegacy(data) {
  const paciente = data.paciente || {};
  const turnos = data.historialTurnos?.turnos || [];
  const totalTurnos = data.historialTurnos?.total || 0;
  const page = data.historialTurnos?.page || state.ficha.page;
  const limit = data.historialTurnos?.limit || state.ficha.limit;
  const totalPages = Math.max(1, Math.ceil(totalTurnos / limit));

  state.ficha.page = page;
  state.ficha.total = totalTurnos;

  const turnosHtml = turnos.length
    ? turnos
        .map(
          (turno) => `
            <tr>
              <td>${formatDate(turno.fecha_hora_inicio)}</td>
              <td>${turno.prestacion?.nombre || '-'}</td>
              <td>${turno.estado || '-'}</td>
              <td>${turno.prestacion?.duracion_minutos ? `${turno.prestacion.duracion_minutos} min` : '-'}</td>
              <td>${turno.observaciones || '-'}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="5" class="text-center text-secondary">Sin historial</td></tr>';

  ui.fichaModalContent.innerHTML = `
    <div class="row g-3 mb-2">
      <div class="col-md-2"><strong>ID:</strong> ${paciente.id ?? '-'}</div>
      <div class="col-md-6"><strong>Paciente:</strong> ${paciente.apellido || ''}, ${paciente.nombre || ''}</div>
      <div class="col-md-4"><strong>DNI:</strong> ${paciente.dni || '-'}</div>
      <div class="col-md-4"><strong>Nacionalidad:</strong> ${paciente.nacionalidad || '-'}</div>
      <div class="col-md-4"><strong>Edad:</strong> ${paciente.edad ?? '-'} ${paciente.edad ? 'años' : ''}</div>
      <div class="col-md-4"><strong>Fecha nacimiento:</strong> ${formatDate(paciente.fecha_nacimiento)}</div>
      <div class="col-md-6"><strong>Contacto:</strong> ${paciente.telefono || '-'} / ${paciente.email || '-'}</div>
      <div class="col-md-6"><strong>Domicilio:</strong> ${paciente.domicilio || '-'}</div>
      <div class="col-md-4"><strong>Alergias:</strong> ${paciente.alergias || '-'}</div>
      <div class="col-md-4"><strong>Condiciones:</strong> ${paciente.condiciones || '-'}</div>
      <div class="col-md-4"><strong>Estado trat.:</strong> ${paciente.estado_tratamiento || '-'}</div>
      <div class="col-12"><strong>Observaciones clínicas:</strong> ${paciente.observaciones || '-'}</div>
    </div>
    <div class="row g-3 mb-3">
      <div class="col-md-6">
        <div class="p-2 bg-light rounded border">
          <div class="small text-secondary">Última visita</div>
          <div class="fw-semibold">${data.ultimaVisita?.fecha_hora_inicio ? formatDate(data.ultimaVisita.fecha_hora_inicio) : 'Sin registros'}</div>
          <div class="text-secondary small">${data.ultimaVisita?.prestacion || ''}</div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="p-2 bg-light rounded border">
          <div class="small text-secondary">Próximo turno</div>
          <div class="fw-semibold">${data.proximoTurno?.fecha_hora_inicio ? formatDate(data.proximoTurno.fecha_hora_inicio) : 'Sin turno programado'}</div>
          <div class="text-secondary small">${data.proximoTurno?.prestacion || ''}</div>
        </div>
      </div>
    </div>
    <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
      <label class="form-label mb-0 small text-secondary">Estado turno</label>
      <select id="ficha-estado-filter" class="form-select form-select-sm" style="max-width:220px">
        <option value="">Todos</option>
        <option value="programado">Programado</option>
        <option value="realizado">Realizado</option>
        <option value="cancelado">Cancelado</option>
        <option value="reprogramado">Reprogramado</option>
      </select>
      <label class="form-label mb-0 small text-secondary ms-2">Orden</label>
      <select id="ficha-sort" class="form-select form-select-sm" style="max-width:160px">
        <option value="fecha:desc">Fecha ↓</option>
        <option value="fecha:asc">Fecha ↑</option>
      </select>
      <div class="ms-auto small text-secondary">Página ${page} de ${totalPages} | Total ${totalTurnos}</div>
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Fecha</th><th>Prestación</th><th>Estado</th><th>Duración</th><th>Obs.</th></tr></thead>
        <tbody>${turnosHtml}</tbody>
      </table>
    </div>
    <div class="d-flex justify-content-between align-items-center">
      <button class="btn btn-sm btn-outline-secondary" id="ficha-prev" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
      <button class="btn btn-sm btn-outline-secondary" id="ficha-next" ${page >= totalPages ? 'disabled' : ''}>Siguiente</button>
    </div>
    <hr class="my-4" />
    <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
      <h3 class="h6 mb-0">Documentos del paciente</h3>
      <button class="btn btn-outline-secondary btn-sm" type="button" id="ficha-documentos-refresh">Actualizar</button>
    </div>
    <form id="ficha-documentos-form" class="row g-2 align-items-end mb-3">
      <div class="col-md-5">
        <label class="form-label" for="ficha-documentos-descripcion">Descripcion</label>
        <input id="ficha-documentos-descripcion" class="form-control" placeholder="Radiografia, receta, etc." />
      </div>
      <div class="col-md-5">
        <label class="form-label" for="ficha-documentos-archivo">Archivo</label>
        <input id="ficha-documentos-archivo" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png" required />
      </div>
      <div class="col-md-2 d-grid">
        <button class="btn btn-primary" type="submit">Subir</button>
      </div>
    </form>
    <div class="table-responsive">
      <table class="table table-sm align-middle">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Descripcion</th>
            <th>Fecha</th>
            <th class="text-end">Acciones</th>
          </tr>
        </thead>
        <tbody id="ficha-documentos-tbody"></tbody>
      </table>
    </div>
    <small class="text-secondary">Tipos permitidos: PDF, JPG, PNG. Maximo 10MB.</small>
  `;

  const estadoSelect = document.getElementById('ficha-estado-filter');
  if (estadoSelect) estadoSelect.value = state.ficha.estado || '';
  const sortSelect = document.getElementById('ficha-sort');
  if (sortSelect) sortSelect.value = state.ficha.sort || 'fecha:desc';

  estadoSelect?.addEventListener('change', async () => {
    state.ficha.estado = estadoSelect.value;
    state.ficha.page = 1;
    await loadFichaClinica();
  });

  sortSelect?.addEventListener('change', async () => {
    state.ficha.sort = sortSelect.value;
    state.ficha.page = 1;
    await loadFichaClinica();
  });

  document.getElementById('ficha-prev')?.addEventListener('click', async () => {
    if (state.ficha.page <= 1) return;
    state.ficha.page -= 1;
    await loadFichaClinica();
  });
  document.getElementById('ficha-next')?.addEventListener('click', async () => {
    if (state.ficha.page >= totalPages) return;
    state.ficha.page += 1;
    await loadFichaClinica();
  });

  bindFichaDocumentos();
  cargarDocumentosFicha();
}

function closeFicha() {
  state.ficha.documentoUrls?.forEach((url) => URL.revokeObjectURL(url));
  state.ficha.documentoUrls = new Map();
  state.ficha.pacienteId = null;
  ui.fichaView.classList.add('d-none');
  ui.pacientesListView.classList.remove('d-none');
}

function renderFichaContent(data) {
  const paciente = data.paciente || {};
  const turnosAtencion = data.turnosDisponiblesAtencion || [];
  const historias = [...(data.historiasClinicas || [])].sort((a, b) => {
    const fechaA = new Date(a.fecha_atencion || a.created_at || a.fecha || 0).getTime();
    const fechaB = new Date(b.fecha_atencion || b.created_at || b.fecha || 0).getTime();
    return fechaB - fechaA;
  });
  const edad = Number.isInteger(paciente.edad) ? `${paciente.edad} años` : 'Edad no disponible';
  const historiasHtml = historias.length
    ? `<div class="atenciones-timeline">${historias.map((historia) => {
        const fecha = getHistoriaDateParts(historia.fecha_atencion || historia.created_at || historia.fecha);
        const detalle = historia.descripcion || historia.detalle || 'Sin registrar';
        const resumen = historia.resumen || historia.descripcion || 'Sin registrar';
        const prestaciones = getHistoriaPrestaciones(historia);
        const titulo = prestaciones === 'Sin registrar' ? 'Atención clínica' : prestaciones;
        const profesional = getHistoriaProfesional(historia);
        const fechaContexto = historia.fecha_atencion || historia.created_at || historia.fecha;
        const fechaCompleta = fechaContexto && !Number.isNaN(new Date(fechaContexto).getTime())
          ? new Date(fechaContexto).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
          : 'Sin registrar';
        return `
          <article class="atenciones-timeline-item">
            <div class="atenciones-timeline-date">
              <strong class="atenciones-timeline-day">${fecha.day}</strong>
              <span>${fecha.month}</span><span>${fecha.year}</span>
              ${fecha.time ? `<span class="atenciones-timeline-time">${fecha.time}</span>` : ''}
            </div>
            <div class="atenciones-timeline-axis" aria-hidden="true"><span></span></div>
            <div class="card border atenciones-timeline-card">
              <div class="card-body">
                <div class="atenciones-mobile-date mb-3"><strong>${fecha.day} ${fecha.month} ${fecha.year}</strong>${fecha.time ? ` · ${fecha.time}` : ''}</div>
                <div class="d-flex justify-content-between align-items-start gap-3 mb-3">
                  <div>
                    <h3 class="h5 mb-1">${escapeHtml(titulo)}</h3>
                    <div class="text-secondary small">Profesional: ${escapeHtml(profesional)}</div>
                  </div>
                  <button class="btn btn-sm btn-outline-primary flex-shrink-0" type="button" data-action="editar-atencion" data-id="${historia.id}">Editar atención</button>
                </div>
                <div class="mb-3"><span class="text-secondary small d-block">Observaciones de la atención</span>${escapeHtml(resumen)}</div>
                <form class="editar-atencion-form border rounded-3 p-3 mb-3 d-none" data-atencion-id="${historia.id}">
                  <div class="row g-3">
                    <div class="col-md-4"><label class="form-label">Fecha</label><input class="form-control" value="${escapeHtml(fechaCompleta)}" readonly /></div>
                    <div class="col-md-4"><label class="form-label">Profesional</label><input class="form-control" value="${escapeHtml(profesional)}" readonly /></div>
                    <div class="col-md-4"><label class="form-label">Prestación</label><input class="form-control" value="${escapeHtml(prestaciones)}" readonly /></div>
                    <div class="col-12"><label class="form-label">Observaciones</label><textarea name="observaciones" class="form-control" rows="4" required>${escapeHtml(historia.descripcion || '')}</textarea></div>
                    <div class="col-12 d-flex justify-content-end gap-2"><button class="btn btn-outline-secondary" type="button" data-action="cancelar-edicion-atencion">Cancelar</button><button class="btn btn-primary" type="submit">Guardar corrección</button></div>
                  </div>
                </form>
                <details data-historia-id="${historia.id}">
                  <summary class="text-primary fw-semibold">Ver detalle</summary>
                  <div class="border-top mt-3 pt-3">${escapeHtml(detalle)}</div>
                  ${historia.odontograma_snapshot
                    ? `<div class="mt-3"><h4 class="h6">Odontograma guardado</h4><div id="historia-odontograma-${historia.id}" class="odontograma-historico border rounded-3 p-2 bg-light-subtle"></div></div>`
                    : '<div class="small text-secondary mt-3">Odontograma histórico: <strong>No disponible</strong></div>'}
                  <div class="border-top mt-3 pt-3">
                    <h4 class="h6">Archivos de esta atención</h4>
                    <form class="atencion-documentos-form row g-2 align-items-end mb-3" data-historia-id="${historia.id}">
                      <div class="col-md-5"><label class="form-label">Descripción</label><input name="descripcion" class="form-control" /></div>
                      <div class="col-md-5"><label class="form-label">Imagen o PDF</label><input name="archivo" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png" required /></div>
                      <div class="col-md-2 d-grid"><button class="btn btn-primary" type="submit">Adjuntar</button></div>
                    </form>
                    <div class="atencion-documentos-grid adjuntos-grid" id="atencion-documentos-${historia.id}"><div class="text-secondary small">Cargando archivos...</div></div>
                  </div>
                </details>
              </div>
            </div>
          </article>`;
      }).join('')}</div>`
    : '<div class="text-center text-secondary border rounded-3 py-5">No hay atenciones clínicas registradas.</div>';

  ui.fichaContent.innerHTML = `
    <div class="card border-0 shadow-sm">
      <div class="card-body p-3 p-lg-4">
        <button id="ficha-volver" class="btn btn-outline-secondary btn-sm mb-3" type="button"><i class="bi bi-arrow-left me-1"></i>Volver a pacientes</button>
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
          <div>
            <h2 class="h3 mb-1">${escapeHtml(paciente.nombre)} ${escapeHtml(paciente.apellido)}</h2>
            <div class="text-secondary">DNI ${escapeHtml(paciente.dni || '-')} · ${edad}</div>
          </div>
          <button id="ficha-editar-paciente" class="btn btn-outline-primary" type="button"><i class="bi bi-pencil-square me-1"></i>Editar datos</button>
        </div>
        <ul class="nav nav-tabs mb-4" role="tablist">
          <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#ficha-datos" type="button">Datos</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#ficha-atenciones" type="button">Historial de atenciones</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#ficha-odontograma" type="button">Odontograma actual</button></li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade show active" id="ficha-datos">
            <div class="row g-3 mb-4">
              <div class="col-12"><h3 class="h5 mb-0">Información personal</h3></div>
              <div class="col-sm-6 col-lg-4"><span class="text-secondary small d-block">Nacionalidad</span>${escapeHtml(formatText(paciente.nacionalidad))}</div>
              <div class="col-sm-6 col-lg-4"><span class="text-secondary small d-block">Fecha de nacimiento</span>${formatDate(paciente.fecha_nacimiento)}</div>
              <div class="col-sm-6 col-lg-4"><span class="text-secondary small d-block">Teléfono</span>${escapeHtml(formatText(paciente.telefono))}</div>
              <div class="col-sm-6 col-lg-4"><span class="text-secondary small d-block">Email</span>${escapeHtml(formatText(paciente.email))}</div>
              <div class="col-12 col-lg-8"><span class="text-secondary small d-block">Domicilio</span>${escapeHtml(formatText(paciente.domicilio))}</div>
            </div>
            <div class="row g-3 mb-4">
              <div class="col-12"><h3 class="h5 mb-0">Información clínica existente</h3></div>
              <div class="col-md-4"><span class="text-secondary small d-block">Alergias</span>${escapeHtml(formatText(paciente.alergias))}</div>
              <div class="col-md-4"><span class="text-secondary small d-block">Condiciones</span>${escapeHtml(formatText(paciente.condiciones))}</div>
              <div class="col-md-4"><span class="text-secondary small d-block">Estado del tratamiento</span>${escapeHtml(formatText(paciente.estado_tratamiento))}</div>
              <div class="col-12"><span class="text-secondary small d-block">Observaciones</span>${escapeHtml(formatText(paciente.observaciones))}</div>
            </div>
            <hr class="my-4" />
            <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
              <h3 class="h5 mb-0">Archivos</h3>
              <button class="btn btn-outline-secondary btn-sm" type="button" id="ficha-documentos-refresh">Actualizar</button>
            </div>
            <form id="ficha-documentos-form" class="row g-2 align-items-end mb-3">
              <div class="col-md-5"><label class="form-label" for="ficha-documentos-descripcion">Descripción</label><input id="ficha-documentos-descripcion" class="form-control" placeholder="Radiografía, receta, etc." /></div>
              <div class="col-md-5"><label class="form-label" for="ficha-documentos-archivo">Archivo</label><input id="ficha-documentos-archivo" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png" required /></div>
              <div class="col-md-2 d-grid"><button class="btn btn-primary" type="submit">Subir</button></div>
            </form>
            <div id="ficha-documentos-grid" class="adjuntos-grid"></div>
            <small class="text-secondary d-block mt-2">Tipos permitidos: PDF, JPG, PNG. Máximo 10 MB.</small>
          </div>
          <div class="tab-pane fade" id="ficha-atenciones">
            <div class="d-flex justify-content-end mb-3">
              <button id="registrar-atencion-toggle" class="btn btn-primary" type="button" ${turnosAtencion.length ? '' : 'disabled'}>
                <i class="bi bi-plus-lg me-1"></i>Registrar atención
              </button>
            </div>
            ${turnosAtencion.length ? `
              <form id="registrar-atencion-form" class="card border mb-4 d-none">
                <div class="card-body">
                  <h3 class="h5">Registrar atención realizada</h3>
                  <div class="row g-3">
                    <div class="col-12"><label class="form-label" for="atencion-turno">Turno realizado</label><select id="atencion-turno" name="turno_id" class="form-select" required><option value="">Seleccionar turno</option>${turnosAtencion.map((turno) => `<option value="${turno.id}" data-fecha="${escapeHtml(turno.fecha_hora_inicio || '')}" data-profesional="${escapeHtml(turno.profesional_nombre || 'Sin registrar')}" data-prestacion="${escapeHtml(turno.prestacion_nombre || 'Sin registrar')}">${formatDate(turno.fecha_hora_inicio)} · ${escapeHtml(turno.prestacion_nombre || 'Sin registrar')}</option>`).join('')}</select></div>
                    <div class="col-md-4"><label class="form-label">Fecha</label><input id="atencion-fecha" class="form-control" readonly value="Sin registrar" /></div>
                    <div class="col-md-4"><label class="form-label">Profesional</label><input id="atencion-profesional" class="form-control" readonly value="Sin registrar" /></div>
                    <div class="col-md-4"><label class="form-label">Prestación</label><input id="atencion-prestacion" class="form-control" readonly value="Sin registrar" /></div>
                    <div class="col-12"><label class="form-label" for="atencion-observaciones">Observaciones de la atención</label><textarea id="atencion-observaciones" name="observaciones" class="form-control" rows="4" required></textarea></div>
                    <div class="col-12 d-flex justify-content-end gap-2"><button id="registrar-atencion-cancelar" class="btn btn-outline-secondary" type="button">Cancelar</button><button class="btn btn-primary" type="submit">Guardar atención</button></div>
                  </div>
                </div>
              </form>` : '<p class="text-secondary text-end small">No hay turnos realizados pendientes de registrar.</p>'}
            ${historiasHtml}
          </div>
          <div class="tab-pane fade" id="ficha-odontograma">
            <div class="border rounded-3 p-4">
              <h3 class="h5">Odontograma actual</h3>
              <p class="text-secondary">Consultá y guardá el estado odontológico vigente con el editor existente.</p>
              <button id="ficha-abrir-odontograma" class="btn btn-primary" type="button"><i class="bi bi-grid-3x3-gap me-1"></i>Abrir editor de odontograma</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('ficha-volver')?.addEventListener('click', closeFicha);
  document.getElementById('ficha-editar-paciente')?.addEventListener('click', () => openEditModal(paciente));
  document.getElementById('ficha-abrir-odontograma')?.addEventListener('click', async () => {
    odontoModal?.show();
    try {
      await loadOdontograma(paciente.id);
    } catch (error) {
      odontoModal?.hide();
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
  bindFichaDocumentos();
  cargarDocumentosFicha();
  bindAtencionDocumentos(historias);
  bindRegistroAtencion();
  bindEdicionAtenciones();
  historias.forEach((historia) => {
    if (historia.odontograma_snapshot) renderOdontogramaHistorico(historia.id, historia.odontograma_snapshot);
  });
}

function bindRegistroAtencion() {
  const toggle = document.getElementById('registrar-atencion-toggle');
  const form = document.getElementById('registrar-atencion-form');
  const select = document.getElementById('atencion-turno');
  toggle?.addEventListener('click', () => form?.classList.remove('d-none'));
  document.getElementById('registrar-atencion-cancelar')?.addEventListener('click', () => form?.classList.add('d-none'));
  select?.addEventListener('change', () => {
    const option = select.selectedOptions[0];
    const fecha = option?.dataset.fecha ? new Date(option.dataset.fecha) : null;
    document.getElementById('atencion-fecha').value = fecha && !Number.isNaN(fecha.getTime())
      ? fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Sin registrar';
    document.getElementById('atencion-profesional').value = option?.dataset.profesional || 'Sin registrar';
    document.getElementById('atencion-prestacion').value = option?.dataset.prestacion || 'Sin registrar';
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await createAtencion(state.ficha.pacienteId, {
        turno_id: form.elements.turno_id.value,
        observaciones: form.elements.observaciones.value.trim(),
      });
      renderAlert(ui.alertContainer, 'Atención registrada con su odontograma histórico.', 'success');
      await loadFichaClinica();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
      submit.disabled = false;
    }
  });
}

function bindEdicionAtenciones() {
  ui.fichaContent.querySelectorAll('button[data-action="editar-atencion"]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = ui.fichaContent.querySelector(`.editar-atencion-form[data-atencion-id="${button.dataset.id}"]`);
      form?.classList.remove('d-none');
      form?.elements.observaciones?.focus();
    });
  });
  ui.fichaContent.querySelectorAll('button[data-action="cancelar-edicion-atencion"]').forEach((button) => {
    button.addEventListener('click', () => button.closest('.editar-atencion-form')?.classList.add('d-none'));
  });
  ui.fichaContent.querySelectorAll('.editar-atencion-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        await updateAtencion(state.ficha.pacienteId, form.dataset.atencionId, {
          observaciones: form.elements.observaciones.value.trim(),
        });
        renderAlert(ui.alertContainer, 'Atención corregida correctamente.', 'success');
        await loadFichaClinica();
      } catch (error) {
        renderAlert(ui.alertContainer, error.message, 'danger');
        submit.disabled = false;
      }
    });
  });
}

function renderOdontogramaHistorico(historiaId, rawSnapshot) {
  const container = document.getElementById(`historia-odontograma-${historiaId}`);
  if (!container) return;
  const snapshot = typeof rawSnapshot === 'string' ? JSON.parse(rawSnapshot) : rawSnapshot;
  const registros = Array.isArray(snapshot?.registros) ? snapshot.registros : [];
  const colores = snapshot?.colores || estados;
  const registroMap = new Map(registros.map((r) => [`${r.diente}-${r.cara}`, r]));
  const tieneTemporales = registros.some((r) => Number(r.diente) >= 50);
  const dientes = tieneTemporales
    ? [...temporales.superior, ...temporales.inferior]
    : [...permanentes.superior, ...permanentes.inferior];
  const porFila = dientes.length / 2;
  const size = 34;
  const gap = 8;
  const width = porFila * (size + gap) + 20;
  const svg = createSvgEl('svg', { viewBox: `0 0 ${width} 115`, class: 'odontograma-historico-svg', role: 'img', 'aria-label': 'Odontograma histórico de solo lectura' });
  dientes.forEach((diente, index) => {
    const row = index < porFila ? 0 : 1;
    const column = index % porFila;
    const x = 10 + column * (size + gap);
    const y = row === 0 ? 8 : 67;
    FACES.forEach((cara) => {
      const registro = registroMap.get(`${diente}-${cara}`);
      const estado = registro?.estado || 'sin_informacion_registrada';
      const polygon = createSvgEl('polygon', {
        points: pointsToAbsolute(FACE_POLYGONS[cara], x, y, size),
        fill: registro?.color || colores[estado] || '#d1d5db',
        stroke: '#6c757d',
        'stroke-width': 0.5,
        ...(registro ? {} : { 'stroke-dasharray': '2 1' }),
      });
      if (!registro) {
        const title = createSvgEl('title');
        title.textContent = 'Sin información registrada';
        polygon.appendChild(title);
      }
      svg.appendChild(polygon);
    });
    if (FACES.every((cara) => registroMap.get(`${diente}-${cara}`)?.estado === 'corona_completa')) {
      svg.appendChild(createSvgEl('rect', {
        x: x + 1.5,
        y: y + 1.5,
        width: size - 3,
        height: size - 3,
        rx: 5,
        fill: 'none',
        stroke: '#92400e',
        'stroke-width': 2.5,
      }));
    }
    const label = createSvgEl('text', { x: x + size / 2, y: y + size + 9, 'text-anchor': 'middle', 'font-size': 7 });
    label.textContent = String(diente);
    svg.appendChild(label);
  });
  container.innerHTML = '';
  const referenciasHistoricas = [...new Map(registros.map((registro) => {
    const catalogada = snapshot?.referencias_catalogo?.[registro.estado];
    return [registro.estado, {
      nombre: registro.nombre || catalogada?.nombre || registro.estado,
      color: registro.color || catalogada?.color || colores[registro.estado] || '#ffffff',
    }];
  })).values()];
  if (dientes.some((diente) => FACES.some((cara) => !registroMap.has(`${diente}-${cara}`)))) {
    referenciasHistoricas.push({ nombre: 'Sin información registrada', color: '#d1d5db' });
  }
  if (referenciasHistoricas.length) {
    const legend = document.createElement('div');
    legend.className = 'd-flex flex-wrap gap-2 mb-2';
    legend.innerHTML = referenciasHistoricas.map((ref) => `<span class="badge border text-dark" style="background:${ref.color}">${escapeHtml(ref.nombre)}</span>`).join('');
    container.appendChild(legend);
  }
  container.appendChild(svg);
  const meta = snapshot?.meta || {};
  const referencias = snapshot?.referencias || {};
  const info = document.createElement('div');
  info.className = 'small text-secondary mt-2';
  info.textContent = `Sarro: ${meta.sarro ? 'Sí' : 'No'} · Periodontal: ${meta.periodontal ? 'Sí' : 'No'} · Observaciones: ${meta.observaciones || 'Sin registrar'} · Referencias: ${(referencias.tratamientos || []).length} tratamientos, ${(referencias.protesis_fijas || []).length} prótesis fijas, ${(referencias.protesis_removibles || []).length} prótesis removibles`;
  container.appendChild(info);
}

function renderDocumentosAtencion(historiaId, documentos = []) {
  const grid = document.getElementById(`atencion-documentos-${historiaId}`);
  if (!grid) return;
  if (!documentos.length) {
    grid.innerHTML = '<div class="text-secondary small">Sin archivos adjuntos.</div>';
    return;
  }
  grid.innerHTML = documentos.map((doc) => `
    <article class="card h-100 border adjunto-card">
        <div class="card-body d-flex flex-column pb-2">
          <h5 class="h6 text-break mb-1">${escapeHtml(doc.descripcion || doc.nombre_archivo)}</h5>
          ${doc.descripcion && doc.descripcion !== doc.nombre_archivo ? `<p class="small text-secondary text-break mb-2">${escapeHtml(doc.nombre_archivo)}</p>` : ''}
        </div>
        <div class="adjunto-miniatura bg-light border-top border-bottom overflow-hidden" id="documento-miniatura-${doc.id}"><div class="d-flex h-100 align-items-center justify-content-center text-secondary">Cargando vista previa...</div></div>
        <div class="card-body d-flex flex-column pt-2">
          <div class="d-flex flex-wrap gap-2 mt-auto">
            <button class="btn btn-sm btn-outline-primary" type="button" data-action="preview-doc" data-id="${doc.id}" data-name="${escapeHtml(doc.nombre_archivo)}" data-type="${escapeHtml(doc.tipo_archivo)}">${doc.tipo_archivo === 'application/pdf' ? 'Ver PDF' : 'Ampliar'}</button>
            <button class="btn btn-sm btn-outline-secondary" type="button" data-action="download-doc" data-id="${doc.id}">Descargar</button>
            <button class="btn btn-sm btn-outline-danger" type="button" data-action="delete-doc" data-id="${doc.id}" data-name="${escapeHtml(doc.nombre_archivo)}">Eliminar</button>
          </div>
        </div>
    </article>`).join('');
  documentos.forEach((doc) => hydrateDocumentoMiniatura(doc));
}

async function cargarDocumentosAtencion(historiaId) {
  try {
    const data = await getDocumentos(state.ficha.pacienteId, historiaId);
    renderDocumentosAtencion(historiaId, data.documentos || []);
  } catch (error) {
    const grid = document.getElementById(`atencion-documentos-${historiaId}`);
    if (grid) grid.innerHTML = `<div class="text-danger small">${escapeHtml(error.message)}</div>`;
  }
}

async function mostrarDocumento(button) {
  const doc = { id: button.dataset.id, nombre_archivo: button.dataset.name, tipo_archivo: button.dataset.type };
  const url = await getDocumentoObjectUrl(doc);
  const isPdf = String(doc.tipo_archivo).toLowerCase() === 'application/pdf';
  ui.documentoPreviewLabel.textContent = doc.nombre_archivo || 'Vista previa';
  ui.documentoPreviewContent.innerHTML = isPdf
    ? `<iframe src="${url}" title="Vista previa de ${escapeHtml(doc.nombre_archivo)}" class="w-100 border-0" style="height:75vh"></iframe>`
    : `<img src="${url}" alt="${escapeHtml(doc.nombre_archivo)}" class="img-fluid d-block mx-auto" style="max-height:75vh" />`;
  documentoPreviewModal?.show();
}

function bindAtencionDocumentos(historias) {
  historias.forEach((historia) => cargarDocumentosAtencion(historia.id));
  document.querySelectorAll('.atencion-documentos-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const historiaId = form.dataset.historiaId;
      const archivo = form.elements.archivo?.files?.[0];
      if (!archivo) return;
      const formData = new FormData();
      formData.append('paciente_id', String(state.ficha.pacienteId));
      formData.append('historia_clinica_id', historiaId);
      formData.append('descripcion', form.elements.descripcion?.value?.trim() || '');
      formData.append('archivo', archivo);
      try {
        await uploadDocumento(formData);
        form.reset();
        await cargarDocumentosAtencion(historiaId);
        renderAlert(ui.alertContainer, 'Archivo adjuntado a la atención.', 'success');
      } catch (error) {
        renderAlert(ui.alertContainer, error.message, 'danger');
      }
    });
  });
  document.querySelectorAll('.atencion-documentos-grid').forEach((grid) => {
    grid.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      try {
        if (button.dataset.action === 'preview-doc') await mostrarDocumento(button);
        if (button.dataset.action === 'download-doc') await downloadDocumento(button.dataset.id);
        if (button.dataset.action === 'delete-doc') {
          const nombre = button.dataset.name || 'este archivo';
          if (!window.confirm(`¿Eliminar "${nombre}"? Esta acción no elimina la atención ni otros archivos.`)) return;
          await deleteDocumento(button.dataset.id);
          await cargarDocumentosAtencion(grid.id.replace('atencion-documentos-', ''));
          renderAlert(ui.alertContainer, 'Archivo eliminado.', 'success');
        }
      } catch (error) {
        renderAlert(ui.alertContainer, error.message, 'danger');
      }
    });
  });
}

function renderDocumentosFicha(documentos = []) {
  const grid = document.getElementById('ficha-documentos-grid');
  if (!grid) return;

  if (!documentos.length) {
    grid.innerHTML = '<div class="text-center text-secondary border rounded-3 py-4">Sin archivos</div>';
    return;
  }

  grid.innerHTML = documentos
    .map((doc) => `
          <article class="card h-100 border adjunto-card">
            <div class="card-body d-flex flex-column pb-2">
              <h4 class="h6 text-break mb-1">${escapeHtml(doc.descripcion || doc.nombre_archivo)}</h4>
              ${doc.descripcion && doc.descripcion !== doc.nombre_archivo ? `<p class="small text-secondary text-break mb-0">${escapeHtml(doc.nombre_archivo)}</p>` : ''}
            </div>
            <div class="adjunto-miniatura bg-light border-top border-bottom d-flex align-items-center justify-content-center overflow-hidden" id="documento-miniatura-${doc.id}">
              <div class="d-flex h-100 align-items-center justify-content-center text-secondary"><span>Cargando vista previa...</span></div>
            </div>
            <div class="card-body d-flex flex-column pt-2">
              <p class="small text-secondary">${formatDate(doc.fecha_subida)}</p>
              <div class="d-flex flex-wrap gap-2 mt-auto">
                <button class="btn btn-sm btn-outline-primary" type="button" data-action="preview-doc" data-id="${doc.id}" data-name="${escapeHtml(doc.nombre_archivo)}" data-type="${escapeHtml(doc.tipo_archivo)}">${doc.tipo_archivo === 'application/pdf' ? 'Ver PDF' : 'Ampliar'}</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" data-action="download-doc" data-id="${doc.id}">Descargar</button>
                <button class="btn btn-sm btn-outline-danger" type="button" data-action="delete-doc" data-id="${doc.id}" data-name="${escapeHtml(doc.nombre_archivo)}">Eliminar</button>
              </div>
            </div>
          </article>
      `)
    .join('');

  documentos.forEach((doc) => hydrateDocumentoMiniatura(doc));
}

async function getDocumentoObjectUrl(doc) {
  const cached = state.ficha.documentoUrls.get(String(doc.id));
  if (cached) return cached;
  const { blob } = await getDocumentoPreview(doc.id);
  const url = URL.createObjectURL(blob);
  state.ficha.documentoUrls.set(String(doc.id), url);
  return url;
}

async function hydrateDocumentoMiniatura(doc) {
  const container = document.getElementById(`documento-miniatura-${doc.id}`);
  if (!container) return;
  const tipo = String(doc.tipo_archivo || '').toLowerCase();
  if (tipo === 'application/pdf') {
    container.innerHTML = '<div class="d-flex h-100 flex-column align-items-center justify-content-center text-danger"><i class="bi bi-file-earmark-pdf fs-1"></i><span class="small">PDF</span></div>';
    return;
  }
  if (!tipo.startsWith('image/')) {
    container.innerHTML = '<div class="d-flex h-100 align-items-center justify-content-center text-secondary"><i class="bi bi-file-earmark fs-1"></i></div>';
    return;
  }
  try {
    const url = await getDocumentoObjectUrl(doc);
    if (container.isConnected) container.innerHTML = `<img src="${url}" class="w-100 h-100 object-fit-contain" alt="Vista previa de ${escapeHtml(doc.nombre_archivo)}" />`;
  } catch (_) {
    if (container.isConnected) container.innerHTML = '<span class="small text-secondary">Vista previa no disponible</span>';
  }
}

async function cargarDocumentosFicha() {
  const pacienteId = state.ficha.pacienteId;
  if (!pacienteId) return;

  try {
    state.ficha.documentoUrls.forEach((url) => URL.revokeObjectURL(url));
    state.ficha.documentoUrls.clear();
    const data = await getDocumentos(pacienteId);
    renderDocumentosFicha(data.documentos || []);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function bindFichaDocumentos() {
  const form = document.getElementById('ficha-documentos-form');
  const descripcionInput = document.getElementById('ficha-documentos-descripcion');
  const archivoInput = document.getElementById('ficha-documentos-archivo');
  const refreshButton = document.getElementById('ficha-documentos-refresh');
  const grid = document.getElementById('ficha-documentos-grid');

  refreshButton?.addEventListener('click', async () => {
    await cargarDocumentosFicha();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.ficha.pacienteId) return;

    const archivo = archivoInput?.files?.[0];
    if (!archivo) {
      renderAlert(ui.alertContainer, 'Seleccione un archivo.', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('paciente_id', String(state.ficha.pacienteId));
    formData.append('descripcion', descripcionInput?.value?.trim() || '');
    formData.append('archivo', archivo);

    try {
      const response = await uploadDocumento(formData);
      renderAlert(ui.alertContainer, response.mensaje || 'Documento subido.', 'success');
      if (descripcionInput) descripcionInput.value = '';
      if (archivoInput) archivoInput.value = '';
      await cargarDocumentosFicha();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });

  grid?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const id = button.dataset.id;
    if (!id) return;

    if (button.dataset.action === 'preview-doc') {
      try {
        const doc = { id, nombre_archivo: button.dataset.name, tipo_archivo: button.dataset.type };
        const url = await getDocumentoObjectUrl(doc);
        const isPdf = String(doc.tipo_archivo).toLowerCase() === 'application/pdf';
        ui.documentoPreviewLabel.textContent = doc.nombre_archivo || 'Vista previa';
        ui.documentoPreviewContent.innerHTML = isPdf
          ? `<iframe src="${url}" title="Vista previa de ${escapeHtml(doc.nombre_archivo)}" class="w-100 border-0" style="height:75vh"></iframe>`
          : `<img src="${url}" alt="${escapeHtml(doc.nombre_archivo)}" class="img-fluid d-block mx-auto" style="max-height:75vh" />`;
        documentoPreviewModal?.show();
      } catch (error) {
        renderAlert(ui.alertContainer, error.message, 'danger');
      }
      return;
    }

    if (button.dataset.action === 'download-doc') {
      try {
        await downloadDocumento(id);
      } catch (error) {
        renderAlert(ui.alertContainer, error.message, 'danger');
      }
      return;
    }

    if (button.dataset.action !== 'delete-doc') return;

    try {
      const nombre = button.dataset.name || 'este archivo';
      if (!window.confirm(`¿Eliminar "${nombre}"? Esta acción no elimina otros archivos.`)) return;
      await deleteDocumento(id);
      renderAlert(ui.alertContainer, 'Documento eliminado.', 'success');
      await cargarDocumentosFicha();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function pointsToAbsolute(points, x, y, size) {
  return points
    .split(' ')
    .map((p) => {
      const [px, py] = p.split(',').map(Number);
      return `${x + (px / 100) * size},${y + (py / 100) * size}`;
    })
    .join(' ');
}

function getRecordState(toothNumber, face) {
  const key = `${toothNumber}-${face}`;
  return state.odontograma.registros.get(key) || 'sin_evaluar';
}

function getReferencia(codigo) {
  return state.odontograma.referencias.get(codigo) || { codigo, nombre: codigo, color: estados[codigo] || '#ffffff', alcance: 'cara', activo: false };
}

function renderReferenciasOdontograma(referencias) {
  const sinEvaluar = { codigo: 'sin_evaluar', nombre: 'Sin evaluar', color: estados.sin_evaluar, alcance: 'cara', activo: false, sistema: true };
  state.odontograma.referencias = new Map([sinEvaluar, ...referencias].map((ref) => [ref.codigo, ref]));
  const activas = referencias.filter((ref) => ref.activo);
  ui.odontoEstadoClinico.innerHTML = activas.map((ref) => `<option value="${escapeHtml(ref.codigo)}">${escapeHtml(ref.nombre)}</option>`).join('');
  ui.odontoLegend.innerHTML = [sinEvaluar, ...referencias].map((ref) => `<span class="badge border text-dark" style="background:${ref.color}">${escapeHtml(ref.nombre)}${ref.sistema || ref.activo ? '' : ' (inactiva)'}${ref.codigo === 'corona_completa' ? ' ◯' : ''}</span>`).join(' ');
}

function paintFace(toothNumber, face, estado) {
  const key = `${toothNumber}-${face}`;
  state.odontograma.registros.set(key, estado);
  state.odontograma.dirtyKeys.add(key);

  const selector = `.odonto-face[data-tooth="${toothNumber}"][data-face="${face}"]`;
  const el = ui.odontoSvg?.querySelector(selector);
  if (el) {
    el.classList.remove(...Object.keys(estados).map((s) => `state-${s}`));
    el.classList.add(`state-${estado}`);
  el.style.fill = getReferencia(estado).color;
  }
}

function toothHasState(toothNumber, codigo) {
  return FACES.every((face) => getRecordState(toothNumber, face) === codigo);
}

function countLegacyProstheticMarks() {
  const teeth = new Set();
  state.odontograma.registros.forEach((codigo, key) => {
    if (codigo === 'protesis_fija' || codigo === 'protesis_removible') teeth.add(key.split('-')[0]);
  });
  return teeth.size;
}

function updateProsthesisCounts() {
  if (ui.odontoCountProtesisFijas) ui.odontoCountProtesisFijas.textContent = String(state.odontograma.protesisFijas.length);
  if (ui.odontoCountProtesisRemovibles) ui.odontoCountProtesisRemovibles.textContent = String(state.odontograma.protesisRemovibles.length);
  if (ui.odontoCountMarcasHeredadas) ui.odontoCountMarcasHeredadas.textContent = String(countLegacyProstheticMarks());
}

function toothHasOnlyAusente(toothNumber) {
  return FACES.every((face) => ['ausente', 'pieza_ausente'].includes(getRecordState(toothNumber, face)));
}

function buildTooltipText(toothNumber) {
  const estados = FACES.map((f) => `${f}: ${getRecordState(toothNumber, f)}`).join(' | ');
  const heredada = FACES.some((face) => ['protesis_fija', 'protesis_removible'].includes(getRecordState(toothNumber, face)))
    ? '\nMarca heredada sin detalle protésico'
    : '';
  return `Pieza ${toothNumber}\n${estados}${heredada}`;
}

function renderToothDetails() {
  if (!ui.odontoDetails) return;
  const tooth = state.odontograma.selectedTooth;
  if (!tooth) {
    ui.odontoDetails.textContent = 'Seleccione un diente para ver detalles.';
    return;
  }
  const estadosCaras = FACES.map((f) => `${f}: ${getRecordState(tooth, f)}`).join(' | ');
  const rows = [
    `Pieza ${tooth}`,
    estadosCaras,
    `Sarro: ${ui.odontoSarro?.checked ? 'Sí' : 'No'} | Periodontal: ${ui.odontoPeriodontal?.checked ? 'Sí' : 'No'}`,
  ];
  if (FACES.some((face) => ['protesis_fija', 'protesis_removible'].includes(getRecordState(tooth, face)))) {
    rows.push('Marca heredada sin detalle protésico');
  }
  ui.odontoDetails.textContent = rows.join(' · ');
}

function updateCountExistentes() {
  const mode = ui.odontoDenticion?.value || 'permanente';
  const base =
    mode === 'temporal'
      ? [...temporales.superior, ...temporales.inferior]
      : mode === 'mixta'
        ? [...permanentes.superior, ...permanentes.inferior, ...temporales.superior, ...temporales.inferior]
        : [...permanentes.superior, ...permanentes.inferior];
  const count = base.filter((t) => !toothHasOnlyAusente(t)).length;
  if (ui.odontoCount) ui.odontoCount.textContent = String(count);
}

function createToothSVG(toothNumber, x = 0, y = 0, size = 38) {
  const group = createSvgEl('g', { id: `tooth-${toothNumber}` });

  const outline = createSvgEl('rect', {
    x,
    y,
    width: size,
    height: size,
    class: `odonto-tooth-outline ${state.odontograma.selectedTooth === toothNumber ? 'active' : ''}`,
  });
  group.appendChild(outline);

  FACES.forEach((face) => {
    const estado = getRecordState(toothNumber, face);
    const polygon = createSvgEl('polygon', {
      points: pointsToAbsolute(FACE_POLYGONS[face], x, y, size),
      class: `odonto-face state-${estado}`,
      fill: getReferencia(estado).color,
      style: `fill:${getReferencia(estado).color}`,
      'data-tooth': toothNumber,
      'data-face': face,
    });
    group.appendChild(polygon);
  });

  if (toothHasOnlyAusente(toothNumber)) {
    const line1 = createSvgEl('line', {
      x1: x + 2,
      y1: y + 2,
      x2: x + size - 2,
      y2: y + size - 2,
      stroke: '#000',
      'stroke-width': 1.5,
    });
    const line2 = createSvgEl('line', {
      x1: x + size - 2,
      y1: y + 2,
      x2: x + 2,
      y2: y + size - 2,
      stroke: '#000',
      'stroke-width': 1.5,
    });
    group.appendChild(line1);
    group.appendChild(line2);
  }

  if (toothHasState(toothNumber, 'corona_completa')) {
    group.appendChild(createSvgEl('rect', {
      x: x + 1.5,
      y: y + 1.5,
      width: size - 3,
      height: size - 3,
      rx: 5,
      class: 'odonto-corona-completa',
    }));
  }

  const text = createSvgEl('text', {
    x: x + size / 2,
    y: y + size + 10,
    class: 'odonto-tooth-label',
  });
  text.textContent = String(toothNumber);
  group.appendChild(text);

  // Badges visuales: tratamientos count y prótesis fija
  // Tooltip/title info
  const title = createSvgEl('title');
  title.textContent = buildTooltipText(toothNumber);
  group.appendChild(title);

  return group;
}

function drawRow(svg, teeth, startX, y, toothSize, gap, separatorAfter = null) {
  teeth.forEach((tooth, idx) => {
    const x = startX + idx * (toothSize + gap);
    svg.appendChild(createToothSVG(tooth, x, y, toothSize));

    if (separatorAfter !== null && idx === separatorAfter) {
      const sx = x + toothSize + gap / 2;
      svg.appendChild(
        createSvgEl('line', {
          x1: sx,
          y1: y - 8,
          x2: sx,
          y2: y + toothSize + 12,
          class: 'odonto-separator',
        }),
      );
    }
  });
}

function addLabel(svg, text, x, y) {
  const label = createSvgEl('text', { x, y, class: 'odonto-section-label' });
  label.textContent = text;
  svg.appendChild(label);
}

function renderOdontograma() {
  if (!ui.odontoSvg) return;

  ui.odontoSvg.innerHTML = '';
  ui.odontoSvg.setAttribute('viewBox', '0 0 980 600');

  const toothSize = 38;
  const gap = 12;

  const mode = ui.odontoDenticion?.value || 'permanente';
  if (mode === 'permanente' || mode === 'mixta') {
    addLabel(ui.odontoSvg, 'Denticion permanente', 20, 20);
    drawRow(ui.odontoSvg, permanentes.superior, 20, 30, toothSize, gap, 7);
    drawRow(ui.odontoSvg, permanentes.inferior, 20, 112, toothSize, gap, 7);
  }
  if (mode === 'temporal' || mode === 'mixta') {
    addLabel(ui.odontoSvg, 'Denticion temporal', 112, 260);
    drawRow(ui.odontoSvg, temporales.superior, 112, 274, toothSize, gap, 4);
    drawRow(ui.odontoSvg, temporales.inferior, 112, 356, toothSize, gap, 4);
  }

}

function handleToothFaceClick(toothNumber, face) {
  const estadoSeleccionado = ui.odontoEstadoClinico.value || 'sano';
  state.odontograma.selectedTooth = Number(toothNumber);
  ui.odontoSelectedPiece.textContent = String(toothNumber);
  ui.odontoSaveBtn.disabled = false;

  const affectAll = getReferencia(estadoSeleccionado).alcance === 'pieza';

  if (affectAll) {
    FACES.forEach((f) => paintFace(toothNumber, f, estadoSeleccionado));
  } else {
    paintFace(toothNumber, face, estadoSeleccionado);
  }

  renderOdontograma();
  updateCountExistentes();
  renderToothDetails();
}

window.handleToothFaceClick = handleToothFaceClick;

async function loadOdontograma(pacienteId) {
  state.odontograma.pacienteId = Number(pacienteId);
  state.odontograma.selectedTooth = null;
  state.odontograma.registros.clear();
  state.odontograma.dirtyKeys.clear();
  ui.odontoSelectedPiece.textContent = '-';
  ui.odontoSaveBtn.disabled = true;
  ui.odontoObservaciones.value = '';
  state.odontograma.metaDirty = false;
  ui.odontoModalLabel.textContent = 'Cargando odontograma...';

  const [data, referenciasData, fijasData, removiblesData] = await Promise.all([
    getOdontogramaPaciente(pacienteId),
    getOdontogramaReferencias(pacienteId),
    getProtesisFijas(pacienteId),
    getProtesisRemovibles(pacienteId),
  ]);
  renderReferenciasOdontograma(referenciasData.referencias || []);
  const paciente = data.paciente || {};
  ui.odontoModalLabel.textContent = `${paciente.apellido || ''}, ${paciente.nombre || ''} - DNI ${paciente.dni || '-'}`;

  (data.registros || []).forEach((r) => {
    state.odontograma.registros.set(`${r.diente}-${r.cara}`, r.estado);
  });

  state.odontograma.tratamientosByTooth = new Map();
  state.odontograma.protesisFijas = fijasData.protesis || [];
  state.odontograma.protesisRemovibles = removiblesData.protesis || [];

  if (data.meta) {
    ui.odontoSarro.checked = Boolean(data.meta.sarro);
    ui.odontoPeriodontal.checked = Boolean(data.meta.periodontal);
    ui.odontoObservaciones.value = data.meta.observaciones || '';
  } else {
    ui.odontoSarro.checked = false;
    ui.odontoPeriodontal.checked = false;
    ui.odontoObservaciones.value = '';
  }
  state.odontograma.metaDirty = false;

  renderOdontograma();
  updateCountExistentes();
  updateProsthesisCounts();
  renderToothDetails();
}

async function guardarToothSeleccionado() {
  const pacienteId = state.odontograma.pacienteId;
  if (!pacienteId) {
    renderAlert(ui.alertContainer, 'Seleccione un paciente.', 'warning');
    return;
  }

  const metaPayload = {
    paciente_id: pacienteId,
    sarro: ui.odontoSarro.checked,
    periodontal: ui.odontoPeriodontal.checked,
    observaciones: ui.odontoObservaciones.value?.trim() || null,
  };

  // Si sólo se modificó meta
  if (state.odontograma.metaDirty && state.odontograma.selectedTooth === null) {
    await postOdontograma(metaPayload);
    state.odontograma.metaDirty = false;
    renderAlert(ui.alertContainer, 'Metadatos guardados.', 'success');
    return;
  }

  const dirtyKeys = [...state.odontograma.dirtyKeys];
  if (dirtyKeys.length === 0 && !state.odontograma.metaDirty) {
    renderAlert(ui.alertContainer, 'No hay cambios de odontograma para guardar.', 'warning');
    return;
  }

  const payloads = buildOdontogramaChangePayloads({ pacienteId, registros: state.odontograma.registros, dirtyKeys });
  const requests = payloads.map((payload) => postOdontograma(payload));

  await Promise.all(requests);
  if (state.odontograma.metaDirty) await postOdontograma(metaPayload);
  dirtyKeys.forEach((key) => state.odontograma.dirtyKeys.delete(key));
  state.odontograma.metaDirty = false;
  renderAlert(ui.alertContainer, 'Odontograma guardado correctamente.', 'success');
  updateCountExistentes();
  updateProsthesisCounts();
}

function bindOdontograma() {
  document.addEventListener('click', (event) => {
    const faceEl = event.target.closest('.odonto-face');
    if (!faceEl) return;

    const toothNumber = faceEl.getAttribute('data-tooth');
    const face = faceEl.getAttribute('data-face');
    if (!toothNumber || !face) return;

    handleToothFaceClick(toothNumber, face);
  });

  ui.odontoDenticion?.addEventListener('change', () => {
    renderOdontograma();
    updateCountExistentes();
    renderToothDetails();
  });

  ui.odontoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await guardarToothSeleccionado();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });

  ui.odontoSarro?.addEventListener('change', () => {
    state.odontograma.metaDirty = true;
  });
  ui.odontoPeriodontal?.addEventListener('change', () => {
    state.odontograma.metaDirty = true;
  });
  ui.odontoObservaciones?.addEventListener('input', () => {
    state.odontograma.metaDirty = true;
  });

  ui.odontoExportPdf?.addEventListener('click', () => {
    const now = new Date().toLocaleString('es-AR');
    const dent = ui.odontoDenticion?.value || 'permanente';
    const sarro = ui.odontoSarro.checked ? 'Sí' : 'No';
    const perio = ui.odontoPeriodontal.checked ? 'Sí' : 'No';
    const obs = ui.odontoObservaciones.value?.trim() || 'Sin observaciones';
    const fijas = state.odontograma.protesisFijas.length;
    const removibles = state.odontograma.protesisRemovibles.length;
    const marcasHeredadas = countLegacyProstheticMarks();
    const legend = `<ul class="legend">${[...state.odontograma.referencias.values()].map((ref) => `<li><span class="swatch" style="background:${ref.color}"></span>${escapeHtml(ref.nombre)}${ref.activo ? '' : ' (inactiva)'}</li>`).join('')}</ul>`;
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Odontograma</title>
<style>
*{box-sizing:border-box;}
body{font-family:Arial,sans-serif;margin:24px;color:#0f172a;}
h1,h2,h3{margin:0 0 8px 0;}
.meta{margin:4px 0;font-size:12px;color:#334155;}
.legend{list-style:none;padding:0;margin:12px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px;}
.legend li{display:flex;align-items:center;gap:8px;font-size:12px;}
.swatch{width:18px;height:12px;border:1px solid #cbd5e1;display:inline-block;}
.swatch.sano{background:#ffffff;}
.swatch.existente{background:#ff4d4d;}
.swatch.requerido{background:#4d79ff;}
.swatch.corona{background:#ffcc00;}
.swatch.fija{background:#cbd5ff;}
.swatch.removible{background:#9dd6c8;}
.swatch.ausente{background:#4b5563;}
.block{margin-bottom:16px;}
.svg-wrap{border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc;}
svg{width:100%;height:auto;}
.odonto-face{stroke:#334155;stroke-width:0.9;}
.odonto-face.state-sano{fill:#ffffff;}
.odonto-face.state-existente{fill:#ff4d4d;}
.odonto-face.state-requerido{fill:#4d79ff;}
.odonto-face.state-corona{fill:#ffcc00;}
.odonto-face.state-protesis_fija{fill:#cbd5ff;}
.odonto-face.state-protesis_removible{fill:#9dd6c8;}
.odonto-face.state-ausente{fill:#4b5563;}
.odonto-tooth-outline{fill:none;stroke:#475569;stroke-width:0.9;}
.odonto-tooth-outline.active{stroke:#1c3f5f;stroke-width:1.8;}
.odonto-tooth-label{font-size:8px;font-weight:600;fill:#0f172a;text-anchor:middle;dominant-baseline:middle;}
@page { size: A4; margin: 16mm; }
</style></head><body>
<h2>Odontograma</h2>
<div class="meta"><strong>Paciente:</strong> ${ui.odontoModalLabel.textContent}</div>
<div class="meta"><strong>Fecha generación:</strong> ${now}</div>
<div class="meta"><strong>Dentición:</strong> ${dent}</div>
<div class="meta"><strong>Sarro:</strong> ${sarro} | <strong>Periodontal:</strong> ${perio}</div>
<div class="meta"><strong>Observaciones:</strong> ${obs}</div>
<div class="meta"><strong>Prótesis registradas:</strong> ${fijas} fijas · ${removibles} removibles</div>
<div class="meta"><strong>Marcas heredadas sin detalle protésico:</strong> ${marcasHeredadas}</div>
<div class="block">${legend}</div>
<div class="svg-wrap">
${ui.odontoSvg.outerHTML}
</div>
</body></html>`;
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  });

  ui.tratamientoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = {
        paciente_id: ui.tratamientoPacienteId.value,
        diente: ui.tratamientoDiente.value,
        tipo: ui.tratamientoTipo.value.trim(),
        observaciones: ui.tratamientoObservaciones.value.trim() || null,
        fecha: ui.tratamientoFecha.value || null,
      };
      await createTratamiento(payload);
      tratamientoModal?.hide();
      renderAlert(ui.alertContainer, 'Tratamiento guardado', 'success');
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });

  ui.protesisClase?.addEventListener('change', () => {
    const isFija = ui.protesisClase.value === 'fija';
    ui.protesisDientesGroup.classList.toggle('d-none', !isFija);
    ui.protesisArcadaGroup.classList.toggle('d-none', isFija);
  });

  ui.protesisForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const base = {
        paciente_id: ui.protesisPacienteId.value,
        tipo: ui.protesisTipo.value.trim(),
        descripcion: ui.protesisDescripcion.value.trim() || null,
        fecha: ui.protesisFecha.value || null,
      };

      if (ui.protesisClase.value === 'fija') {
        const dientes = ui.protesisDientes.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        await createProtesisFija({ ...base, dientes });
      } else {
        await createProtesisRemovible({
          ...base,
          arcada: ui.protesisArcada.value,
        });
      }

      protesisModal?.hide();
      renderAlert(ui.alertContainer, 'Prótesis registrada', 'success');
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

async function loadPacientes() {
  try {
    const data = await getPacientes({
      page: state.page,
      limit: state.limit,
      q: state.q || undefined,
      dni: state.dni || undefined,
      sort: state.sort || undefined,
    });

    state.total = data.total || 0;
    renderRows(data.pacientes || []);
    renderPagination();
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

async function loadFichaClinica() {
  if (!state.ficha.pacienteId) return;
  try {
    const data = await getFichaClinica(state.ficha.pacienteId, {
      page: state.ficha.page,
      limit: state.ficha.limit,
      estado_turno: state.ficha.estado || undefined,
      sort: state.ficha.sort || 'fecha:desc',
    });
    renderFichaContent(data);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function bindSearch() {
  ui.searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.q = ui.searchInput.value.trim();
    state.dni = ui.searchDniInput.value.trim();
    state.sort = ui.searchSortInput.value || 'apellido:asc';
    state.page = 1;
    await loadPacientes();
  });

  ui.clearSearchButton.addEventListener('click', async () => {
    ui.searchInput.value = '';
    ui.searchDniInput.value = '';
    ui.searchSortInput.value = 'apellido:asc';
    state.q = '';
    state.dni = '';
    state.sort = 'apellido:asc';
    state.page = 1;
    await loadPacientes();
  });

  ui.searchSortInput.addEventListener('change', async () => {
    state.sort = ui.searchSortInput.value || 'apellido:asc';
    state.page = 1;
    await loadPacientes();
  });
}

function bindOpenCreateModal() {
  ui.openCreateModalButton.addEventListener('click', openCreateModal);
}

function bindCreateForm() {
  ui.nacionalidadTipo.addEventListener('change', syncNacionalidadFields);
  ui.createForm.elements.dni.addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '');
  });
  const today = new Date();
  ui.createForm.elements.fecha_nacimiento.max = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  document.getElementById('paciente-modal')?.addEventListener('hidden.bs.modal', clearPacienteErrors);
  ui.createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearPacienteErrors();

    const formData = new FormData(ui.createForm);
    const payload = Object.fromEntries(formData.entries());
    const pacienteId = payload.id;
    delete payload.id;
    payload.nacionalidad = ui.nacionalidadTipo.value === 'Argentina'
      ? 'Argentina'
      : (ui.nacionalidadTipo.value === 'Otra' ? ui.nacionalidadPais.value : null);

    const clientErrors = validatePacientePayload(payload);
    if (Object.keys(clientErrors).length) {
      Object.entries(clientErrors).forEach(([field, message]) => setPacienteFieldError(field, message));
      return;
    }

    ['telefono', 'email', 'nacionalidad', 'domicilio', 'fecha_nacimiento', 'observaciones'].forEach((field) => {
      if (!payload[field] || !String(payload[field]).trim()) payload[field] = null;
    });

    try {
      if (state.mode === 'edit' && pacienteId) {
        const response = await updatePaciente(pacienteId, payload);
        renderAlert(ui.alertContainer, response.mensaje || 'Paciente actualizado', 'success');
      } else {
        const response = await createPaciente(payload);
        renderAlert(ui.alertContainer, response.mensaje || 'Paciente creado', 'success');
      }

      pacienteModal?.hide();
      state.page = 1;
      await loadPacientes();
      if (state.mode === 'edit' && String(state.ficha.pacienteId) === String(pacienteId)) {
        await loadFichaClinica();
      }
    } catch (error) {
      Object.entries(error.fields || {}).forEach(([field, message]) => setPacienteFieldError(field, message));
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function bindPagination() {
  ui.prevButton.addEventListener('click', async () => {
    if (state.page <= 1) return;
    state.page -= 1;
    await loadPacientes();
  });

  ui.nextButton.addEventListener('click', async () => {
    const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
    if (state.page >= totalPages) return;
    state.page += 1;
    await loadPacientes();
  });
}

function bindTableActions() {
  ui.tbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!id) return;

    if (action === 'edit') {
      const paciente = getPacienteFromRowButton(button);
      if (paciente) openEditModal(paciente);
      return;
    }

    if (action === 'ficha') {
      try {
        ui.pacientesListView.classList.add('d-none');
        ui.fichaView.classList.remove('d-none');
        ui.fichaContent.innerHTML = '<p class="text-secondary mb-0">Cargando ficha...</p>';
        state.ficha = { pacienteId: id, page: 1, limit: 50, estado: '', sort: 'fecha:desc', total: 0, documentoUrls: new Map() };
        await loadFichaClinica();
      } catch (error) {
        closeFicha();
        renderAlert(ui.alertContainer, error.message, 'danger');
      }
      return;
    }

  if (action === 'odontograma') {
    try {
      odontoModal?.show();
      await loadOdontograma(id);
    } catch (error) {
      odontoModal?.hide();
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
    return;
  }

  if (action === 'tratamiento') {
    const paciente = getPacienteFromRowButton(button);
    if (!paciente) return;
    ui.tratamientoPacienteId.value = paciente.id;
    ui.tratamientoDiente.value = '';
    ui.tratamientoTipo.value = '';
    ui.tratamientoObservaciones.value = '';
    ui.tratamientoFecha.value = '';
    tratamientoModal?.show();
    return;
  }

  if (action === 'protesis') {
    const paciente = getPacienteFromRowButton(button);
    if (!paciente) return;
    ui.protesisPacienteId.value = paciente.id;
    ui.protesisTipo.value = '';
    ui.protesisClase.value = 'fija';
    ui.protesisDientes.value = '';
    ui.protesisFecha.value = '';
    ui.protesisDescripcion.value = '';
    ui.protesisDientesGroup.classList.remove('d-none');
    ui.protesisArcadaGroup.classList.add('d-none');
    protesisModal?.show();
    return;
  }
});
}

export async function initPacientesView() {
  bindOpenCreateModal();
  bindSearch();
  bindCreateForm();
  bindPagination();
  bindTableActions();
  bindOdontograma();
  renderOdontograma();
  await loadPacientes();
}
