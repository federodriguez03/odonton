import {
  cancelarTurno,
  confirmarSolicitudTurno,
  createTurno,
  getDisponibilidadTurnos,
  enviarRecordatorioWhatsappTurno,
  getPacientes,
  getPrestaciones,
  getProfesionalesTurnos,
  getTurnos,
  rechazarSolicitudTurno,
  reprogramarTurno,
  updateTurno,
} from '../api.js';
import { renderAlert } from '../components/alerts.js';
import { checkboxToBoolean } from '../utils/booleans.js';

const CLINIC_TIME_ZONE = 'America/Buenos_Aires';

const state = {
  page: 1,
  limit: 10,
  total: 0,
  estado: '',
  pacienteQuery: '',
  fechaDesde: '',
  fechaHasta: '',
  calendarWeekStart: null,
  calendarTurnos: [],
  calendarDay: null,
  calendarDayTurnos: [],
  calendarMode: 'day',
  disponibilidad: [],
  disponibilidadLoading: false,
  selectedSlot: null,
  editDisponibilidad: [],
  editDisponibilidadLoading: false,
  editSelectedSlot: null,
  editCurrentTurno: null,
  detailCurrentTurno: null,
  prestacionesCatalogo: [],
  selectedPrestaciones: [],
  editSelectedPrestaciones: [],
  pacienteSearchRequest: { create: 0, edit: 0 },
};
let agendaOptions = { propia: false, profesionalPerfilId: null };
let autoRefreshTimer = null;
let autoRefreshInFlight = false;
let viewRefreshPromise = null;
const AUTO_REFRESH_INTERVAL_MS = 25000;

const ui = {
  alertContainer: document.getElementById('alert-container'),
  tbody: document.getElementById('turnos-tbody'),
  paginationMeta: document.getElementById('turnos-pagination-meta'),
  prevButton: document.getElementById('turnos-prev-page'),
  nextButton: document.getElementById('turnos-next-page'),
  filterForm: document.getElementById('turnos-filter-form'),
  quickRangeInput: document.getElementById('turnos-quick-range'),
  estadoInput: document.getElementById('turnos-filter-estado'),
  pacienteInput: document.getElementById('turnos-filter-paciente'),
  desdeInput: document.getElementById('turnos-filter-desde'),
  hastaInput: document.getElementById('turnos-filter-hasta'),
  clearFiltersButton: document.getElementById('turnos-clear-filters'),
  openCreateModalButton: document.getElementById('open-create-turno-modal'),
  goPacientesButton: document.getElementById('turno-go-pacientes'),
  createForm: document.getElementById('create-turno-form'),
  pacienteSelect: document.getElementById('turno-paciente-id'),
  pacienteSearch: document.getElementById('turno-paciente-search'),
  pacienteResults: document.getElementById('turno-paciente-results'),
  profesionalSelect: document.getElementById('turno-profesional-id'),
  prestacionSelect: document.getElementById('turno-prestacion-id'),
  prestacionSearch: document.getElementById('turno-prestacion-search'),
  prestacionResults: document.getElementById('turno-prestacion-results'),
  prestacionesSelected: document.getElementById('turno-prestaciones-selected'),
  duracionTotal: document.getElementById('turno-duracion-total'),
  duracionInput: document.getElementById('turno-duracion'),
  fechaDiaInput: document.getElementById('turno-fecha-dia'),
  fechaInicioInput: document.getElementById('turno-fecha-inicio'),
  fechaFinInput: document.getElementById('turno-fecha-fin'),
  disponibilidadStatus: document.getElementById('turno-disponibilidad-status'),
  disponibilidadGrid: document.getElementById('turno-disponibilidad-grid'),
  selectedSlotLabel: document.getElementById('turno-selected-slot-label'),
  submitButton: document.getElementById('turno-submit-btn'),
  recordatorioCheckbox: document.getElementById('turno-recordatorio-habilitado'),
  editForm: document.getElementById('edit-turno-form'),
  editModalLabel: document.getElementById('turno-edit-modal-label'),
  editIdInput: document.getElementById('edit-turno-id'),
  editPacienteSelect: document.getElementById('edit-turno-paciente-id'),
  editPacienteSearch: document.getElementById('edit-turno-paciente-search'),
  editPacienteResults: document.getElementById('edit-turno-paciente-results'),
  editProfesionalSelect: document.getElementById('edit-turno-profesional-id'),
  editPrestacionSelect: document.getElementById('edit-turno-prestacion-id'),
  editPrestacionSearch: document.getElementById('edit-turno-prestacion-search'),
  editPrestacionResults: document.getElementById('edit-turno-prestacion-results'),
  editPrestacionesSelected: document.getElementById('edit-turno-prestaciones-selected'),
  editDuracionTotal: document.getElementById('edit-turno-duracion-total'),
  editFechaDiaInput: document.getElementById('edit-turno-fecha-dia'),
  editFechaInput: document.getElementById('edit-turno-fecha-inicio'),
  editDuracionInput: document.getElementById('edit-turno-duracion'),
  editDisponibilidadStatus: document.getElementById('edit-turno-disponibilidad-status'),
  editDisponibilidadGrid: document.getElementById('edit-turno-disponibilidad-grid'),
  editSelectedSlotLabel: document.getElementById('edit-turno-selected-slot-label'),
  editSubmitButton: document.getElementById('edit-turno-submit-btn'),
  editObservacionesInput: document.getElementById('edit-turno-observaciones'),
  editRecordatorioCheckbox: document.getElementById('edit-turno-recordatorio-habilitado'),
  detailContent: document.getElementById('turno-detail-content'),
  detailEditButton: document.getElementById('turno-detail-edit'),
  detailCancelButton: document.getElementById('turno-detail-cancel'),
  calendarPrevWeekButton: document.getElementById('calendar-prev-week'),
  calendarTodayWeekButton: document.getElementById('calendar-today-week'),
  calendarNextWeekButton: document.getElementById('calendar-next-week'),
  calendarWeekLabel: document.getElementById('calendar-week-label'),
  calendarWeekHead: document.getElementById('calendar-week-head'),
  calendarWeekBody: document.getElementById('calendar-week-body'),
  calendarModeDayButton: document.getElementById('calendar-mode-day'),
  calendarModeWeekButton: document.getElementById('calendar-mode-week'),
  calendarDaySection: document.getElementById('calendar-day-section'),
  calendarWeekSection: document.getElementById('calendar-week-section'),
  calendarPrevDayButton: document.getElementById('calendar-prev-day'),
  calendarTodayDayButton: document.getElementById('calendar-today-day'),
  calendarNextDayButton: document.getElementById('calendar-next-day'),
  calendarDayLabel: document.getElementById('calendar-day-label'),
  calendarDayHead: document.getElementById('calendar-day-head'),
  calendarDayBody: document.getElementById('calendar-day-body'),
};

const turnoModalElement = document.getElementById('turno-modal');
const turnoEditModalElement = document.getElementById('turno-edit-modal');
const turnoDetailModalElement = document.getElementById('turno-detail-modal');

const turnoModal =
  window.bootstrap && turnoModalElement
    ? window.bootstrap.Modal.getOrCreateInstance(turnoModalElement)
    : null;

const turnoEditModal =
  window.bootstrap && turnoEditModalElement
    ? window.bootstrap.Modal.getOrCreateInstance(turnoEditModalElement)
    : null;

