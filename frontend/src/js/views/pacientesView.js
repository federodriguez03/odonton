import {
  createPaciente,
  deleteDocumento,
  downloadDocumento,
  getFichaClinica,
  getDocumentos,
  getOdontogramaPaciente,
  getPacientes,
  postOdontograma,
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
  fichaModalContent: document.getElementById('ficha-modal-content'),
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
const fichaModal = window.bootstrap?.Modal.getOrCreateInstance(document.getElementById('ficha-modal'));
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
              <i class="bi bi-journal-medical me-1"></i>Ficha
            </button>
            <button class="btn btn-sm btn-outline-info" type="button" data-action="odontograma" data-id="${paciente.id}" aria-label="Gestionar odontograma">
              <i class="bi bi-grid-3x3-gap me-1"></i>Odonto
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

function openCreateModal() {
  state.mode = 'create';
  ui.modalTitle.textContent = 'Nuevo paciente';
  ui.modalSubmitButton.textContent = 'Guardar paciente';
  ui.pacienteIdInput.value = '';
  ui.createForm.reset();
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
  ui.createForm.elements.nacionalidad.value = paciente.nacionalidad || '';
  ui.createForm.elements.domicilio.value = paciente.domicilio || '';
  ui.createForm.elements.fecha_nacimiento.value = paciente.fecha_nacimiento ? String(paciente.fecha_nacimiento).slice(0, 10) : '';
  ui.createForm.elements.observaciones.value = paciente.observaciones || '';
  pacienteModal?.show();
}

function renderFichaContent(data) {
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

function renderDocumentosFicha(documentos = []) {
  const tbody = document.getElementById('ficha-documentos-tbody');
  if (!tbody) return;

  if (!documentos.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">Sin documentos</td></tr>';
    return;
  }

  tbody.innerHTML = documentos
    .map((doc) => `
        <tr>
          <td>${doc.nombre_archivo}</td>
          <td>${doc.tipo_archivo}</td>
          <td>${doc.descripcion || '-'}</td>
          <td>${formatDate(doc.fecha_subida)}</td>
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

  const requests = [];
  dientes.forEach((d) => {
    FACES.forEach((face) => {
      const estado = getRecordState(d, face);
      requests.push(
        postOdontograma({
          paciente_id: pacienteId,
          diente: d,
          cara: face,
          estado,
          ...metaPayload,
        }),
      );
    });
  });

  await Promise.all(requests);
  state.odontograma.metaDirty = false;
  renderAlert(ui.alertContainer, 'Odontograma guardado correctamente.', 'success');
  updateCountExistentes();
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
  ui.createForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(ui.createForm);
    const payload = Object.fromEntries(formData.entries());
    const pacienteId = payload.id;
    delete payload.id;

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
    } catch (error) {
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
        ui.fichaModalContent.innerHTML = '<p class="text-secondary mb-0">Cargando...</p>';
        fichaModal?.show();
        state.ficha = { pacienteId: id, page: 1, limit: 5, estado: '', sort: 'fecha:desc', total: 0 };
        await loadFichaClinica();
      } catch (error) {
        fichaModal?.hide();
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
