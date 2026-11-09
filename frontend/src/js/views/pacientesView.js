import {
  associateDocumento,
  createOdontogramaReferencia,
  createConsultaClinica,
  createPaciente,
  deleteDocumento,
  downloadDocumento,
  getFichaClinica,
  getDocumentos,
  getOdontogramaPaciente,
  getOdontogramaReferencias,
  getPacientes,
  postOdontograma,
  setOdontogramaReferenciaActiva,
  updateOdontogramaReferencia,
  updateConsultaClinica,
  updatePaciente,
  uploadDocumento,
} from '../api.js';
import { renderAlert } from '../components/alerts.js';

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
  sano: '#ffffff',
  existente: '#ff4d4d', // prestaciones existentes
  requerido: '#4d79ff', // prestaciones requeridas
  corona: '#ffcc00',
  protesis_fija: '#cbd5ff',
  protesis_removible: '#9dd6c8',
  ausente: '#4b5563',
  extraccion_indicada: '#7c3aed',
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
  },
  odontograma: {
    pacienteId: null,
    selectedTooth: null,
    registros: new Map(),
    metaDirty: false,
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
  pacienteFormStatus: document.getElementById('paciente-form-status'),
  fichaModalContent: document.getElementById('ficha-view-content'),
  pacientesListView: document.getElementById('pacientes-list-view'),
  fichaView: document.getElementById('paciente-ficha-view'),
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
  odontoDenticion: document.getElementById('odonto-denticion'),
  odontoExportPdf: document.getElementById('odonto-export-pdf'),
  odontoDetails: document.getElementById('odontograma-tooth-details'),
};

const pacienteModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('paciente-modal'));
const odontoModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('odontograma-modal'));

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('es-AR');
}

function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatText(value) {
  return value && String(value).trim() ? value : '-';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function renderOdontogramaHistorico(snapshot) {
  if (!snapshot) return '<p class="text-secondary mb-0">Esta atención no tiene una versión de odontograma.</p>';
  const registros = snapshot.registros || [];
  const referencias = snapshot.referencias || [];
  const registrosMap = new Map(registros.map((r) => [`${r.diente}-${r.cara}`, r.estado]));
  const referenciasMap = new Map(referencias.map((ref) => [ref.codigo, ref]));
  const colorPara = (codigo) => {
    const color = referenciasMap.get(codigo)?.color || estados[codigo] || '#ffffff';
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff';
  };
  const nombrePara = (codigo) => referenciasMap.get(codigo)?.nombre || codigo;
  const renderPieza = (diente) => {
    const resumen = FACES.map((cara) => `${cara}: ${nombrePara(registrosMap.get(`${diente}-${cara}`) || 'sano')}`).join(', ');
    const carasSvg = FACES.map((cara) => {
      const estado = registrosMap.get(`${diente}-${cara}`) || 'sano';
      return `<polygon points="${FACE_POLYGONS[cara]}" fill="${colorPara(estado)}" stroke="#334155" stroke-width="2"><title>${escapeHtml(`Pieza ${diente}, ${cara}: ${nombrePara(estado)}`)}</title></polygon>`;
    }).join('');
    return `<div class="odonto-historico-pieza"><svg viewBox="0 0 100 100" role="img" aria-label="${escapeHtml(`Pieza ${diente}. ${resumen}`)}">${carasSvg}</svg><span>${diente}</span></div>`;
  };
  const usados = [...new Set(['sano', ...registros.map((r) => r.estado)])];
  const leyenda = usados.length ? usados.map((codigo) => `<span class="odonto-historico-ref"><i style="background:${colorPara(codigo)}"></i>${escapeHtml(nombrePara(codigo))}</span>`).join('') : '<span class="text-secondary">Sin estados registrados</span>';
  return `<div class="odonto-historico" aria-label="Odontograma histórico en modo lectura"><div class="odonto-historico-leyenda">${leyenda}</div><div class="odonto-historico-arcada">${permanentes.superior.map(renderPieza).join('')}</div><div class="odonto-historico-arcada">${permanentes.inferior.map(renderPieza).join('')}</div>${registros.some((r) => /^[5-8][1-5]$/.test(String(r.diente))) ? `<h4 class="h6 mt-3">Dentición temporal</h4><div class="odonto-historico-arcada">${temporales.superior.map(renderPieza).join('')}</div><div class="odonto-historico-arcada">${temporales.inferior.map(renderPieza).join('')}</div>` : ''}<div class="small text-secondary mt-2">Versión capturada: ${escapeHtml(formatDateTime(snapshot.capturado_at))}. Sólo lectura.</div></div>`;
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
      alergias: paciente.alergias,
      condiciones: paciente.condiciones,
      estado_tratamiento: paciente.estado_tratamiento,
    }),
  );
}