const turnoDetailModal =
  window.bootstrap && turnoDetailModalElement
    ? window.bootstrap.Modal.getOrCreateInstance(turnoDetailModalElement)
    : null;

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-AR', {
    timeZone: CLINIC_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateAr(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR', {
    timeZone: CLINIC_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: options.year || undefined,
    weekday: options.weekday || undefined,
  });
}

function formatTimeAr(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('es-AR', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateForApi(date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function clinicDateTimeParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function startOfWeek(date) {
  const copy = new Date(date);
  copy.setUTCHours(12, 0, 0, 0);
  const day = copy.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + offsetToMonday);
  return copy;
}

function todayClinicDate() {
  const [year, month, day] = formatDateForApi(new Date()).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function buildWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setUTCDate(weekStart.getUTCDate() + i);
    return day;
  });
}

function formatPaciente(turno) {
  const apellido = turno?.paciente?.apellido || '';
  const nombre = turno?.paciente?.nombre || '';
  const fullName = [apellido, nombre].filter(Boolean).join(', ');
  const dni = turno?.paciente?.dni ? ` (${turno.paciente.dni})` : '';
  return fullName ? `${fullName}${dni}` : '-';
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchPacienteQuery(turno, query) {
  const q = normalizeText(query);
  if (!q) return true;

  const nombre = normalizeText(turno?.paciente?.nombre);
  const apellido = normalizeText(turno?.paciente?.apellido);
  const dni = normalizeText(turno?.paciente?.dni);

  return nombre.includes(q) || apellido.includes(q) || dni.includes(q);
}

function formatForDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function formatForDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatDateForApi(date);
}

function formatTimeForSlot(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-AR', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
}

function calcularDuracionMinutos(turno) {
  if (!turno?.fecha_hora_inicio && !turno?.fechaHoraInicio) return '';
  if (!turno?.fecha_hora_fin && !turno?.fechaHoraFin) return '';
  const inicio = new Date(turno.fecha_hora_inicio || turno.fechaHoraInicio);
  const fin = new Date(turno.fecha_hora_fin || turno.fechaHoraFin);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return '';
  return Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 60000));
}

function isPendingClinicalRegistration(turno) {
  if (normalizeText(turno?.estado) !== 'confirmado' || !turno?.fecha_hora_fin) return false;
  const end = new Date(turno.fecha_hora_fin);
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
}

function getEstadoInfo(turnoOrEstado) {
  const turno = typeof turnoOrEstado === 'object' ? turnoOrEstado : null;
  if (turno && isPendingClinicalRegistration(turno)) {
    return { label: 'Pendiente de registrar atención', className: 'confirmado' };
  }
  const estado = turno?.estado ?? turnoOrEstado;
  const normalized = normalizeText(estado || 'programado');
  const map = {
    solicitado: { label: 'Solicitado', className: 'solicitado' },
    programado: { label: 'Programado', className: 'programado' },
    confirmado: { label: 'Confirmado', className: 'confirmado' },
    cancelado: { label: 'Cancelado', className: 'cancelado' },
    atendido: { label: 'Atendido', className: 'atendido' },
    realizado: { label: 'Atendido', className: 'atendido' },
    reprogramado: { label: 'Reprogramado', className: 'reprogramado' },
    reprogramacion_solicitada: { label: 'Reprogramación solicitada', className: 'reprogramado' },
    cancelacion_solicitada: { label: 'Cancelación solicitada', className: 'cancelado' },
    rechazado: { label: 'Rechazado', className: 'rechazado' },
  };
  return map[normalized] || { label: estado || 'Sin estado', className: 'programado' };
}

function canEditTurno(turno) {
  return ['solicitado', 'programado', 'confirmado', 'reprogramado', 'reprogramacion_solicitada'].includes(turno?.estado);
}

function canCancelTurno(turno) {
  return ['programado', 'confirmado', 'reprogramado', 'reprogramacion_solicitada', 'cancelacion_solicitada'].includes(turno?.estado);
}

function canRejectSolicitud(turno) {
  return ['solicitado', 'reprogramacion_solicitada', 'cancelacion_solicitada'].includes(turno?.estado);
}

function canSendWhatsAppReminder(turno) {
  return ['programado', 'confirmado'].includes(turno?.estado);
}

function editActionLabel(turno) {
  if (turno?.estado === 'solicitado') return 'Confirmar';
  if (turno?.estado === 'reprogramacion_solicitada') return 'Reprogramar';
  return 'Editar';
}

function getOperationFeedback(response, fallbackMessage) {
  const warning = response?.notificacion?.advertencia
    || (Array.isArray(response?.advertencias) ? response.advertencias[0] : null)
    || response?.advertencia
    || null;
  const message = response?.mensaje || fallbackMessage;

  return {
    message: warning ? `${message}, pero ${warning}` : message,
    type: warning ? 'warning' : 'success',
  };
}

function serializeTurno(turno) {
  return encodeURIComponent(
    JSON.stringify({
      id: turno.id,
      pacienteId: turno?.paciente?.id,
      paciente: turno?.paciente || null,
      pacienteTelefono: turno?.paciente?.telefono,
      prestacionId: turno?.prestacion?.id,
      prestacion: turno?.prestacion || null,
      prestaciones: turno?.prestaciones || [],
      prestacionIds: (turno?.prestaciones || []).map((item) => item.id),
      profesionalId: turno?.profesional?.id,
      profesional: turno?.profesional || null,
      fechaHoraInicio: turno.fecha_hora_inicio,
      fechaHoraFin: turno.fecha_hora_fin,
      observaciones: turno.observaciones || '',
      solicitudPreferencia: turno.solicitud_preferencia || '',
      recordatorioHabilitado: turno.recordatorio_habilitado !== false,
      estado: turno.estado,
    }),
  );
}

function renderCalendarTurnoCard(turno) {
  const estado = getEstadoInfo(turno);
  const timeRange = `${formatTimeAr(turno.fecha_hora_inicio)} - ${formatTimeAr(turno.fecha_hora_fin)}`;
  const paciente = formatPaciente(turno);
  const prestacion = turno?.prestacion?.nombre || '-';
  const profesional = turno?.profesional?.nombre || turno?.profesional?.email || '-';
  const actionLabel = canEditTurno(turno) ? editActionLabel(turno) : 'Ver detalle';

  return `
    <button
      class="calendar-turno calendar-turno-${estado.className}"
      type="button"
      data-calendar-action="turno"
      data-turno="${serializeTurno(turno)}"
      title="${escapeHtml(`${timeRange} | ${paciente} | ${prestacion}`)}"
    >
      <span class="calendar-turno-head">
        <span class="calendar-turno-time">${escapeHtml(timeRange)}</span>
        <span class="calendar-turno-status">${escapeHtml(estado.label)}</span>
      </span>
      <span class="calendar-turno-patient">${escapeHtml(paciente)}</span>
      <span class="calendar-turno-meta">${escapeHtml(prestacion)}</span>
      <span class="calendar-turno-meta">${escapeHtml(profesional)}</span>
      <span class="calendar-turno-action">${actionLabel}</span>
    </button>
  `;
}

