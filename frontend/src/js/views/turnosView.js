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
  procesarRecordatoriosTurnos,
  rechazarSolicitudTurno,
  updateTurno,
} from '../api.js';
import { renderAlert } from '../components/alerts.js';

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
};

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
  processRemindersButton: document.getElementById('turnos-process-reminders'),
  openCreateModalButton: document.getElementById('open-create-turno-modal'),
  goPacientesButton: document.getElementById('turno-go-pacientes'),
  createForm: document.getElementById('create-turno-form'),
  pacienteSelect: document.getElementById('turno-paciente-id'),
  profesionalSelect: document.getElementById('turno-profesional-id'),
  prestacionSelect: document.getElementById('turno-prestacion-id'),
  duracionInput: document.getElementById('turno-duracion'),
  fechaDiaInput: document.getElementById('turno-fecha-dia'),
  fechaInicioInput: document.getElementById('turno-fecha-inicio'),
  fechaFinInput: document.getElementById('turno-fecha-fin'),
  disponibilidadStatus: document.getElementById('turno-disponibilidad-status'),
  disponibilidadGrid: document.getElementById('turno-disponibilidad-grid'),
  selectedSlotLabel: document.getElementById('turno-selected-slot-label'),
  submitButton: document.getElementById('turno-submit-btn'),
  editForm: document.getElementById('edit-turno-form'),
  editModalLabel: document.getElementById('turno-edit-modal-label'),
  editIdInput: document.getElementById('edit-turno-id'),
  editPacienteSelect: document.getElementById('edit-turno-paciente-id'),
  editProfesionalSelect: document.getElementById('edit-turno-profesional-id'),
  editPrestacionSelect: document.getElementById('edit-turno-prestacion-id'),
  editFechaDiaInput: document.getElementById('edit-turno-fecha-dia'),
  editFechaInput: document.getElementById('edit-turno-fecha-inicio'),
  editDuracionInput: document.getElementById('edit-turno-duracion'),
  editDisponibilidadStatus: document.getElementById('edit-turno-disponibilidad-status'),
  editDisponibilidadGrid: document.getElementById('edit-turno-disponibilidad-grid'),
  editSelectedSlotLabel: document.getElementById('edit-turno-selected-slot-label'),
  editSubmitButton: document.getElementById('edit-turno-submit-btn'),
  editObservacionesInput: document.getElementById('edit-turno-observaciones'),
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
    day: '2-digit',
    month: '2-digit',
    year: options.year || undefined,
    weekday: options.weekday || undefined,
  });
}

function formatTimeAr(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
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
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offsetToMonday);
  return copy;
}

function buildWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
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
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function calcularDuracionMinutos(turno) {
  if (!turno?.fecha_hora_inicio && !turno?.fechaHoraInicio) return '';
  if (!turno?.fecha_hora_fin && !turno?.fechaHoraFin) return '';
  const inicio = new Date(turno.fecha_hora_inicio || turno.fechaHoraInicio);
  const fin = new Date(turno.fecha_hora_fin || turno.fechaHoraFin);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) return '';
  return Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 60000));
}