function renderRows(pacientes) {
  if (!pacientes.length) {
    ui.tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">No se encontraron pacientes</td></tr>';
    return;
  }

  ui.tbody.innerHTML = pacientes
    .map((paciente) => {
      return `
      <tr>
        <td>${escapeHtml(paciente.nombre)}</td>
        <td>${escapeHtml(paciente.apellido)}</td>
        <td>${escapeHtml(paciente.dni)}</td>
        <td>
          <div>${escapeHtml(formatText(paciente.telefono))}</div>
          <small class="text-secondary">${escapeHtml(formatText(paciente.email))}</small>
        </td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" type="button" data-action="ficha" data-id="${paciente.id}" aria-label="Ver ficha clínica">
              <i class="bi bi-journal-medical me-1"></i>Ficha
            </button>
          </div>
        </td>
      </tr>
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
  ui.paginationMeta.textContent = `Página ${state.page} de ${totalPages} | Total: ${state.total}`;
  ui.prevButton.disabled = state.page <= 1;
  ui.nextButton.disabled = state.page >= totalPages;
}

function limpiarValidacionesPaciente() {
  ui.createForm.classList.remove('was-validated');
  ui.createForm.querySelectorAll('.is-invalid').forEach((element) => {
    element.classList.remove('is-invalid');
    element.removeAttribute('aria-invalid');
  });
  ui.createForm.querySelectorAll('.invalid-feedback.dynamic').forEach((element) => element.remove());
  ui.pacienteFormStatus?.replaceChildren();
  ui.createForm.elements.estado_tratamiento?.querySelectorAll('option[data-historico="true"]').forEach((option) => option.remove());
}

function configurarNacionalidad(tipo, pais = '') {
  const tipoSelect = document.getElementById('nacionalidad-tipo');
  const paisGroup = document.getElementById('nacionalidad-pais-group');
  const paisSelect = ui.createForm.elements.nacionalidad;
  paisSelect.querySelectorAll('option[data-historico="true"]').forEach((option) => option.remove());
  const extranjero = tipo === 'Extranjero';
  tipoSelect.value = extranjero ? 'Extranjero' : 'Argentina';
  paisGroup.classList.toggle('d-none', !extranjero);
  paisSelect.required = extranjero;
  paisSelect.disabled = !extranjero;

  if (extranjero && pais && !Array.from(paisSelect.options).some((option) => option.value === pais)) {
    const option = document.createElement('option');
    option.value = pais;
    option.textContent = `${pais} (valor anterior)`;
    option.dataset.historico = 'true';
    paisSelect.appendChild(option);
  }
  paisSelect.value = extranjero ? pais : '';
}

function openCreateModal() {
  state.mode = 'create';
  ui.modalTitle.textContent = 'Nuevo paciente';
  ui.modalSubmitButton.textContent = 'Guardar paciente';
  ui.pacienteIdInput.value = '';
  ui.createForm.reset();
  limpiarValidacionesPaciente();
  configurarNacionalidad('Argentina');
  pacienteModal?.show();
}

function openEditModal(paciente) {
  state.mode = 'edit';
  ui.modalTitle.textContent = 'Editar paciente';
  ui.modalSubmitButton.textContent = 'Guardar cambios';
  limpiarValidacionesPaciente();
  ui.pacienteIdInput.value = paciente.id;
  ui.createForm.elements.nombre.value = paciente.nombre;
  ui.createForm.elements.apellido.value = paciente.apellido;
  ui.createForm.elements.dni.value = paciente.dni === '-' ? '' : paciente.dni;
  ui.createForm.elements.telefono.value = paciente.telefono || '';
  ui.createForm.elements.email.value = paciente.email || '';
  const esArgentina = paciente.nacionalidad === 'Argentina';
  configurarNacionalidad(esArgentina ? 'Argentina' : 'Extranjero', paciente.nacionalidad || '');
  ui.createForm.elements.domicilio.value = paciente.domicilio || '';
  ui.createForm.elements.fecha_nacimiento.value = paciente.fecha_nacimiento ? String(paciente.fecha_nacimiento).slice(0, 10) : '';
  ui.createForm.elements.observaciones.value = paciente.observaciones || '';
  ui.createForm.elements.alergias.value = paciente.alergias || '';
  ui.createForm.elements.condiciones.value = paciente.condiciones || '';
  const estadoTratamiento = ui.createForm.elements.estado_tratamiento;
  if (paciente.estado_tratamiento && !Array.from(estadoTratamiento.options).some((option) => option.value === paciente.estado_tratamiento)) {
    const option = document.createElement('option'); option.value = paciente.estado_tratamiento; option.textContent = `${paciente.estado_tratamiento} (valor anterior)`; option.dataset.historico = 'true'; estadoTratamiento.appendChild(option);
  }
  estadoTratamiento.value = paciente.estado_tratamiento || '';
  pacienteModal?.show();
}

function renderFichaOrganizada(data) {
  const paciente = data.paciente || {};
  const consultas = data.historiasClinicas || [];
  const profesionales = data.profesionales || [];
  const turnosParaConsulta = data.turnosParaConsulta || [];
  const turnos = data.historialTurnos?.turnos || [];
  const totalTurnos = data.historialTurnos?.total || 0;
  const page = data.historialTurnos?.page || state.ficha.page;
  const limit = data.historialTurnos?.limit || state.ficha.limit;
  const totalPages = Math.max(1, Math.ceil(totalTurnos / limit));
  const pacienteData = serializePacienteForDataset(paciente);
  state.ficha.page = page;
  state.ficha.total = totalTurnos;
  state.ficha.consultas = consultas;

  const consultasHtml = consultas.length ? consultas.map((consulta) => `
    <article class="ficha-timeline-item">
      <div class="ficha-timeline-marker" aria-hidden="true"></div>
      <div class="card border-0 shadow-sm">
        <div class="card-body">
          <div class="d-flex flex-wrap justify-content-between gap-2">
            <div><h4 class="h6 mb-1">${escapeHtml(consulta.motivo_consulta || consulta.descripcion || 'Registro clínico anterior')}</h4><div class="small text-secondary">${escapeHtml(formatDateTime(consulta.fecha_atencion || consulta.created_at))} · ${escapeHtml(consulta.profesional_nombre || 'Profesional no registrado')}</div></div>
            <div class="d-flex gap-2 align-items-start"><span class="badge ${consulta.odontograma_disponible ? 'text-bg-success' : 'text-bg-light'}">${consulta.odontograma_disponible ? 'Con odontograma' : 'Sin odontograma'}</span><button class="btn btn-sm btn-outline-primary" type="button" data-edit-consulta="${consulta.id}"><i class="bi bi-pencil me-1"></i>Editar</button></div>
          </div>
          ${consulta.turno_id ? `<div class="small text-secondary mt-2"><i class="bi bi-calendar-check me-1"></i>Turno asociado: ${escapeHtml(formatDateTime(consulta.turno_fecha))} · ${escapeHtml(consulta.turno_prestacion || '')}</div>` : ''}
          ${consulta.diagnostico ? `<p class="mb-2 mt-3"><strong>Diagnóstico:</strong> ${escapeHtml(consulta.diagnostico)}</p>` : ''}
          <details class="mt-2">
            <summary class="btn btn-sm btn-outline-secondary">Ver detalle de la atención</summary>
            <div class="ficha-consulta-detalle mt-3">
              ${consulta.tratamientos_realizados ? `<p><strong>Tratamientos o prestaciones</strong><br>${escapeHtml(consulta.tratamientos_realizados)}</p>` : ''}
              ${consulta.plan_indicaciones ? `<p><strong>Plan e indicaciones</strong><br>${escapeHtml(consulta.plan_indicaciones)}</p>` : ''}
              ${consulta.observaciones ? `<p><strong>Observaciones</strong><br>${escapeHtml(consulta.observaciones)}</p>` : ''}
              ${(consulta.documentos || []).length ? `<p><strong>Documentos:</strong> ${(consulta.documentos || []).map((doc) => escapeHtml(doc.nombre_archivo)).join(', ')}</p>` : '<p class="text-secondary">Sin documentos asociados.</p>'}
              <details><summary class="fw-semibold">Odontograma de esta atención</summary><div class="mt-3">${renderOdontogramaHistorico(consulta.odontograma_snapshot)}</div></details>
            </div>
          </details>
        </div>
      </div>
    </article>`).join('') : '<div class="ficha-empty-state"><i class="bi bi-journal-medical"></i><p class="mb-0">Todavía no hay atenciones clínicas registradas.</p></div>';

  const turnosHtml = turnos.length ? turnos.map((turno) => `<tr><td>${escapeHtml(formatDateTime(turno.fecha_hora_inicio))}</td><td>${escapeHtml(turno.prestacion?.nombre || '-')}</td><td><span class="badge text-bg-light">${escapeHtml(turno.estado || '-')}</span></td><td>${escapeHtml(turno.observaciones || '-')}</td></tr>`).join('') : '<tr><td colspan="4" class="text-center text-secondary py-4">Sin turnos registrados</td></tr>';

  ui.fichaModalContent.innerHTML = `
    <div class="ficha-page">
      <header class="ficha-header card border-0 shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-start gap-3">
            <button class="btn btn-outline-secondary btn-sm" type="button" id="ficha-volver"><i class="bi bi-arrow-left me-1"></i>Volver</button>
            <div class="ficha-avatar" aria-hidden="true">${escapeHtml((paciente.nombre?.[0] || '') + (paciente.apellido?.[0] || ''))}</div>
            <div class="flex-grow-1">
              <div class="d-flex flex-wrap align-items-center gap-2"><h2 class="h4 mb-0">${escapeHtml(paciente.apellido || '')}, ${escapeHtml(paciente.nombre || '')}</h2>${paciente.alergias ? '<span class="badge text-bg-danger">Alergias registradas</span>' : ''}</div>
              <div class="text-secondary mt-1">DNI ${escapeHtml(paciente.dni || '-')} · ${paciente.edad ?? '-'} años · ${escapeHtml(paciente.telefono || 'Sin teléfono')}</div>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-outline-secondary btn-sm" type="button" id="ficha-editar" data-paciente="${pacienteData}"><i class="bi bi-pencil me-1"></i>Editar datos</button>
              <button class="btn btn-primary btn-sm" type="button" id="ficha-nueva-consulta"><i class="bi bi-plus-lg me-1"></i>Registrar atención</button>
            </div>
          </div>
        </div>
      </header>

      <nav class="ficha-tabs nav nav-pills flex-nowrap overflow-auto mb-3" aria-label="Secciones de la ficha">
        <button class="nav-link active" type="button" data-ficha-tab="resumen">Resumen</button>
        <button class="nav-link" type="button" data-ficha-tab="antecedentes">Antecedentes</button>
        <button class="nav-link" type="button" data-ficha-tab="consultas">Consultas <span class="badge text-bg-light ms-1">${consultas.length}</span></button>
        <button class="nav-link" type="button" data-ficha-tab="odontograma">Odontograma</button>
        <button class="nav-link" type="button" data-ficha-tab="documentos">Documentos</button>
        <button class="nav-link" type="button" data-ficha-tab="turnos">Turnos <span class="badge text-bg-light ms-1">${totalTurnos}</span></button>
      </nav>

      <section data-ficha-pane="resumen">
        <div class="row g-3">
          <div class="col-md-4"><div class="ficha-summary-card"><span>Contacto</span><strong>${escapeHtml(paciente.telefono || 'Sin teléfono')}</strong><small>${escapeHtml(paciente.email || 'Sin correo electrónico')}</small></div></div>
          <div class="col-md-4"><div class="ficha-summary-card"><span>Última visita</span><strong>${escapeHtml(data.ultimaVisita?.fecha_hora_inicio ? formatDateTime(data.ultimaVisita.fecha_hora_inicio) : 'Sin registros')}</strong><small>${escapeHtml(data.ultimaVisita?.prestacion || '')}</small></div></div>
          <div class="col-md-4"><div class="ficha-summary-card"><span>Próximo turno</span><strong>${escapeHtml(data.proximoTurno?.fecha_hora_inicio ? formatDateTime(data.proximoTurno.fecha_hora_inicio) : 'Sin turno programado')}</strong><small>${escapeHtml(data.proximoTurno?.prestacion || '')}</small></div></div>
          <div class="col-lg-7"><div class="card border-0 shadow-sm h-100"><div class="card-body"><h3 class="h6">Datos personales</h3><dl class="row ficha-datos mb-0"><dt class="col-sm-4">Nacimiento</dt><dd class="col-sm-8">${escapeHtml(formatDate(paciente.fecha_nacimiento))}</dd><dt class="col-sm-4">Nacionalidad</dt><dd class="col-sm-8">${escapeHtml(paciente.nacionalidad || '-')}</dd><dt class="col-sm-4">Domicilio</dt><dd class="col-sm-8">${escapeHtml(paciente.domicilio || '-')}</dd></dl></div></div></div>
          <div class="col-lg-5"><div class="card border-0 shadow-sm h-100"><div class="card-body"><h3 class="h6">Alertas clínicas</h3><p><strong>Alergias:</strong><br>${escapeHtml(paciente.alergias || 'Sin alergias registradas')}</p><p class="mb-0"><strong>Condiciones:</strong><br>${escapeHtml(paciente.condiciones || 'Sin condiciones registradas')}</p></div></div></div>
        </div>
      </section>

      <section class="d-none" data-ficha-pane="antecedentes"><div class="card border-0 shadow-sm"><div class="card-body"><h3 class="h5 mb-3">Antecedentes clínicos</h3><div class="row g-3"><div class="col-md-6"><div class="ficha-clinical-block"><span>Alergias</span><p>${escapeHtml(paciente.alergias || 'Sin datos registrados')}</p></div></div><div class="col-md-6"><div class="ficha-clinical-block"><span>Condiciones médicas</span><p>${escapeHtml(paciente.condiciones || 'Sin datos registrados')}</p></div></div><div class="col-md-6"><div class="ficha-clinical-block"><span>Estado del tratamiento</span><p>${escapeHtml(paciente.estado_tratamiento || 'Sin datos registrados')}</p></div></div><div class="col-md-6"><div class="ficha-clinical-block"><span>Observaciones generales</span><p>${escapeHtml(paciente.observaciones || 'Sin datos registrados')}</p></div></div></div></div></div></section>

      <section class="d-none" data-ficha-pane="consultas">
        <form id="consulta-form" class="card border-0 shadow-sm mb-3 d-none"><div class="card-body"><input type="hidden" name="consulta_id"><div class="d-flex justify-content-between align-items-center mb-3"><h3 class="h5 mb-0" id="consulta-form-title">Registrar atención</h3><button type="button" class="btn-close" id="consulta-cerrar" aria-label="Cerrar formulario"></button></div><div class="row g-3"><div class="col-md-6"><label class="form-label">Fecha y hora *</label><input name="fecha_atencion" type="datetime-local" class="form-control" required></div><div class="col-md-6"><label class="form-label">Profesional responsable *</label><select name="profesional_id" class="form-select" required><option value="">Seleccione un profesional</option>${profesionales.map((p) => `<option value="${p.id}">${escapeHtml(p.nombre)} · ${escapeHtml(p.email)}</option>`).join('')}</select></div><div class="col-md-6"><label class="form-label">Turno asociado <span class="text-secondary fw-normal">(opcional)</span></label><select name="turno_id" class="form-select"><option value="">Sin turno asociado</option>${turnosParaConsulta.map((t) => `<option value="${t.id}" data-consulta-id="${t.consulta_id || ''}" ${t.consulta_id ? 'disabled' : ''}>${escapeHtml(formatDateTime(t.fecha_hora_inicio))} · ${escapeHtml(t.prestacion_nombre || 'Sin prestación')} · ${escapeHtml(t.estado)}</option>`).join('')}</select><div class="form-text">Un turno sólo puede pertenecer a una atención.</div></div><div class="col-md-6"><label class="form-label">Motivo de consulta *</label><input name="motivo_consulta" class="form-control" required></div><div class="col-md-6"><label class="form-label">Diagnóstico</label><textarea name="diagnostico" class="form-control" rows="2"></textarea></div><div class="col-md-6"><label class="form-label">Tratamientos o prestaciones</label><textarea name="tratamientos_realizados" class="form-control" rows="2"></textarea></div><div class="col-md-6"><label class="form-label">Plan o indicaciones</label><textarea name="plan_indicaciones" class="form-control" rows="2"></textarea></div><div class="col-md-6"><label class="form-label">Observaciones</label><textarea name="observaciones" class="form-control" rows="2"></textarea></div><div class="col-12 form-check ms-2" id="consulta-snapshot-group"><input name="guardar_odontograma" id="consulta-odontograma" type="checkbox" class="form-check-input" checked><label for="consulta-odontograma" class="form-check-label">Conservar una versión del odontograma actual</label></div><div class="col-12 d-none" id="consulta-snapshot-note"><div class="alert alert-light border mb-0">El odontograma histórico ya guardado no se modifica al editar la atención.</div></div><div class="col-12"><button class="btn btn-primary" id="consulta-submit" type="submit">Guardar atención</button></div></div></div></form>
        <div class="d-flex justify-content-between align-items-center mb-3"><div><h3 class="h5 mb-0">Historial de consultas</h3><small class="text-secondary">Atenciones clínicas ordenadas desde la más reciente</small></div><button class="btn btn-primary btn-sm" type="button" id="consultas-agregar">Registrar atención</button></div>
        <div class="ficha-timeline">${consultasHtml}</div>
      </section>

      <section class="d-none" data-ficha-pane="odontograma"><div class="card border-0 shadow-sm"><div class="card-body text-center py-5"><i class="bi bi-grid-3x3-gap ficha-section-icon"></i><h3 class="h5 mt-3">Odontograma actual</h3><p class="text-secondary mx-auto" style="max-width:560px">Consultá y actualizá el estado dental actual. Las versiones asociadas a atenciones anteriores se mantienen intactas.</p><button class="btn btn-primary" type="button" id="ficha-odontograma">Abrir odontograma</button></div></div></section>

      <section class="d-none" data-ficha-pane="documentos"><div class="card border-0 shadow-sm"><div class="card-body"><div class="d-flex flex-wrap justify-content-between align-items-center mb-3"><div><h3 class="h5 mb-0">Documentos</h3><small class="text-secondary">Archivos generales o asociados a una atención</small></div><button class="btn btn-outline-secondary btn-sm" type="button" id="ficha-documentos-refresh">Actualizar</button></div><form id="ficha-documentos-form" class="row g-2 align-items-end mb-3"><div class="col-md-4"><label class="form-label" for="ficha-documentos-descripcion">Descripción</label><input id="ficha-documentos-descripcion" class="form-control" placeholder="Radiografía, receta, etc."></div><div class="col-md-4"><label class="form-label" for="ficha-documentos-archivo">Archivo</label><input id="ficha-documentos-archivo" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png" required></div><div class="col-md-3"><label class="form-label" for="ficha-documentos-consulta">Atención asociada</label><select id="ficha-documentos-consulta" class="form-select"><option value="">Documento general</option>${consultas.map((c) => `<option value="${c.id}">${escapeHtml(formatDateTime(c.fecha_atencion || c.created_at))} - ${escapeHtml(c.motivo_consulta || c.descripcion)}</option>`).join('')}</select></div><div class="col-md-1 d-grid"><button class="btn btn-primary" type="submit">Subir</button></div></form><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Nombre</th><th>Tipo</th><th>Descripción</th><th>Fecha</th><th>Atención asociada</th><th class="text-end">Acciones</th></tr></thead><tbody id="ficha-documentos-tbody"></tbody></table></div><small class="text-secondary">PDF, JPG o PNG. Máximo 10 MB.</small></div></div></section>

      <section class="d-none" data-ficha-pane="turnos"><div class="card border-0 shadow-sm"><div class="card-body"><div class="d-flex flex-wrap align-items-center gap-2 mb-3"><div class="me-auto"><h3 class="h5 mb-0">Historial de turnos</h3><small class="text-secondary">Citas administrativas; no equivalen a atenciones clínicas</small></div><select id="ficha-estado-filter" class="form-select form-select-sm" style="max-width:190px"><option value="">Todos los estados</option><option value="programado">Programado</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option><option value="reprogramado">Reprogramado</option></select><select id="ficha-sort" class="form-select form-select-sm" style="max-width:150px"><option value="fecha:desc">Más recientes</option><option value="fecha:asc">Más antiguos</option></select></div><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Fecha y hora</th><th>Prestación</th><th>Estado</th><th>Observaciones</th></tr></thead><tbody>${turnosHtml}</tbody></table></div><div class="d-flex justify-content-between align-items-center"><button class="btn btn-sm btn-outline-secondary" id="ficha-prev" ${page <= 1 ? 'disabled' : ''}>Anterior</button><small class="text-secondary">Página ${page} de ${totalPages} · ${totalTurnos} turnos</small><button class="btn btn-sm btn-outline-secondary" id="ficha-next" ${page >= totalPages ? 'disabled' : ''}>Siguiente</button></div></div></div></section>
    </div>`;

  const activarTab = (tab) => {
    state.ficha.tab = tab;
    ui.fichaModalContent.querySelectorAll('[data-ficha-tab]').forEach((button) => button.classList.toggle('active', button.dataset.fichaTab === tab));
    ui.fichaModalContent.querySelectorAll('[data-ficha-pane]').forEach((pane) => pane.classList.toggle('d-none', pane.dataset.fichaPane !== tab));
  };
  ui.fichaModalContent.querySelectorAll('[data-ficha-tab]').forEach((button) => button.addEventListener('click', () => activarTab(button.dataset.fichaTab)));
  document.getElementById('ficha-volver')?.addEventListener('click', () => { ui.fichaView.classList.add('d-none'); ui.pacientesListView.classList.remove('d-none'); });
  document.getElementById('ficha-editar')?.addEventListener('click', (event) => openEditModal(getPacienteFromRowButton(event.currentTarget)));
  const mostrarConsulta = (consulta = null) => {
    activarTab('consultas');
    const form = document.getElementById('consulta-form');
    form.reset();
    form.elements.consulta_id.value = consulta?.id || '';
    form.elements.fecha_atencion.value = consulta ? toDateTimeLocal(consulta.fecha_atencion || consulta.created_at) : toDateTimeLocal(new Date());
    form.elements.profesional_id.value = consulta?.profesional_id || profesionales[0]?.id || '';
    form.elements.motivo_consulta.value = consulta?.motivo_consulta || consulta?.descripcion || '';
    form.elements.diagnostico.value = consulta?.diagnostico || '';
    form.elements.tratamientos_realizados.value = consulta?.tratamientos_realizados || '';
    form.elements.plan_indicaciones.value = consulta?.plan_indicaciones || '';
    form.elements.observaciones.value = consulta?.observaciones || '';
    Array.from(form.elements.turno_id.options).forEach((option) => {
      const asociado = option.dataset.consultaId;
      option.disabled = Boolean(asociado && String(asociado) !== String(consulta?.id || ''));
    });
    form.elements.turno_id.value = consulta?.turno_id || '';
    document.getElementById('consulta-form-title').textContent = consulta ? 'Editar atención' : 'Registrar atención';
    document.getElementById('consulta-submit').textContent = consulta ? 'Guardar cambios' : 'Guardar atención';
    document.getElementById('consulta-snapshot-group').classList.toggle('d-none', Boolean(consulta));
    document.getElementById('consulta-snapshot-note').classList.toggle('d-none', !consulta);
    form.classList.remove('d-none');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  document.getElementById('ficha-nueva-consulta')?.addEventListener('click', () => mostrarConsulta());
  document.getElementById('consultas-agregar')?.addEventListener('click', () => mostrarConsulta());
  document.querySelectorAll('[data-edit-consulta]').forEach((button) => button.addEventListener('click', () => mostrarConsulta(consultas.find((consulta) => String(consulta.id) === button.dataset.editConsulta))));
  document.getElementById('consulta-cerrar')?.addEventListener('click', () => document.getElementById('consulta-form')?.classList.add('d-none'));
  document.getElementById('ficha-odontograma')?.addEventListener('click', async () => { odontoModal?.show(); await loadOdontograma(state.ficha.pacienteId); });

  const estadoSelect = document.getElementById('ficha-estado-filter');
  if (estadoSelect) estadoSelect.value = state.ficha.estado || '';
  const sortSelect = document.getElementById('ficha-sort');
  if (sortSelect) sortSelect.value = state.ficha.sort || 'fecha:desc';
  estadoSelect?.addEventListener('change', async () => { state.ficha.estado = estadoSelect.value; state.ficha.page = 1; await loadFichaClinica(); });
  sortSelect?.addEventListener('change', async () => { state.ficha.sort = sortSelect.value; state.ficha.page = 1; await loadFichaClinica(); });
  document.getElementById('ficha-prev')?.addEventListener('click', async () => { if (state.ficha.page > 1) { state.ficha.page -= 1; await loadFichaClinica(); } });
  document.getElementById('ficha-next')?.addEventListener('click', async () => { if (state.ficha.page < totalPages) { state.ficha.page += 1; await loadFichaClinica(); } });

  bindFichaDocumentos();
  cargarDocumentosFicha();
  document.getElementById('consulta-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries());
    const consultaId = payload.consulta_id; delete payload.consulta_id; delete payload.guardar_odontograma;
    if (!consultaId && document.getElementById('consulta-odontograma')?.checked) payload.odontograma = { registros: [], meta: {} };
    try {
      const response = consultaId ? await updateConsultaClinica(state.ficha.pacienteId, consultaId, payload) : await createConsultaClinica(state.ficha.pacienteId, payload);
      renderAlert(ui.alertContainer, response.mensaje || (consultaId ? 'Atención actualizada.' : 'Atención registrada.'), 'success');
      state.ficha.tab = 'consultas'; await loadFichaClinica();
    }
    catch (error) { renderAlert(ui.alertContainer, error.message, 'danger'); }
  });
  activarTab(state.ficha.tab || 'resumen');
}

function renderFichaContent(data) {
  renderFichaOrganizada(data);
  return;
  const paciente = data.paciente || {};
  const turnos = data.historialTurnos?.turnos || [];
  const totalTurnos = data.historialTurnos?.total || 0;
  const page = data.historialTurnos?.page || state.ficha.page;
  const limit = data.historialTurnos?.limit || state.ficha.limit;
  const totalPages = Math.max(1, Math.ceil(totalTurnos / limit));
  const consultas = data.historiasClinicas || [];
  const pacienteData = serializePacienteForDataset(paciente);
  const consultasHtml = consultas.length ? consultas.map((consulta) => `
    <article class="border rounded p-3 mb-2">
      <div class="d-flex flex-wrap justify-content-between gap-2"><strong>${escapeHtml(consulta.motivo_consulta || consulta.descripcion || 'Registro clínico anterior')}</strong><span>${escapeHtml(formatDateTime(consulta.fecha_atencion || consulta.created_at))}</span></div>
      <div class="small text-secondary mb-2">Profesional: ${escapeHtml(consulta.profesional_nombre || 'No registrado')}</div>
      ${consulta.diagnostico ? `<div><strong>Diagnóstico:</strong> ${escapeHtml(consulta.diagnostico)}</div>` : ''}
      ${consulta.tratamientos_realizados ? `<div><strong>Tratamientos:</strong> ${escapeHtml(consulta.tratamientos_realizados)}</div>` : ''}
      ${consulta.plan_indicaciones ? `<div><strong>Plan/indicaciones:</strong> ${escapeHtml(consulta.plan_indicaciones)}</div>` : ''}
      ${consulta.observaciones ? `<div><strong>Observaciones:</strong> ${escapeHtml(consulta.observaciones)}</div>` : ''}
      <div class="small mt-2">Odontograma: ${consulta.odontograma_disponible ? 'versión conservada' : 'sin versión disponible'}</div>
      ${consulta.odontograma_snapshot ? `<details class="small mt-1"><summary>Consultar odontograma de esta atención</summary><ul class="mb-0">${(consulta.odontograma_snapshot.registros || []).map((r) => { const ref=(consulta.odontograma_snapshot.referencias || []).find((item) => item.codigo===r.estado); return `<li>Pieza ${escapeHtml(r.diente)}, cara ${escapeHtml(r.cara)}: ${escapeHtml(ref?.nombre || r.estado)}</li>`; }).join('') || '<li>Sin estados dentales registrados</li>'}</ul></details>` : ''}
      ${(consulta.documentos || []).length ? `<div class="small">Documentos: ${(consulta.documentos || []).map((doc) => escapeHtml(doc.nombre_archivo)).join(', ')}</div>` : ''}
    </article>`).join('') : '<p class="text-secondary">Sin atenciones clínicas registradas.</p>';

  state.ficha.page = page;
  state.ficha.total = totalTurnos;

  const turnosHtml = turnos.length
    ? turnos
        .map(
          (turno) => `
            <tr>
              <td>${formatDate(turno.fecha_hora_inicio)}</td>
              <td>${escapeHtml(turno.prestacion?.nombre || '-')}</td>
              <td>${escapeHtml(turno.estado || '-')}</td>
              <td>${turno.prestacion?.duracion_minutos ? `${turno.prestacion.duracion_minutos} min` : '-'}</td>
              <td>${escapeHtml(turno.observaciones || '-')}</td>
            </tr>
          `,
        )
        .join('')
    : '<tr><td colspan="5" class="text-center text-secondary">Sin historial</td></tr>';

  ui.fichaModalContent.innerHTML = `
    <div class="row g-3 mb-2">
      <div class="col-md-2"><strong>ID:</strong> ${paciente.id ?? '-'}</div>
      <div class="col-md-6"><strong>Paciente:</strong> ${escapeHtml(paciente.apellido || '')}, ${escapeHtml(paciente.nombre || '')}</div>
      <div class="col-md-4"><strong>DNI:</strong> ${escapeHtml(paciente.dni || '-')}</div>
      <div class="col-md-4"><strong>Nacionalidad:</strong> ${escapeHtml(paciente.nacionalidad || '-')}</div>
      <div class="col-md-4"><strong>Edad:</strong> ${paciente.edad ?? '-'} ${paciente.edad ? 'años' : ''}</div>
      <div class="col-md-4"><strong>Fecha nacimiento:</strong> ${formatDate(paciente.fecha_nacimiento)}</div>
      <div class="col-md-6"><strong>Contacto:</strong> ${escapeHtml(paciente.telefono || '-')} / ${escapeHtml(paciente.email || '-')}</div>
      <div class="col-md-6"><strong>Domicilio:</strong> ${escapeHtml(paciente.domicilio || '-')}</div>
      <div class="col-md-4"><strong>Alergias:</strong> ${escapeHtml(paciente.alergias || '-')}</div>
      <div class="col-md-4"><strong>Condiciones:</strong> ${escapeHtml(paciente.condiciones || '-')}</div>
      <div class="col-md-4"><strong>Estado trat.:</strong> ${escapeHtml(paciente.estado_tratamiento || '-')}</div>
      <div class="col-12"><strong>Observaciones clínicas:</strong> ${escapeHtml(paciente.observaciones || '-')}</div>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <button type="button" class="btn btn-outline-secondary btn-sm" id="ficha-editar" data-paciente="${pacienteData}">Editar datos</button>
      <button type="button" class="btn btn-outline-primary btn-sm" id="ficha-odontograma">Ver o editar odontograma actual</button>
    </div>
    <hr><h3 class="h6">Historial de consultas</h3>
    <form id="consulta-form" class="row g-2 border rounded p-2 mb-3">
      <div class="col-md-6"><label class="form-label">Fecha y hora</label><input name="fecha_atencion" type="datetime-local" class="form-control" required></div>
      <div class="col-md-6"><label class="form-label">Motivo de consulta</label><input name="motivo_consulta" class="form-control" required></div>
      <div class="col-md-6"><label class="form-label">Diagnóstico</label><textarea name="diagnostico" class="form-control"></textarea></div>
      <div class="col-md-6"><label class="form-label">Tratamientos o prestaciones</label><textarea name="tratamientos_realizados" class="form-control"></textarea></div>
      <div class="col-md-6"><label class="form-label">Plan o indicaciones</label><textarea name="plan_indicaciones" class="form-control"></textarea></div>
      <div class="col-md-6"><label class="form-label">Observaciones</label><textarea name="observaciones" class="form-control"></textarea></div>
      <div class="col-12 form-check ms-2"><input name="guardar_odontograma" id="consulta-odontograma" type="checkbox" class="form-check-input" checked><label for="consulta-odontograma" class="form-check-label">Conservar una versión del odontograma actual</label></div>
      <div class="col-12"><button class="btn btn-primary btn-sm" type="submit">Registrar atención</button></div>
    </form>
    <div class="mb-4">${consultasHtml}</div>
    <hr><h3 class="h6">Historial de turnos</h3>
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
        <label class="form-label" for="ficha-documentos-descripcion">Descripción</label>
        <input id="ficha-documentos-descripcion" class="form-control" placeholder="Radiografia, receta, etc." />
      </div>
      <div class="col-md-5">
        <label class="form-label" for="ficha-documentos-archivo">Archivo</label>
        <input id="ficha-documentos-archivo" type="file" class="form-control" accept=".pdf,.jpg,.jpeg,.png" required />
      </div>
      <div class="col-md-5">
        <label class="form-label" for="ficha-documentos-consulta">Atención asociada (opcional)</label>
        <select id="ficha-documentos-consulta" class="form-select"><option value="">Documento general</option>${consultas.map((c) => `<option value="${c.id}">${escapeHtml(formatDateTime(c.fecha_atencion || c.created_at))} - ${escapeHtml(c.motivo_consulta || c.descripcion)}</option>`).join('')}</select>
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
            <th>Descripción</th>
            <th>Fecha</th>
            <th class="text-end">Acciones</th>
          </tr>
        </thead>
        <tbody id="ficha-documentos-tbody"></tbody>
      </table>
    </div>
    <small class="text-secondary">Tipos permitidos: PDF, JPG, PNG. Máximo 10 MB.</small>
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
  document.getElementById('ficha-editar')?.addEventListener('click', (event) => openEditModal(getPacienteFromRowButton(event.currentTarget)));
  document.getElementById('ficha-odontograma')?.addEventListener('click', async () => { odontoModal?.show(); await loadOdontograma(state.ficha.pacienteId); });
  document.getElementById('consulta-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    delete payload.guardar_odontograma;
    if (document.getElementById('consulta-odontograma')?.checked) payload.odontograma = { registros: [], meta: {} };
    try { await createConsultaClinica(state.ficha.pacienteId, payload); renderAlert(ui.alertContainer, 'Atención registrada.', 'success'); await loadFichaClinica(); }
    catch (error) { renderAlert(ui.alertContainer, error.message, 'danger'); }
  });
}

function renderDocumentosFicha(documentos = []) {
  const tbody = document.getElementById('ficha-documentos-tbody');
  if (!tbody) return;

  if (!documentos.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-secondary">Sin documentos</td></tr>';
    return;
  }

  tbody.innerHTML = documentos
    .map((doc) => `
        <tr>
          <td>${escapeHtml(doc.nombre_archivo)}</td>
          <td>${escapeHtml(doc.tipo_archivo)}</td>
          <td>${escapeHtml(doc.descripcion || '-')}</td>
          <td>${formatDate(doc.fecha_subida)}</td>
          <td><select class="form-select form-select-sm" data-action="associate-doc" data-id="${doc.id}" aria-label="Atención asociada a ${escapeHtml(doc.nombre_archivo)}"><option value="">Documento general</option>${(state.ficha.consultas || []).map((consulta) => `<option value="${consulta.id}" ${String(doc.historia_clinica_id || '') === String(consulta.id) ? 'selected' : ''}>${escapeHtml(formatDateTime(consulta.fecha_atencion || consulta.created_at))} - ${escapeHtml(consulta.motivo_consulta || consulta.descripcion)}</option>`).join('')}</select></td>
          <td class="text-end">
            <div class="btn-group">
              <button class="btn btn-sm btn-outline-primary" type="button" data-action="download-doc" data-id="${doc.id}">Descargar</button>
              <button class="btn btn-sm btn-outline-danger" type="button" data-action="delete-doc" data-id="${doc.id}">Eliminar</button>
            </div>
          </td>
        </tr>
      `)
    .join('');
}

async function cargarDocumentosFicha() {
  const pacienteId = state.ficha.pacienteId;
  if (!pacienteId) return;

  try {
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
  const tbody = document.getElementById('ficha-documentos-tbody');

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
    const consultaId = document.getElementById('ficha-documentos-consulta')?.value;
    if (consultaId) formData.append('historia_clinica_id', consultaId);
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

  tbody?.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const id = button.dataset.id;
    if (!id) return;

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
      await deleteDocumento(id);
      renderAlert(ui.alertContainer, 'Documento eliminado.', 'success');
      await cargarDocumentosFicha();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
  tbody?.addEventListener('change', async (event) => {
    const select = event.target.closest('select[data-action="associate-doc"]');
    if (!select) return;
    try { await associateDocumento(select.dataset.id, select.value || null); renderAlert(ui.alertContainer, 'Asociación del documento actualizada.', 'success'); await cargarDocumentosFicha(); }
    catch (error) { renderAlert(ui.alertContainer, error.message, 'danger'); await cargarDocumentosFicha(); }
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
  return state.odontograma.registros.get(key) || 'sano';
}

function paintFace(toothNumber, face, estado) {
  const key = `${toothNumber}-${face}`;
  state.odontograma.registros.set(key, estado);

  const selector = `.odonto-face[data-tooth="${toothNumber}"][data-face="${face}"]`;
  const el = ui.odontoSvg?.querySelector(selector);
  if (el) {
    el.classList.remove(...Object.keys(estados).map((s) => `state-${s}`));
    el.classList.add(`state-${estado}`);
    el.setAttribute('fill', estados[estado] || estados.sano);
  }
}

function toothHasOnlyAusente(toothNumber) {
  return FACES.every((face) => getRecordState(toothNumber, face) === 'ausente');
}

function buildTooltipText(toothNumber) {
  const estados = FACES.map((f) => `${f}: ${getRecordState(toothNumber, f)}`).join(' | ');
  return `Pieza ${toothNumber}\n${estados}`;
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
      fill: estados[estado] || estados.sano,
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

  const affectAll =
    estadoSeleccionado === 'ausente' ||
    estadoSeleccionado === 'protesis_fija' ||
    estadoSeleccionado === 'protesis_removible';

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
  ui.odontoSelectedPiece.textContent = '-';
  ui.odontoSaveBtn.disabled = true;
  ui.odontoObservaciones.value = '';
  state.odontograma.metaDirty = false;
  ui.odontoModalLabel.textContent = 'Cargando odontograma...';

  const data = await getOdontogramaPaciente(pacienteId);
  await cargarReferenciasOdontograma();
  const paciente = data.paciente || {};
  ui.odontoModalLabel.textContent = `${paciente.apellido || ''}, ${paciente.nombre || ''} - DNI ${paciente.dni || '-'}`;

  (data.registros || []).forEach((r) => {
    state.odontograma.registros.set(`${r.diente}-${r.cara}`, r.estado);
  });

  state.odontograma.tratamientosByTooth = new Map();
  state.odontograma.protesisFijas = [];
  state.odontograma.protesisRemovibles = [];

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
  renderToothDetails();
}

async function cargarReferenciasOdontograma() {
  const data = await getOdontogramaReferencias();
  const referencias = data.referencias || [];
  referencias.forEach((ref) => { estados[ref.codigo] = ref.color; });
  if (ui.odontoEstadoClinico) {
    ui.odontoEstadoClinico.replaceChildren(...referencias.filter((ref) => ref.activa).map((ref) => {
      const option = document.createElement('option'); option.value = ref.codigo; option.textContent = ref.nombre; return option;
    }));
  }
  const list = document.getElementById('odontograma-referencias-list');
  if (list) {
    list.replaceChildren(...referencias.map((ref) => {
      const item = document.createElement('span'); item.className = 'badge border text-dark d-inline-flex align-items-center gap-1';
      item.style.borderLeft = `8px solid ${ref.color}`; item.append(document.createTextNode(`${ref.nombre}${ref.activa ? '' : ' (inactiva)'}`));
      const edit = document.createElement('button'); edit.type='button'; edit.className='btn btn-link btn-sm p-0'; edit.textContent='Editar';
      edit.addEventListener('click', async () => { const nombre=window.prompt('Nombre de la referencia',ref.nombre); if(!nombre)return; await updateOdontogramaReferencia(ref.id,{nombre,descripcion:ref.descripcion,color:ref.color}); await cargarReferenciasOdontograma(); });
      const toggle = document.createElement('button'); toggle.type='button'; toggle.className='btn btn-link btn-sm p-0'; toggle.textContent=ref.activa?'Inactivar':'Activar';
      toggle.addEventListener('click', async () => { await setOdontogramaReferenciaActiva(ref.id,!ref.activa); await cargarReferenciasOdontograma(); });
      item.append(edit,toggle); return item;
    }));
  }
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

  // Guardar todo el odontograma (todas las caras de todos los dientes cargados)
  const dientes = new Set();
  state.odontograma.registros.forEach((_, key) => {
    const [d] = key.split('-');
    const n = Number(d);
    if (Number.isInteger(n)) dientes.add(n);
  });

  if (dientes.size === 0) {
    renderAlert(ui.alertContainer, 'No hay datos de odontograma para guardar.', 'warning');
    return;
  }

  const registros = [];
  dientes.forEach((d) => {
    FACES.forEach((face) => {
      const estado = getRecordState(d, face);
      registros.push({
          diente: d,
          cara: face,
          estado,
      });
    });
  });

  await postOdontograma({ paciente_id: pacienteId, registros, meta: {
    sarro: metaPayload.sarro, periodontal: metaPayload.periodontal, observaciones: metaPayload.observaciones,
  } });
  state.odontograma.metaDirty = false;
  renderAlert(ui.alertContainer, 'Odontograma guardado correctamente.', 'success');
  updateCountExistentes();
}

function bindOdontograma() {
  document.getElementById('odontograma-referencia-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try { await createOdontogramaReferencia(Object.fromEntries(new FormData(event.currentTarget).entries())); event.currentTarget.reset(); await cargarReferenciasOdontograma(); }
    catch (error) { renderAlert(ui.alertContainer, error.message, 'danger'); }
  });
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
    const legend = `
      <ul class="legend">
        <li><span class="swatch sano"></span> Sano (blanco)</li>
        <li><span class="swatch existente"></span> Prestación existente (rojo)</li>
        <li><span class="swatch requerido"></span> Prestación requerida (azul)</li>
        <li><span class="swatch corona"></span> Corona (amarillo)</li>
        <li><span class="swatch fija"></span> Prótesis fija</li>
        <li><span class="swatch removible"></span> Prótesis removible</li>
        <li><span class="swatch ausente"></span> Ausente / a extraer</li>
      </ul>`;
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
  const tipoNacionalidad = document.getElementById('nacionalidad-tipo');
  tipoNacionalidad?.addEventListener('change', () => {
    configurarNacionalidad(tipoNacionalidad.value, '');
  });

  ['nombre', 'apellido'].forEach((field) => {
    const input = ui.createForm.elements[field];
    input?.addEventListener('beforeinput', (event) => {
      if (event.inputType === 'insertText' && event.data && /[^\p{L}\p{M} '\u2019-]/u.test(event.data)) event.preventDefault();
    });
    input?.addEventListener('input', (event) => {
      if (event.isComposing) return;
      const limpio = input.value.replace(/[^\p{L}\p{M} '\u2019-]/gu, '');
      if (limpio !== input.value) input.value = limpio;
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      input.nextElementSibling?.classList.contains('dynamic') && input.nextElementSibling.remove();
    });
  });

  document.getElementById('paciente-modal')?.addEventListener('hidden.bs.modal', () => {
    limpiarValidacionesPaciente();
    ui.createForm.reset();
    configurarNacionalidad('Argentina');
  });

  const fechaNacimiento = ui.createForm.elements.fecha_nacimiento;
  if (fechaNacimiento) fechaNacimiento.max = new Date().toISOString().slice(0, 10);

  const limpiarErrorDelCampo = (event) => {
    const input = event.target;
    if (!input?.classList?.contains('is-invalid')) return;
    input.classList.remove('is-invalid');
    input.removeAttribute('aria-invalid');
    if (input.nextElementSibling?.classList.contains('dynamic')) input.nextElementSibling.remove();
    if (!ui.createForm.querySelector('.is-invalid')) ui.pacienteFormStatus?.replaceChildren();
  };
  ui.createForm.addEventListener('input', limpiarErrorDelCampo);
  ui.createForm.addEventListener('change', limpiarErrorDelCampo);

  ui.createForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    limpiarValidacionesPaciente();
    if (!ui.createForm.checkValidity()) {
      const invalidos = Array.from(ui.createForm.elements).filter((element) => element.willValidate && !element.validity.valid);
      invalidos.forEach((input) => {
        let message = 'Revise este campo';
        if (input.validity.valueMissing) message = 'Este campo es obligatorio';
        else if (input.validity.typeMismatch) message = 'Ingrese un correo electrónico válido';
        else if (input.validity.rangeOverflow) message = 'La fecha no puede ser futura';
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        const feedback = document.createElement('div');
        feedback.className = 'invalid-feedback dynamic';
        feedback.textContent = message;
        input.insertAdjacentElement('afterend', feedback);
      });
      renderAlert(ui.pacienteFormStatus, 'Revisá los campos marcados antes de guardar.', 'danger');
      invalidos[0]?.focus();
      return;
    }

    const formData = new FormData(ui.createForm);
    const payload = Object.fromEntries(formData.entries());
    const pacienteId = payload.id;
    delete payload.id;

    payload.nacionalidad = tipoNacionalidad.value === 'Argentina' ? 'Argentina' : payload.nacionalidad;

    ['telefono', 'email', 'nacionalidad', 'domicilio', 'fecha_nacimiento', 'observaciones', 'alergias', 'condiciones', 'estado_tratamiento'].forEach((field) => {
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
    } catch (error) {
      renderAlert(ui.pacienteFormStatus, error.message, 'danger');
      Object.entries(error.errores || {}).forEach(([field, message]) => {
        const input = ui.createForm.elements[field];
        if (!input) return;
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        const feedback = document.createElement('div');
        feedback.className = 'invalid-feedback dynamic';
        feedback.textContent = message;
        input.insertAdjacentElement('afterend', feedback);
      });
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
        ui.fichaModalContent.innerHTML = '<div class="card border-0 shadow-sm"><div class="card-body text-secondary">Cargando ficha clínica...</div></div>';
        state.ficha = { pacienteId: id, page: 1, limit: 5, estado: '', sort: 'fecha:desc', total: 0, tab: 'resumen' };
        await loadFichaClinica();
      } catch (error) {
        ui.fichaView.classList.add('d-none');
        ui.pacientesListView.classList.remove('d-none');
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