function showCalendarTurnoDetail(turno) {
  if (!turno || !ui.detailContent) return;
  state.detailCurrentTurno = turno;
  const estado = getEstadoInfo(turno);
  const inicio = turno.fechaHoraInicio || turno.fecha_hora_inicio;
  const fin = turno.fechaHoraFin || turno.fecha_hora_fin;
  const observaciones = turno.observaciones || '-';

  ui.detailContent.innerHTML = `
    <dl class="row mb-0">
      <dt class="col-sm-4">Paciente</dt>
      <dd class="col-sm-8">${escapeHtml(formatPaciente(turno))}</dd>
      <dt class="col-sm-4">Prestación</dt>
      <dd class="col-sm-8">${escapeHtml(turno?.prestacion?.nombre || '-')}</dd>
      <dt class="col-sm-4">Fecha</dt>
      <dd class="col-sm-8">${escapeHtml(formatDateAr(inicio, { year: 'numeric' }))}</dd>
      <dt class="col-sm-4">Hora de inicio</dt>
      <dd class="col-sm-8">${escapeHtml(formatTimeAr(inicio))}</dd>
      <dt class="col-sm-4">Hora de fin</dt>
      <dd class="col-sm-8">${escapeHtml(formatTimeAr(fin))}</dd>
      <dt class="col-sm-4">Estado</dt>
      <dd class="col-sm-8"><span class="badge text-bg-light border">${escapeHtml(estado.label)}</span></dd>
      <dt class="col-sm-4">Observaciones</dt>
      <dd class="col-sm-8 text-break">${escapeHtml(observaciones)}</dd>
    </dl>
  `;

  if (ui.detailEditButton) {
    ui.detailEditButton.classList.toggle('d-none', !canEditTurno(turno));
    ui.detailEditButton.textContent = editActionLabel(turno);
  }
  if (ui.detailCancelButton) {
    ui.detailCancelButton.classList.toggle('d-none', !canCancelTurno(turno));
  }
  turnoDetailModal?.show();
}

function getRecordatorioBadge(turno) {
  if (turno.respuesta_paciente) {
    return `<span class="badge bg-info-subtle text-info-emphasis border">Respondio: ${turno.respuesta_paciente}</span>`;
  }

  if (turno.recordatorio_estado === 'enviado') {
    return '<span class="badge bg-success-subtle text-success-emphasis border">WhatsApp enviado</span>';
  }

  if (turno.recordatorio_estado === 'error') {
    return '<span class="badge bg-danger-subtle text-danger-emphasis border">Error WhatsApp</span>';
  }

  return '<span class="badge text-bg-light border">Sin enviar</span>';
}