function getEstadoInfo(estado) {
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

function serializeTurno(turno) {
  return encodeURIComponent(
    JSON.stringify({
      id: turno.id,
      pacienteId: turno?.paciente?.id,
      paciente: turno?.paciente || null,
      pacienteTelefono: turno?.paciente?.telefono,
      prestacionId: turno?.prestacion?.id,
      prestacion: turno?.prestacion || null,
      profesionalId: turno?.profesional?.id,
      profesional: turno?.profesional || null,
      fechaHoraInicio: turno.fecha_hora_inicio,
      fechaHoraFin: turno.fecha_hora_fin,
      observaciones: turno.observaciones || '',
      solicitudPreferencia: turno.solicitud_preferencia || '',
      estado: turno.estado,
    }),
  );
}

function renderCalendarTurnoCard(turno) {
  const estado = getEstadoInfo(turno.estado);
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
  const estado = getEstadoInfo(turno.estado);
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
        <td><span class="badge text-bg-light border">${getEstadoInfo(turno.estado).label}</span></td>
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

async function loadTurnos() {
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
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

async function loadWeeklyCalendar() {
  try {
    if (!state.calendarWeekStart) {
      state.calendarWeekStart = startOfWeek(new Date());
    }

    const weekStart = new Date(state.calendarWeekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

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
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function renderWeeklyCalendar() {
  const weekStart = state.calendarWeekStart || startOfWeek(new Date());
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
    const key = `${start.getFullYear()}-${start.getMonth()}-${start.getDate()}-${start.getHours()}`;
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
        const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}-${hour}`;
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

async function loadDailyCalendar() {
  try {
    if (!state.calendarDay) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      state.calendarDay = today;
    }

    const day = new Date(state.calendarDay);
    const dayDate = formatDateForApi(day);
    const dayStart = `${dayDate}T00:00:00`;
    const dayEnd = `${dayDate}T23:59:59`;

    const data = await getTurnos({
      page: 1,
      limit: 200,
      estado: state.estado || undefined,
      q: state.pacienteQuery || undefined,
      fecha_desde: dayStart,
      fecha_hasta: dayEnd,
      sort: 'fecha_hora_inicio:asc',
    });

    state.calendarDayTurnos = (data.turnos || []).filter((turno) => matchPacienteQuery(turno, state.pacienteQuery));
    renderDailyCalendar();
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function renderDailyCalendar() {
  const day = state.calendarDay || new Date();
  ui.calendarDayLabel.textContent = formatDateAr(day, { weekday: 'long', year: 'numeric' });

  ui.calendarDayHead.innerHTML = `<tr><th class="calendar-hour-head">Hora</th><th>Turnos del dia</th></tr>`;

  const agendaByStartHour = new Map();
  (state.calendarDayTurnos || []).forEach((turno) => {
    const start = new Date(turno.fecha_hora_inicio);
    if (Number.isNaN(start.getTime())) return;
    const key = `${start.getHours()}`;
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

function renderPacientesOptions(pacientes) {
  const options = (pacientes || [])
    .map((paciente) => `<option value="${paciente.id}">${paciente.apellido}, ${paciente.nombre} (${paciente.dni})</option>`)
    .join('');
  ui.pacienteSelect.innerHTML = `<option value="">Seleccionar paciente</option>${options}`;
  ui.editPacienteSelect.innerHTML = `<option value="">Seleccionar paciente</option>${options}`;
}

function renderProfesionalesOptions(profesionales) {
  const options = (profesionales || [])
    .map((profesional) => {
      const label = profesional.nombre || profesional.email || `Profesional #${profesional.id}`;
      const email = profesional.email && profesional.nombre ? ` (${profesional.email})` : '';
      return `<option value="${profesional.id}">${label}${email}</option>`;
    })
    .join('');

  ui.profesionalSelect.innerHTML = `<option value="">Seleccionar profesional</option>${options}`;
  ui.editProfesionalSelect.innerHTML = `<option value="">Seleccionar profesional</option>${options}`;
}

async function loadProfesionalesForSelect() {
  try {
    const data = await getProfesionalesTurnos();
    renderProfesionalesOptions(data.profesionales || []);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

async function loadPacientesForSelect() {
  try {
    const data = await getPacientes({ page: 1, limit: 100, sort: 'apellido:asc' });
    renderPacientesOptions(data.pacientes || []);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function renderPrestacionesOptions(prestaciones) {
  const uniqueByName = new Map();
  (prestaciones || []).forEach((prestacion) => {
    const key = String(prestacion?.nombre || '').trim().toLowerCase();
    if (!key || uniqueByName.has(key)) return;
    uniqueByName.set(key, prestacion);
  });

  const options = Array.from(uniqueByName.values())
    .map((prestacion) => {
      const duracion = prestacion.duracion_minutos ? ` - ${prestacion.duracion_minutos} min` : '';
      return `<option value="${prestacion.id}">${prestacion.nombre}${duracion}</option>`;
    })
    .join('');

  ui.prestacionSelect.innerHTML = `<option value="">Seleccionar prestacion</option>${options}`;
  ui.editPrestacionSelect.innerHTML = `<option value="">Seleccionar prestacion</option>${options}`;
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
  const prestacionId = ui.prestacionSelect.value;
  const fecha = ui.fechaDiaInput.value;

  state.selectedSlot = null;
  ui.fechaInicioInput.value = '';
  ui.fechaFinInput.value = '';
  ui.selectedSlotLabel.textContent = 'Selecciona un horario disponible';

  if (!profesionalId || !prestacionId || !fecha) {
    resetDisponibilidad();
    return;
  }

  try {
    state.disponibilidadLoading = true;
    renderDisponibilidad();
    state.disponibilidad = await getDisponibilidadTurnos({
      profesional_id: profesionalId,
      fecha,
      tratamiento_id: prestacionId,
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
  const prestacionId = ui.editPrestacionSelect.value;
  const fecha = ui.editFechaDiaInput.value;
  const turnoId = ui.editIdInput.value;
  const currentTime = keepCurrentSlot ? formatTimeForSlot(state.editCurrentTurno?.fechaHoraInicio) : '';

  state.editSelectedSlot = null;
  ui.editFechaInput.value = '';
  ui.editSelectedSlotLabel.textContent = 'Selecciona un horario disponible';

  if (!profesionalId || !prestacionId || !fecha) {
    resetEditDisponibilidad();
    return;
  }

  try {
    state.editDisponibilidadLoading = true;
    renderEditDisponibilidad();
    state.editDisponibilidad = await getDisponibilidadTurnos({
      profesional_id: profesionalId,
      fecha,
      tratamiento_id: prestacionId,
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
  ui.editProfesionalSelect.value = String(turno.profesionalId || '');
  ui.editPrestacionSelect.value = String(turno.prestacionId || '');
  ui.editFechaDiaInput.value = formatForDateInput(turno.fechaHoraInicio);
  ui.editFechaInput.value = formatForDateTimeLocal(turno.fechaHoraInicio);
  ui.editDuracionInput.value = calcularDuracionMinutos(turno);
  ui.editObservacionesInput.value = turno.observaciones || '';
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
    const today = new Date();

    if (value === 'hoy') {
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const date = `${yyyy}-${mm}-${dd}`;
      ui.desdeInput.value = date;
      ui.hastaInput.value = date;
      return;
    }

    if (value === 'semana') {
      const day = today.getDay();
      const offsetToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(today);
      monday.setDate(today.getDate() + offsetToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const toDateInput = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
    const newStart = new Date(state.calendarWeekStart || startOfWeek(new Date()));
    newStart.setDate(newStart.getDate() - 7);
    state.calendarWeekStart = newStart;
    await loadWeeklyCalendar();
  });

  ui.calendarTodayWeekButton.addEventListener('click', async () => {
    state.calendarWeekStart = startOfWeek(new Date());
    await loadWeeklyCalendar();
  });

  ui.calendarNextWeekButton.addEventListener('click', async () => {
    const newStart = new Date(state.calendarWeekStart || startOfWeek(new Date()));
    newStart.setDate(newStart.getDate() + 7);
    state.calendarWeekStart = newStart;
    await loadWeeklyCalendar();
  });

  ui.calendarPrevDayButton.addEventListener('click', async () => {
    const newDay = new Date(state.calendarDay || new Date());
    newDay.setDate(newDay.getDate() - 1);
    newDay.setHours(0, 0, 0, 0);
    state.calendarDay = newDay;
    await loadDailyCalendar();
  });

  ui.calendarTodayDayButton.addEventListener('click', async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    state.calendarDay = today;
    await loadDailyCalendar();
  });

  ui.calendarNextDayButton.addEventListener('click', async () => {
    const newDay = new Date(state.calendarDay || new Date());
    newDay.setDate(newDay.getDate() + 1);
    newDay.setHours(0, 0, 0, 0);
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

async function refreshTurnosView() {
  await loadTurnos();
  await loadWeeklyCalendar();
  await loadDailyCalendar();
}

function bindOpenCreateModal() {
  ui.openCreateModalButton.addEventListener('click', async () => {
    await Promise.all([loadPacientesForSelect(), loadPrestacionesForSelect(), loadProfesionalesForSelect()]);
    ui.createForm.reset();
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

function bindDisponibilidadForm() {
  [ui.profesionalSelect, ui.prestacionSelect, ui.fechaDiaInput, ui.duracionInput].forEach((input) => {
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
  [ui.editProfesionalSelect, ui.editPrestacionSelect, ui.editFechaDiaInput, ui.editDuracionInput].forEach((input) => {
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

function bindReminderActions() {
  ui.processRemindersButton?.addEventListener('click', async () => {
    try {
      const response = await procesarRecordatoriosTurnos();
      const resultado = response.resultado || {};
      renderAlert(
        ui.alertContainer,
        `Recordatorios procesados: ${resultado.procesados || 0}. Enviados: ${resultado.enviados || 0}. Fallidos: ${resultado.fallidos || 0}.`,
        resultado.fallidos ? 'warning' : 'success',
      );
      await loadTurnos();
      await loadWeeklyCalendar();
      await loadDailyCalendar();
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function bindCreateForm() {
  ui.createForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(ui.createForm);
    const payload = Object.fromEntries(formData.entries());
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
    const id = payload.id;
    delete payload.id;
    delete payload.fechaDia;

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
      const response = isSolicitud
        ? await confirmarSolicitudTurno(id, payload)
        : await updateTurno(id, payload);
      const extra = Array.isArray(response.advertencias) && response.advertencias.length
        ? ` ${response.advertencias.join(' | ')}`
        : '';
      renderAlert(ui.alertContainer, `${response.mensaje || 'Turno actualizado'}${extra}`, extra ? 'warning' : 'success');
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
    const message = response.advertencia
      ? `${response.mensaje || 'Turno cancelado'}. ${response.advertencia}`
      : response.mensaje || 'Turno cancelado';
    renderAlert(ui.alertContainer, message, response.advertencia ? 'warning' : 'success');
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
        renderAlert(ui.alertContainer, response.mensaje || 'Solicitud rechazada', 'success');
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

export async function initTurnosView() {
  state.calendarWeekStart = startOfWeek(new Date());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  state.calendarDay = today;
  state.calendarMode = 'day';
  renderCalendarMode();
  bindFilters();
  bindPagination();
  bindCalendarMode();
  bindCalendarNav();
  bindCalendarTurnoActions();
  bindReminderActions();
  bindOpenCreateModal();
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