function renderRows(turnos) {
  if (!turnos.length) {
    ui.tbody.innerHTML = '<tr><td colspan="9" class="text-center text-secondary">Sin turnos</td></tr>';
    return;
  }

  ui.tbody.innerHTML = turnos
    .map((turno) => {
      const isSolicitud = turno.estado === 'solicitado';
      const isCancelacionSolicitada = turno.estado === 'cancelacion_solicitada';
      const canCancel = canCancelTurno(turno);
      const canEdit = canEditTurno(turno);
      const canReject = canRejectSolicitud(turno);
      const canSendReminder = canSendWhatsAppReminder(turno);
      const turnoData = serializeTurno(turno);
      const primaryAction = isSolicitud ? 'confirmar-solicitud' : 'editar';
      const primaryLabel = editActionLabel(turno);

      return `
      <tr>
        <td>${turno.id}</td>
        <td>${formatPaciente(turno)}</td>
        <td>${turno?.prestacion?.nombre || `#${turno?.prestacion?.id || '-'}`}</td>
        <td>${turno?.profesional?.nombre || turno?.profesional?.email || '-'}</td>
        <td>${formatDateTime(turno.fecha_hora_inicio)}</td>
        <td>${formatDateTime(turno.fecha_hora_fin)}</td>
        <td><span class="badge text-bg-light border">${getEstadoInfo(turno).label}</span></td>
        <td>${getRecordatorioBadge(turno)}</td>
        <td class="text-end">
          <div class="btn-group">
            <button
              class="btn btn-sm btn-outline-secondary"
              type="button"
              data-action="ver-detalle"
              data-turno="${turnoData}"
            >
              <i class="bi bi-eye me-1"></i>Ver detalle
            </button>
            ${!isCancelacionSolicitada ? `
            <button
              class="btn btn-sm btn-outline-secondary"
              type="button"
              data-action="${primaryAction}"
              data-turno="${turnoData}"
              ${canEdit ? '' : 'disabled'}
            >
              <i class="bi bi-pencil-square me-1"></i>${primaryLabel}
            </button>` : ''}
            ${canReject ? `
            <button
              class="btn btn-sm btn-outline-warning"
              type="button"
              data-action="rechazar-solicitud"
              data-id="${turno.id}"
            >
              <i class="bi bi-x-octagon me-1"></i>Rechazar solicitud
            </button>` : ''}
            <button
              class="btn btn-sm btn-outline-danger"
              type="button"
              data-action="cancelar"
              data-id="${turno.id}"
              ${canCancel ? '' : 'disabled'}
            >
              <i class="bi bi-x-circle me-1"></i>${isCancelacionSolicitada ? 'Cancelar turno' : 'Cancelar'}
            </button>
            ${canSendReminder ? `
            <button
              class="btn btn-sm btn-outline-success"
              type="button"
              data-action="whatsapp"
              data-id="${turno.id}"
            >
              <i class="bi bi-whatsapp me-1"></i>WhatsApp
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  ui.paginationMeta.textContent = `Pagina ${state.page} de ${totalPages} | Total: ${state.total}`;
  ui.prevButton.disabled = state.page <= 1;
  ui.nextButton.disabled = state.page >= totalPages;
}

async function loadTurnos({ silent = false } = {}) {
  try {
    const isPacienteQuery = Boolean(state.pacienteQuery);
    const effectivePage = isPacienteQuery ? 1 : state.page;
    const data = await getTurnos({
      page: effectivePage,
      limit: isPacienteQuery ? 500 : state.limit,
      estado: state.estado,
      q: state.pacienteQuery || undefined,
      fecha_desde: state.fechaDesde || undefined,
      fecha_hasta: state.fechaHasta || undefined,
      sort: 'created_at:desc',
    });

    const allTurnos = (data.turnos || []).filter((turno) => matchPacienteQuery(turno, state.pacienteQuery));
    state.total = isPacienteQuery ? allTurnos.length : Number(data.total || 0);

    if (isPacienteQuery) {
      const start = (state.page - 1) * state.limit;
      const end = start + state.limit;
      renderRows(allTurnos.slice(start, end));
    } else {
      renderRows(allTurnos);
    }
    renderPagination();
  } catch (error) {
    if (silent) throw error;
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

async function loadWeeklyCalendar({ silent = false } = {}) {
  try {
    if (!state.calendarWeekStart) {
      state.calendarWeekStart = startOfWeek(todayClinicDate());
    }

    const weekStart = new Date(state.calendarWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    const data = await getTurnos({
      page: 1,
      limit: 500,
      estado: state.estado || undefined,
      q: state.pacienteQuery || undefined,
      fecha_desde: formatDateForApi(weekStart),
      fecha_hasta: formatDateForApi(weekEnd),
      sort: 'fecha_hora_inicio:asc',
    });

    state.calendarTurnos = (data.turnos || []).filter((turno) => matchPacienteQuery(turno, state.pacienteQuery));
    renderWeeklyCalendar();
  } catch (error) {
    if (silent) throw error;
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function renderWeeklyCalendar() {
  const weekStart = state.calendarWeekStart || startOfWeek(todayClinicDate());
  const weekDays = buildWeekDays(weekStart);
  const weekEnd = weekDays[6];

  ui.calendarWeekLabel.textContent = `${formatDateAr(weekStart, { year: 'numeric' })} - ${formatDateAr(weekEnd, { year: 'numeric' })}`;

  const headCols = weekDays
    .map((day) => {
      const weekday = day.toLocaleDateString('es-AR', { weekday: 'short' });
      const dayNum = formatDateAr(day);
      const todayClass = formatDateForApi(day) === formatDateForApi(new Date()) ? ' calendar-today-col' : '';
      return `<th class="${todayClass.trim()}"><span class="calendar-weekday">${weekday}</span><span class="calendar-date">${dayNum}</span></th>`;
    })
    .join('');
  ui.calendarWeekHead.innerHTML = `<tr><th class="calendar-hour-head">Hora</th>${headCols}</tr>`;

  const agendaByStartHour = new Map();
  (state.calendarTurnos || []).forEach((turno) => {
    const start = new Date(turno.fecha_hora_inicio);
    if (Number.isNaN(start.getTime())) return;
    const parts = clinicDateTimeParts(start);
    const key = `${parts.year}-${parts.month}-${parts.day}-${Number(parts.hour)}`;
    const current = agendaByStartHour.get(key) || [];
    current.push(turno);
    agendaByStartHour.set(key, current);
  });

  const startHour = 8;
  const endHour = 20;
  const rows = [];

  for (let hour = startHour; hour < endHour; hour += 1) {
    const hourLabel = `${String(hour).padStart(2, '0')}:00`;
    const dayCells = weekDays
      .map((day) => {
        const key = `${formatDateForApi(day)}-${hour}`;
        const items = agendaByStartHour.get(key) || [];
        const todayClass = formatDateForApi(day) === formatDateForApi(new Date()) ? ' calendar-today-cell' : '';

        if (!items.length) {
          return `<td class="calendar-empty-cell${todayClass}"></td>`;
        }

        const html = items
          .sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio))
          .map((turno) => renderCalendarTurnoCard(turno))
          .join('');

        return `<td class="calendar-turnos-cell${todayClass}">${html}</td>`;
      })
      .join('');

    rows.push(`<tr><th class="calendar-hour-cell">${hourLabel}</th>${dayCells}</tr>`);
  }

  ui.calendarWeekBody.innerHTML = rows.join('');
}

async function loadDailyCalendar({ silent = false } = {}) {
  try {
    if (!state.calendarDay) {
      state.calendarDay = todayClinicDate();
    }

    const day = new Date(state.calendarDay);
    const dayDate = formatDateForApi(day);

    const data = await getTurnos({
      page: 1,
      limit: 200,
      estado: state.estado || undefined,
      q: state.pacienteQuery || undefined,
      fecha_desde: dayDate,
      fecha_hasta: dayDate,
      sort: 'fecha_hora_inicio:asc',
    });

    state.calendarDayTurnos = (data.turnos || []).filter((turno) => matchPacienteQuery(turno, state.pacienteQuery));
    renderDailyCalendar();
  } catch (error) {
    if (silent) throw error;
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function renderDailyCalendar() {
  const day = state.calendarDay || todayClinicDate();
  ui.calendarDayLabel.textContent = formatDateAr(day, { weekday: 'long', year: 'numeric' });

  ui.calendarDayHead.innerHTML = `<tr><th class="calendar-hour-head">Hora</th><th>Turnos del dia</th></tr>`;

  const agendaByStartHour = new Map();
  (state.calendarDayTurnos || []).forEach((turno) => {
    const start = new Date(turno.fecha_hora_inicio);
    if (Number.isNaN(start.getTime())) return;
    const key = `${Number(clinicDateTimeParts(start).hour)}`;
    const current = agendaByStartHour.get(key) || [];
    current.push(turno);
    agendaByStartHour.set(key, current);
  });

  const startHour = 8;
  const endHour = 20;
  const rows = [];

  for (let hour = startHour; hour < endHour; hour += 1) {
    const hourLabel = `${String(hour).padStart(2, '0')}:00`;
    const items = agendaByStartHour.get(String(hour)) || [];

    const cell = items.length
      ? items
          .sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio))
          .map((turno) => renderCalendarTurnoCard(turno))
          .join('')
      : '<span class="calendar-empty-copy">Sin turnos</span>';

    rows.push(`<tr><th class="calendar-hour-cell">${hourLabel}</th><td class="calendar-turnos-cell">${cell}</td></tr>`);
  }

  ui.calendarDayBody.innerHTML = rows.join('');
}

function pacienteLabel(paciente) {
  return `${paciente.apellido}, ${paciente.nombre} (${paciente.dni})`;
}

async function buscarPacientesTurno(mode, query, requestId) {
  const results = mode === 'edit' ? ui.editPacienteResults : ui.pacienteResults;
  if (query.trim().length < 2) { results.innerHTML = ''; return; }
  const data = await getPacientes({ page: 1, limit: 20, q: query.trim(), sort: 'apellido:asc' });
  if (requestId !== state.pacienteSearchRequest[mode]) return;
  results.innerHTML = (data.pacientes || []).map((paciente) =>
    `<button type="button" class="turno-search-option" data-paciente-id="${paciente.id}" data-paciente-label="${escapeHtml(pacienteLabel(paciente))}">${escapeHtml(pacienteLabel(paciente))}</button>`
  ).join('') || '<div class="small text-secondary p-2">Sin resultados</div>';
}

function renderProfesionalesOptions(profesionales) {
  const lista = profesionales || [];
  const options = lista
    .map((profesional) => {
      const label = profesional.nombre || profesional.email || `Profesional #${profesional.id}`;
      const email = profesional.email && profesional.nombre ? ` (${profesional.email})` : '';
      return `<option value="${profesional.id}">${label}${email}</option>`;
    })
    .join('');

  const placeholder = lista.length
    ? 'Seleccionar profesional'
    : 'No hay perfiles profesionales confirmados y activos';
  ui.profesionalSelect.innerHTML = `<option value="">${placeholder}</option>${options}`;
  ui.editProfesionalSelect.innerHTML = `<option value="">${placeholder}</option>${options}`;
  if (agendaOptions.propia && agendaOptions.profesionalPerfilId) {
    const perfilId = String(agendaOptions.profesionalPerfilId);
    ui.profesionalSelect.value = perfilId;
    ui.editProfesionalSelect.value = perfilId;
    ui.profesionalSelect.disabled = true;
    ui.editProfesionalSelect.disabled = true;
  }
}

async function loadProfesionalesForSelect() {
  try {
    const data = await getProfesionalesTurnos();
    renderProfesionalesOptions(data.profesionales || []);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

async function loadPacientesForSelect() {}

function renderPrestacionesOptions(prestaciones) {
  const uniqueByName = new Map();
  (prestaciones || []).forEach((prestacion) => {
    const key = String(prestacion?.nombre || '').trim().toLowerCase();
    if (!key || uniqueByName.has(key)) return;
    uniqueByName.set(key, prestacion);
  });

  state.prestacionesCatalogo = Array.from(uniqueByName.values());
  renderPrestacionPicker('create');
  renderPrestacionPicker('edit');
}

function selectedPrestaciones(mode) { return mode === 'edit' ? state.editSelectedPrestaciones : state.selectedPrestaciones; }

function renderPrestacionPicker(mode) {
  const edit = mode === 'edit';
  const search = edit ? ui.editPrestacionSearch : ui.prestacionSearch;
  const results = edit ? ui.editPrestacionResults : ui.prestacionResults;
  const chips = edit ? ui.editPrestacionesSelected : ui.prestacionesSelected;
  const total = edit ? ui.editDuracionTotal : ui.duracionTotal;
  const selected = selectedPrestaciones(mode);
  const query = normalizeText(search?.value);
  results.innerHTML = state.prestacionesCatalogo
    .filter((item) => !selected.some((selectedItem) => Number(selectedItem.id) === Number(item.id)) && (normalizeText(item.nombre).includes(query) || normalizeText(item.codigo).includes(query)))
    .slice(0, 12)
    .map((item) => `<button type="button" class="turno-search-option" data-prestacion-id="${item.id}">${item.codigo ? `${escapeHtml(item.codigo)} · ` : ''}${escapeHtml(item.nombre)} · ${item.duracion_minutos} min</button>`).join('');
  chips.innerHTML = selected.map((item) => `<span class="turno-prestacion-chip">${escapeHtml(item.nombre)} · ${item.duracion_minutos} min <button type="button" aria-label="Quitar ${escapeHtml(item.nombre)}" data-remove-prestacion="${item.id}">×</button></span>`).join('');
  total.textContent = `${selected.reduce((sum, item) => sum + Number(item.duracion_minutos), 0)} min`;
}

async function loadPrestacionesForSelect() {
  try {
    const data = await getPrestaciones();
    renderPrestacionesOptions(data.prestaciones || []);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function resetDisponibilidad() {
  state.disponibilidad = [];
  state.selectedSlot = null;
  ui.fechaInicioInput.value = '';
  ui.fechaFinInput.value = '';
  ui.selectedSlotLabel.textContent = 'Selecciona un horario disponible';
  ui.disponibilidadGrid.innerHTML = '';
  ui.disponibilidadStatus.textContent = 'Elegí profesional, tratamiento y día para ver horarios.';
  ui.submitButton.disabled = true;
}

function renderDisponibilidad() {
  if (state.disponibilidadLoading) {
    ui.disponibilidadStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Consultando disponibilidad...';
    ui.disponibilidadGrid.innerHTML = '';
    ui.submitButton.disabled = true;
    return;
  }

  if (!state.disponibilidad.length) {
    ui.disponibilidadStatus.textContent = 'No hay horarios disponibles para los datos seleccionados.';
    ui.disponibilidadGrid.innerHTML = '';
    ui.submitButton.disabled = true;
    return;
  }

  const disponibles = state.disponibilidad.filter((slot) => slot.disponible).length;
  ui.disponibilidadStatus.textContent = `${disponibles} horarios disponibles`;
  ui.disponibilidadGrid.innerHTML = state.disponibilidad
    .map((slot) => {
      const selected = state.selectedSlot?.inicio === slot.inicio && state.selectedSlot?.fin === slot.fin;
      return `
        <button
          type="button"
          class="btn btn-sm ${selected ? 'btn-primary' : 'btn-outline-primary'} turno-slot-btn"
          data-inicio="${slot.inicio}"
          data-fin="${slot.fin}"
          data-fecha-hora-inicio="${slot.fecha_hora_inicio || ''}"
          data-fecha-hora-fin="${slot.fecha_hora_fin || ''}"
          ${slot.disponible ? '' : 'disabled'}
        >
          ${slot.inicio} - ${slot.fin}
        </button>
      `;
    })
    .join('');
  ui.submitButton.disabled = !state.selectedSlot;
}

async function loadDisponibilidad() {
  const profesionalId = ui.profesionalSelect.value;
  const prestacionIds = state.selectedPrestaciones.map((item) => item.id);
  const fecha = ui.fechaDiaInput.value;

  state.selectedSlot = null;
  ui.fechaInicioInput.value = '';
  ui.fechaFinInput.value = '';
  ui.selectedSlotLabel.textContent = 'Selecciona un horario disponible';

  if (!profesionalId || !prestacionIds.length || !fecha) {
    resetDisponibilidad();
    return;
  }

  try {
    state.disponibilidadLoading = true;
    renderDisponibilidad();
    state.disponibilidad = await getDisponibilidadTurnos({
      profesional_perfil_id: profesionalId,
      fecha,
      prestacion_ids: prestacionIds.join(','),
      duracion_minutos: ui.duracionInput.value || undefined,
    });
  } catch (error) {
    state.disponibilidad = [];
    renderAlert(ui.alertContainer, error.message, 'danger');
  } finally {
    state.disponibilidadLoading = false;
    renderDisponibilidad();
  }
}

function resetEditDisponibilidad() {
  state.editDisponibilidad = [];
  state.editSelectedSlot = null;
  ui.editFechaInput.value = '';
  ui.editSelectedSlotLabel.textContent = 'Selecciona un horario disponible';
  ui.editDisponibilidadGrid.innerHTML = '';
  ui.editDisponibilidadStatus.textContent = 'Elegí profesional, tratamiento y día para ver horarios.';
  ui.editSubmitButton.disabled = true;
}

function renderEditDisponibilidad() {
  if (state.editDisponibilidadLoading) {
    ui.editDisponibilidadStatus.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Consultando disponibilidad...';
    ui.editDisponibilidadGrid.innerHTML = '';
    ui.editSubmitButton.disabled = true;
    return;
  }

  if (!state.editDisponibilidad.length) {
    ui.editDisponibilidadStatus.textContent = 'No hay horarios disponibles para los datos seleccionados.';
    ui.editDisponibilidadGrid.innerHTML = '';
    ui.editSubmitButton.disabled = true;
    return;
  }

  const disponibles = state.editDisponibilidad.filter((slot) => slot.disponible).length;
  ui.editDisponibilidadStatus.textContent = `${disponibles} horarios disponibles`;
  ui.editDisponibilidadGrid.innerHTML = state.editDisponibilidad
    .map((slot) => {
      const selected = state.editSelectedSlot?.inicio === slot.inicio && state.editSelectedSlot?.fin === slot.fin;
      return `
        <button
          type="button"
          class="btn btn-sm ${selected ? 'btn-primary' : 'btn-outline-primary'} turno-edit-slot-btn"
          data-inicio="${slot.inicio}"
          data-fin="${slot.fin}"
          data-fecha-hora-inicio="${slot.fecha_hora_inicio || ''}"
          data-fecha-hora-fin="${slot.fecha_hora_fin || ''}"
          ${slot.disponible ? '' : 'disabled'}
        >
          ${slot.inicio} - ${slot.fin}
        </button>
      `;
    })
    .join('');
  ui.editSubmitButton.disabled = !state.editSelectedSlot;
}

async function loadEditDisponibilidad({ keepCurrentSlot = false } = {}) {
  const profesionalId = ui.editProfesionalSelect.value;
  const prestacionIds = state.editSelectedPrestaciones.map((item) => item.id);
  const fecha = ui.editFechaDiaInput.value;
  const turnoId = ui.editIdInput.value;
  const currentTime = keepCurrentSlot ? formatTimeForSlot(state.editCurrentTurno?.fechaHoraInicio) : '';

  state.editSelectedSlot = null;
  ui.editFechaInput.value = '';
  ui.editSelectedSlotLabel.textContent = 'Selecciona un horario disponible';

  if (!profesionalId || !prestacionIds.length || !fecha) {
    resetEditDisponibilidad();
    return;
  }

  try {
    state.editDisponibilidadLoading = true;
    renderEditDisponibilidad();
    state.editDisponibilidad = await getDisponibilidadTurnos({
      profesional_perfil_id: profesionalId,
      fecha,
      prestacion_ids: prestacionIds.join(','),
      turno_id: turnoId,
      duracion_minutos: ui.editDuracionInput.value || undefined,
    });

    const slotActual = currentTime
      ? state.editDisponibilidad.find((slot) => slot.disponible && slot.inicio === currentTime)
      : null;
    if (slotActual) {
      state.editSelectedSlot = {
        inicio: slotActual.inicio,
        fin: slotActual.fin,
        fechaHoraInicio: slotActual.fecha_hora_inicio,
        fechaHoraFin: slotActual.fecha_hora_fin,
      };
      ui.editFechaInput.value = state.editSelectedSlot.fechaHoraInicio;
      ui.editSelectedSlotLabel.textContent = `${state.editSelectedSlot.inicio} - ${state.editSelectedSlot.fin}`;
    }
  } catch (error) {
    state.editDisponibilidad = [];
    renderAlert(ui.alertContainer, error.message, 'danger');
  } finally {
    state.editDisponibilidadLoading = false;
    renderEditDisponibilidad();
  }
}

function parseTurnoFromButton(button) {
  const raw = button.dataset.turno;
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (_) {
    return null;
  }
}

async function openEditModal(turno) {
  state.editCurrentTurno = turno;
  const isSolicitud = turno.estado === 'solicitado';
  const isReprogramacionSolicitada = turno.estado === 'reprogramacion_solicitada';
  if (ui.editModalLabel) {
    ui.editModalLabel.textContent = isSolicitud
      ? 'Confirmar solicitud de turno'
      : isReprogramacionSolicitada
        ? 'Reprogramar turno solicitado'
        : 'Editar turno';
  }
  if (ui.editSubmitButton) {
    ui.editSubmitButton.textContent = isSolicitud
      ? 'Confirmar turno'
      : isReprogramacionSolicitada
        ? 'Reprogramar turno'
        : 'Guardar cambios';
  }
  ui.editIdInput.value = turno.id;
  ui.editPacienteSelect.value = String(turno.pacienteId || '');
  ui.editPacienteSearch.value = turno.paciente ? pacienteLabel(turno.paciente) : '';
  ui.editProfesionalSelect.value = String(turno.profesionalId || '');
  state.editSelectedPrestaciones = (turno.prestaciones || []).map((item) => ({ id: item.id, nombre: item.nombre, duracion_minutos: item.duracion_minutos }));
  renderPrestacionPicker('edit');
  ui.editFechaDiaInput.value = formatForDateInput(turno.fechaHoraInicio);
  ui.editFechaInput.value = formatForDateTimeLocal(turno.fechaHoraInicio);
  ui.editDuracionInput.value = '';
  ui.editObservacionesInput.value = turno.observaciones || '';
  ui.editRecordatorioCheckbox.checked = turno.recordatorioHabilitado !== false;
  ui.editSelectedSlotLabel.textContent = formatTimeForSlot(turno.fechaHoraInicio) || 'Selecciona un horario disponible';
  await loadEditDisponibilidad({ keepCurrentSlot: true });
  turnoEditModal?.show();
}

function bindFilters() {
  let debounceTimer = null;
  const scheduleFilterReload = () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(async () => {
      state.pacienteQuery = ui.pacienteInput.value.trim();
      state.page = 1;
      await loadTurnos();
      await loadWeeklyCalendar();
      await loadDailyCalendar();
    }, 250);
  };

  ui.filterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.estado = ui.estadoInput.value;
    state.pacienteQuery = ui.pacienteInput.value.trim();
    state.fechaDesde = ui.desdeInput.value;
    state.fechaHasta = ui.hastaInput.value;
    state.page = 1;
    await loadTurnos();
    await loadWeeklyCalendar();
    await loadDailyCalendar();
  });

  ui.clearFiltersButton.addEventListener('click', async () => {
    ui.filterForm.reset();
    state.estado = '';
    state.pacienteQuery = '';
    state.fechaDesde = '';
    state.fechaHasta = '';
    state.page = 1;
    await loadTurnos();
    await loadWeeklyCalendar();
    await loadDailyCalendar();
  });

  ui.quickRangeInput.addEventListener('change', () => {
    const value = ui.quickRangeInput.value;
    const today = todayClinicDate();

    if (value === 'hoy') {
      const date = formatDateForApi(today);
      ui.desdeInput.value = date;
      ui.hastaInput.value = date;
      return;
    }

    if (value === 'semana') {
      const day = today.getUTCDay();
      const offsetToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() + offsetToMonday);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      const toDateInput = (d) =>
        formatDateForApi(d);

      ui.desdeInput.value = toDateInput(monday);
      ui.hastaInput.value = toDateInput(sunday);
      return;
    }

    ui.desdeInput.value = '';
    ui.hastaInput.value = '';
  });

  ui.pacienteInput.addEventListener('input', scheduleFilterReload);
}

function bindPagination() {
  ui.prevButton.addEventListener('click', async () => {
    if (state.page <= 1) return;
    state.page -= 1;
    await loadTurnos();
  });

  ui.nextButton.addEventListener('click', async () => {
    const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
    if (state.page >= totalPages) return;
    state.page += 1;
    await loadTurnos();
  });
}

function bindCalendarNav() {
  ui.calendarPrevWeekButton.addEventListener('click', async () => {
    const newStart = new Date(state.calendarWeekStart || startOfWeek(todayClinicDate()));
    newStart.setUTCDate(newStart.getUTCDate() - 7);
    state.calendarWeekStart = newStart;
    await loadWeeklyCalendar();
  });

  ui.calendarTodayWeekButton.addEventListener('click', async () => {
    state.calendarWeekStart = startOfWeek(todayClinicDate());
    await loadWeeklyCalendar();
  });

  ui.calendarNextWeekButton.addEventListener('click', async () => {
    const newStart = new Date(state.calendarWeekStart || startOfWeek(todayClinicDate()));
    newStart.setUTCDate(newStart.getUTCDate() + 7);
    state.calendarWeekStart = newStart;
    await loadWeeklyCalendar();
  });

  ui.calendarPrevDayButton.addEventListener('click', async () => {
    const newDay = new Date(state.calendarDay || todayClinicDate());
    newDay.setUTCDate(newDay.getUTCDate() - 1);
    state.calendarDay = newDay;
    await loadDailyCalendar();
  });

  ui.calendarTodayDayButton.addEventListener('click', async () => {
    state.calendarDay = todayClinicDate();
    await loadDailyCalendar();
  });

  ui.calendarNextDayButton.addEventListener('click', async () => {
    const newDay = new Date(state.calendarDay || todayClinicDate());
    newDay.setUTCDate(newDay.getUTCDate() + 1);
    state.calendarDay = newDay;
    await loadDailyCalendar();
  });
}

function renderCalendarMode() {
  const isDay = state.calendarMode === 'day';
  ui.calendarDaySection.classList.toggle('d-none', !isDay);
  ui.calendarWeekSection.classList.toggle('d-none', isDay);
  ui.calendarModeDayButton.classList.toggle('active', isDay);
  ui.calendarModeWeekButton.classList.toggle('active', !isDay);
}

function bindCalendarMode() {
  ui.calendarModeDayButton.addEventListener('click', () => {
    state.calendarMode = 'day';
    renderCalendarMode();
  });

  ui.calendarModeWeekButton.addEventListener('click', () => {
    state.calendarMode = 'week';
    renderCalendarMode();
  });
}

function openCalendarTurno(turno) {
  if (!turno) return;
  showCalendarTurnoDetail(turno);
}

async function loadAndOpenEditTurno(turno) {
  if (!turno || !canEditTurno(turno)) return;
  await Promise.all([loadPacientesForSelect(), loadPrestacionesForSelect(), loadProfesionalesForSelect()]);
  await openEditModal(turno);
}

function bindCalendarTurnoActions() {
  [ui.calendarDayBody, ui.calendarWeekBody].forEach((body) => {
    body?.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-calendar-action="turno"]');
      if (!button) return;
      const turno = parseTurnoFromButton(button);
      openCalendarTurno(turno);
    });
  });
}

async function refreshTurnosView({ silent = false } = {}) {
  if (viewRefreshPromise) return viewRefreshPromise;
  viewRefreshPromise = Promise.all([
      loadTurnos({ silent }),
      loadWeeklyCalendar({ silent }),
      loadDailyCalendar({ silent }),
    ])
    .finally(() => { viewRefreshPromise = null; });
  return viewRefreshPromise;
}

function hasOpenTurnoModal() {
  return [turnoModalElement, turnoEditModalElement, turnoDetailModalElement]
    .some((element) => element?.classList.contains('show'));
}

async function runSilentAutoRefresh() {
  if (autoRefreshInFlight || document.visibilityState !== 'visible' || hasOpenTurnoModal()) return;
  const section = document.getElementById('section-turnos');
  if (!section || section.classList.contains('d-none')) return;
  autoRefreshInFlight = true;
  try {
    await refreshTurnosView({ silent: true });
  } catch (_) {
    // La actualización automática vuelve a intentarse sin interrumpir al usuario.
  } finally {
    autoRefreshInFlight = false;
  }
}

function handleTurnosVisibilityChange() {
  if (document.visibilityState === 'visible') runSilentAutoRefresh();
}

export function startTurnosAutoRefresh() {
  if (!autoRefreshTimer) {
    autoRefreshTimer = window.setInterval(runSilentAutoRefresh, AUTO_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleTurnosVisibilityChange);
  }
  runSilentAutoRefresh();
}

export function stopTurnosAutoRefresh() {
  if (autoRefreshTimer) window.clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
  document.removeEventListener('visibilitychange', handleTurnosVisibilityChange);
}

function bindOpenCreateModal() {
  ui.openCreateModalButton.addEventListener('click', async () => {
    await Promise.all([loadPacientesForSelect(), loadPrestacionesForSelect(), loadProfesionalesForSelect()]);
    ui.createForm.reset();
    state.selectedPrestaciones = [];
    ui.pacienteSelect.value = '';
    ui.pacienteResults.innerHTML = '';
    renderPrestacionPicker('create');
    ui.recordatorioCheckbox.checked = true;
    resetDisponibilidad();
    turnoModal?.show();
  });

  ui.goPacientesButton.addEventListener('click', () => {
    turnoModal?.hide();
    const pacientesTab = document.getElementById('pacientes-tab');
    if (pacientesTab) pacientesTab.click();
    const openCreatePaciente = document.getElementById('open-create-modal');
    if (openCreatePaciente) openCreatePaciente.click();
  });
}

function bindTurnoSearchControls() {
  const bindPatient = (mode) => {
    const edit = mode === 'edit';
    const input = edit ? ui.editPacienteSearch : ui.pacienteSearch;
    const hidden = edit ? ui.editPacienteSelect : ui.pacienteSelect;
    const results = edit ? ui.editPacienteResults : ui.pacienteResults;
    let timer;
    input.addEventListener('input', () => {
      hidden.value = '';
      const requestId = ++state.pacienteSearchRequest[mode];
      window.clearTimeout(timer);
      timer = window.setTimeout(() => buscarPacientesTurno(mode, input.value, requestId).catch((error) => renderAlert(ui.alertContainer, error.message, 'danger')), 250);
    });
    results.addEventListener('click', (event) => {
      const button = event.target.closest('[data-paciente-id]');
      if (!button) return;
      hidden.value = button.dataset.pacienteId;
      input.value = button.dataset.pacienteLabel;
      results.innerHTML = '';
    });
  };
  const bindPrestation = (mode) => {
    const edit = mode === 'edit';
    const input = edit ? ui.editPrestacionSearch : ui.prestacionSearch;
    const results = edit ? ui.editPrestacionResults : ui.prestacionResults;
    const chips = edit ? ui.editPrestacionesSelected : ui.prestacionesSelected;
    input.addEventListener('input', () => renderPrestacionPicker(mode));
    results.addEventListener('click', (event) => {
      const button = event.target.closest('[data-prestacion-id]');
      if (!button) return;
      const item = state.prestacionesCatalogo.find((entry) => Number(entry.id) === Number(button.dataset.prestacionId));
      if (!item) return;
      selectedPrestaciones(mode).push(item);
      input.value = '';
      renderPrestacionPicker(mode);
      if (edit) loadEditDisponibilidad(); else loadDisponibilidad();
    });
    chips.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-prestacion]');
      if (!button) return;
      const next = selectedPrestaciones(mode).filter((item) => Number(item.id) !== Number(button.dataset.removePrestacion));
      if (edit) state.editSelectedPrestaciones = next; else state.selectedPrestaciones = next;
      renderPrestacionPicker(mode);
      if (edit) loadEditDisponibilidad(); else loadDisponibilidad();
    });
  };
  bindPatient('create'); bindPatient('edit'); bindPrestation('create'); bindPrestation('edit');
}

function bindDisponibilidadForm() {
  [ui.profesionalSelect, ui.fechaDiaInput, ui.duracionInput].forEach((input) => {
    input?.addEventListener('change', loadDisponibilidad);
  });

  ui.disponibilidadGrid?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-inicio]');
    if (!button || button.disabled) return;

    state.selectedSlot = {
      inicio: button.dataset.inicio,
      fin: button.dataset.fin,
      fechaHoraInicio: button.dataset.fechaHoraInicio,
      fechaHoraFin: button.dataset.fechaHoraFin,
    };
    ui.fechaInicioInput.value = state.selectedSlot.fechaHoraInicio;
    ui.fechaFinInput.value = state.selectedSlot.fechaHoraFin;
    ui.selectedSlotLabel.textContent = `${state.selectedSlot.inicio} - ${state.selectedSlot.fin}`;
    renderDisponibilidad();
  });
}

function bindEditDisponibilidadForm() {
  [ui.editProfesionalSelect, ui.editFechaDiaInput, ui.editDuracionInput].forEach((input) => {
    input?.addEventListener('change', () => loadEditDisponibilidad());
  });

  ui.editDisponibilidadGrid?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-inicio]');
    if (!button || button.disabled) return;

    state.editSelectedSlot = {
      inicio: button.dataset.inicio,
      fin: button.dataset.fin,
      fechaHoraInicio: button.dataset.fechaHoraInicio,
      fechaHoraFin: button.dataset.fechaHoraFin,
    };
    ui.editFechaInput.value = state.editSelectedSlot.fechaHoraInicio;
    ui.editSelectedSlotLabel.textContent = `${state.editSelectedSlot.inicio} - ${state.editSelectedSlot.fin}`;
    renderEditDisponibilidad();
  });
}

function bindCreateForm() {
  ui.createForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(ui.createForm);
    const payload = Object.fromEntries(formData.entries());
    payload.prestacionIds = state.selectedPrestaciones.map((item) => item.id);
    payload.recordatorioHabilitado = checkboxToBoolean(ui.recordatorioCheckbox);
    if (!payload.pacienteId || !payload.prestacionIds.length) {
      renderAlert(ui.alertContainer, 'Selecciona un paciente y al menos una prestación', 'warning');
      return;
    }
    if (!payload.fechaHoraInicio) {
      renderAlert(ui.alertContainer, 'Selecciona un horario disponible para confirmar el turno', 'warning');
      return;
    }
    delete payload.fechaHoraFin;
    delete payload.fechaDia;
    if (payload.duracionMinutos && String(payload.duracionMinutos).trim()) {
      payload.duracionMinutos = Number(payload.duracionMinutos);
    } else {
      delete payload.duracionMinutos;
    }

    try {
      const response = await createTurno(payload);
      const message = response.advertencia
        ? `${response.mensaje || 'Turno creado'}. ${response.advertencia}`
        : response.mensaje || 'Turno creado';
      renderAlert(ui.alertContainer, message, response.advertencia ? 'warning' : 'success');
      turnoModal?.hide();
      state.page = 1;
      await refreshTurnosView();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function bindEditForm() {
  ui.editForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(ui.editForm);
    const payload = Object.fromEntries(formData.entries());
    payload.prestacionIds = state.editSelectedPrestaciones.map((item) => item.id);
    payload.recordatorioHabilitado = checkboxToBoolean(ui.editRecordatorioCheckbox);
    const id = payload.id;
    delete payload.id;
    delete payload.fechaDia;

    if (!payload.pacienteId || !payload.prestacionIds.length) {
      renderAlert(ui.alertContainer, 'Selecciona un paciente y al menos una prestación', 'warning');
      return;
    }
    if (!payload.fechaHoraInicio) {
      renderAlert(ui.alertContainer, 'Selecciona un horario disponible para guardar los cambios', 'warning');
      return;
    }

    if (payload.duracionMinutos && String(payload.duracionMinutos).trim()) {
      payload.duracionMinutos = Number(payload.duracionMinutos);
    } else {
      delete payload.duracionMinutos;
    }

    try {
      const isSolicitud = state.editCurrentTurno?.estado === 'solicitado';
      const isReprogramacionSolicitada = state.editCurrentTurno?.estado === 'reprogramacion_solicitada';
      let response;

      if (isSolicitud) {
        response = await confirmarSolicitudTurno(id, payload);
      } else if (isReprogramacionSolicitada) {
        response = await reprogramarTurno(id, {
          fechaHoraInicio: payload.fechaHoraInicio,
          fechaHoraFin: state.editSelectedSlot?.fechaHoraFin,
          recordatorioHabilitado: payload.recordatorioHabilitado,
        });
      } else {
        response = await updateTurno(id, payload);
      }
      const feedback = getOperationFeedback(response, 'Turno actualizado');
      renderAlert(ui.alertContainer, feedback.message, feedback.type);
      turnoEditModal?.hide();
      await refreshTurnosView();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

async function cancelTurnoFromUi(turnoId) {
  if (!turnoId) return;

  const confirmed = window.confirm('Deseas cancelar este turno?');
  if (!confirmed) return;
  const enviarMensaje = window.confirm('Enviar mensaje de WhatsApp al paciente?');

  try {
    const response = await cancelarTurno(turnoId, { enviarMensaje });
    const feedback = getOperationFeedback(response, 'Turno cancelado');
    renderAlert(ui.alertContainer, feedback.message, feedback.type);
    await refreshTurnosView();
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function afterDetailModalHidden(callback) {
  if (!turnoDetailModalElement?.classList.contains('show')) {
    callback();
    return;
  }
  turnoDetailModalElement.addEventListener('hidden.bs.modal', callback, { once: true });
  turnoDetailModal?.hide();
}

function bindDetailModalActions() {
  ui.detailEditButton?.addEventListener('click', () => {
    const turno = state.detailCurrentTurno;
    if (!turno) return;
    afterDetailModalHidden(() => {
      loadAndOpenEditTurno(turno).catch((error) => {
        renderAlert(ui.alertContainer, error.message, 'danger');
      });
    });
  });

  ui.detailCancelButton?.addEventListener('click', () => {
    const turnoId = state.detailCurrentTurno?.id;
    if (!turnoId) return;
    afterDetailModalHidden(() => {
      cancelTurnoFromUi(turnoId);
    });
  });
}

function bindTableActions() {
  ui.tbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;

    if (action === 'ver-detalle') {
      const turno = parseTurnoFromButton(button);
      if (!turno) return;
      showCalendarTurnoDetail(turno);
      return;
    }

    if (action === 'editar' || action === 'confirmar-solicitud') {
      const turno = parseTurnoFromButton(button);
      if (!turno) return;
      await loadAndOpenEditTurno(turno);
      return;
    }

    if (action === 'rechazar-solicitud') {
      const turnoId = button.dataset.id;
      if (!turnoId) return;
      const observaciones = window.prompt('Motivo u observaciones del rechazo (opcional):') || '';
      const confirmed = window.confirm('Deseas rechazar esta solicitud de turno?');
      if (!confirmed) return;

      try {
        const response = await rechazarSolicitudTurno(turnoId, { observaciones });
        const feedback = getOperationFeedback(response, 'Solicitud rechazada correctamente');
        renderAlert(ui.alertContainer, feedback.message, feedback.type);
        await refreshTurnosView();
      } catch (error) {
        renderAlert(ui.alertContainer, error.message, 'danger');
      }
      return;
    }

    if (action === 'cancelar') {
      const turnoId = button.dataset.id;
      if (!turnoId) return;
      await cancelTurnoFromUi(turnoId);
      return;
    }

    if (action === 'whatsapp') {
      const turnoId = button.dataset.id;
      if (!turnoId) return;

      const confirmed = window.confirm('Deseas enviar un recordatorio por WhatsApp para este turno?');
      if (!confirmed) return;

      try {
        const response = await enviarRecordatorioWhatsappTurno(turnoId);
        renderAlert(
          ui.alertContainer,
          response.mensaje || 'Recordatorio procesado',
          response?.resultado?.enviado ? 'success' : 'warning',
        );
        await refreshTurnosView();
      } catch (error) {
        renderAlert(ui.alertContainer, error.message, 'danger');
      }
      return;
    }
  });
}

export async function initTurnosView({ agendaPropia = false, profesionalPerfilId = null } = {}) {
  agendaOptions = { propia: agendaPropia, profesionalPerfilId };
  state.calendarWeekStart = startOfWeek(todayClinicDate());
  const today = todayClinicDate();
  state.calendarDay = today;
  state.calendarMode = 'day';
  renderCalendarMode();
  bindFilters();
  bindPagination();
  bindCalendarMode();
  bindCalendarNav();
  bindCalendarTurnoActions();
  bindOpenCreateModal();
  bindTurnoSearchControls();
  bindDisponibilidadForm();
  bindEditDisponibilidadForm();
  bindCreateForm();
  bindEditForm();
  bindDetailModalActions();
  bindTableActions();
  await loadTurnos();
  await loadWeeklyCalendar();
  await loadDailyCalendar();
}

