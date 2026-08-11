import { createPago, getPacientes, getPagos, getResumenPagosPaciente, updatePago } from '../api.js';
import { renderAlert } from '../components/alerts.js';

const state = {
  pagos: [],
  resumenPaciente: null,
  mode: 'create',
  editId: null,
  selectedConceptTurnoId: null,
};

const ui = {
  alertContainer: document.getElementById('alert-container'),
  tbody: document.getElementById('pagos-tbody'),
  form: document.getElementById('pago-form'),
  filtroForm: document.getElementById('pagos-filter-form'),
  filtroPaciente: document.getElementById('pagos-filter-paciente'),
  filtroDesde: document.getElementById('pagos-filter-desde'),
  filtroHasta: document.getElementById('pagos-filter-hasta'),
  pacienteSelect: document.getElementById('pago-paciente'),
  deudaTotal: document.getElementById('pago-deuda-total'),
  conceptosCount: document.getElementById('pago-conceptos-count'),
  conceptosWrap: document.getElementById('pago-conceptos'),
  turnoInput: document.getElementById('pago-turno'),
  montoInput: document.getElementById('pago-monto'),
  montoAyuda: document.getElementById('pago-monto-ayuda'),
  metodoSelect: document.getElementById('pago-metodo'),
  estadoSelect: document.getElementById('pago-estado'),
  fechaInput: document.getElementById('pago-fecha'),
  obsInput: document.getElementById('pago-observaciones'),
  submitBtn: document.getElementById('pago-submit'),
};

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$ 0.00';
  return `$ ${num.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-AR');
}

function setMontoSuggestion(message, isActive = false) {
  if (!ui.montoAyuda) return;
  ui.montoAyuda.textContent = message;
  ui.montoAyuda.classList.toggle('is-active', isActive);
  ui.montoInput.classList.toggle('payment-input-highlight', isActive);
}

function renderRows(pagos = []) {
  if (!pagos.length) {
    ui.tbody.innerHTML = '<tr><td colspan="9" class="text-center text-secondary">Sin pagos</td></tr>';
    return;
  }

  ui.tbody.innerHTML = pagos
    .map(
      (pago) => `
        <tr>
          <td>${formatDate(pago.fecha_pago)}</td>
          <td>${pago.paciente_apellido || ''}, ${pago.paciente_nombre || ''}</td>
          <td>${pago.paciente_dni || '-'}</td>
          <td>${pago.prestacion_nombre || (pago.turno_id ? `Turno #${pago.turno_id}` : '-') }</td>
          <td>${formatCurrency(pago.monto)}</td>
          <td>${pago.metodo}</td>
          <td><span class="badge text-bg-light border">${pago.estado}</span></td>
          <td>${formatCurrency(pago.saldo_pendiente_turno)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${pago.id}">
              <i class="bi bi-pencil-square me-1"></i>Editar
            </button>
          </td>
        </tr>
      `,
    )
    .join('');
}

async function loadPagos() {
  try {
    const data = await getPagos({
      pacienteId: ui.filtroPaciente.value || undefined,
      desde: ui.filtroDesde.value || undefined,
      hasta: ui.filtroHasta.value || undefined,
    });
    state.pagos = data.pagos || [];
    renderRows(state.pagos);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

async function loadPacientes() {
  try {
    const data = await getPacientes({ page: 1, limit: 100, sort: 'apellido:asc' });
    const pacientes = Array.isArray(data.pacientes) ? data.pacientes : [];
    const options = pacientes
      .map((p) => `<option value="${p.id}">${p.apellido}, ${p.nombre} (${p.dni})</option>`)
      .join('');
    ui.pacienteSelect.innerHTML = pacientes.length
      ? `<option value="">Seleccionar paciente</option>${options}`
      : `<option value="">Sin pacientes</option>`;
    ui.filtroPaciente.innerHTML = pacientes.length
      ? `<option value="">Todos</option>${options}`
      : `<option value="">Sin pacientes</option>`;
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function renderResumenPaciente() {
  const data = state.resumenPaciente;
  if (!data) {
    ui.deudaTotal.textContent = '$ 0.00';
    ui.conceptosCount.textContent = '0 conceptos';
    ui.conceptosWrap.innerHTML = '<div class="payment-empty-copy">Selecciona un paciente para ver conceptos pendientes.</div>';
    state.selectedConceptTurnoId = null;
    setMontoSuggestion('Selecciona un concepto pendiente y te sugerimos el importe exacto.');
    return;
  }

  ui.deudaTotal.textContent = formatCurrency(data.resumen?.total_deuda);
  ui.conceptosCount.textContent = `${data.resumen?.conceptos_pendientes || 0} conceptos`;

  if (!Array.isArray(data.conceptos) || !data.conceptos.length) {
    ui.conceptosWrap.innerHTML = '<div class="payment-empty-copy payment-empty-ok">No tiene deuda pendiente.</div>';
    state.selectedConceptTurnoId = null;
    setMontoSuggestion('Este paciente no tiene saldo pendiente.');
    return;
  }

  ui.conceptosWrap.innerHTML = data.conceptos
    .map(
      (item) => {
        const precioBase = Number(item.precio_base) || 0;
        const saldoPendiente = Number(item.saldo_pendiente) || 0;
        const totalPagado = Math.max(precioBase - saldoPendiente, 0);
        const progress = precioBase > 0 ? Math.min((totalPagado / precioBase) * 100, 100) : 0;
        const isSelected = String(state.selectedConceptTurnoId || '') === String(item.turno_id);

        return `
          <button
            type="button"
            class="payment-concept-item${isSelected ? ' is-selected' : ''}"
            data-action="usar-concepto"
            data-turno-id="${item.turno_id}"
            data-monto="${item.saldo_pendiente}"
            data-label="${item.prestacion_nombre}"
          >
            <div class="payment-concept-main">
              <div>
                <div class="payment-concept-title">${item.prestacion_nombre}</div>
                <div class="payment-concept-meta">${formatDateTime(item.fecha_hora_inicio)} - ${item.turno_estado}</div>
              </div>
              <span class="payment-concept-chip">Turno #${item.turno_id}</span>
            </div>
            <div class="payment-concept-values">
              <div>
                <span class="payment-concept-label">Total</span>
                <strong>${formatCurrency(precioBase)}</strong>
              </div>
              <div>
                <span class="payment-concept-label">Pagado</span>
                <strong>${formatCurrency(totalPagado)}</strong>
              </div>
              <div class="payment-concept-balance">
                <span class="payment-concept-label">Saldo</span>
                <strong>${formatCurrency(saldoPendiente)}</strong>
              </div>
            </div>
            <div class="payment-progress-block">
              <div class="payment-progress-head">
                <span>Progreso de cobro</span>
                <span>${progress.toFixed(0)}%</span>
              </div>
              <div class="payment-progress-track">
                <div class="payment-progress-bar" style="width: ${progress}%"></div>
              </div>
            </div>
            <div class="payment-concept-cta">
              <i class="bi bi-arrow-down-circle me-1"></i>Aplicar este saldo al formulario
            </div>
          </button>
        `;
      },
    )
    .join('');
}

async function loadResumenPaciente(pacienteId) {
  if (!pacienteId) {
    state.resumenPaciente = null;
    renderResumenPaciente();
    return;
  }

  try {
    const data = await getResumenPagosPaciente(pacienteId);
    state.resumenPaciente = data;
    renderResumenPaciente();
  } catch (error) {
    state.resumenPaciente = null;
    renderResumenPaciente();
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function resetForm() {
  state.mode = 'create';
  state.editId = null;
  state.selectedConceptTurnoId = null;
  ui.form.reset();
  ui.submitBtn.textContent = 'Registrar pago';
  setMontoSuggestion('Selecciona un concepto pendiente y te sugerimos el importe exacto.');
  loadResumenPaciente(ui.pacienteSelect.value || null);
}

function bindTable() {
  ui.conceptosWrap.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="usar-concepto"]');
    if (!button) return;

    state.selectedConceptTurnoId = button.dataset.turnoId || null;
    ui.turnoInput.value = button.dataset.turnoId || '';
    ui.montoInput.value = button.dataset.monto || '';
    ui.estadoSelect.value = 'pagado';
    setMontoSuggestion(`Importe sugerido aplicado: ${formatCurrency(button.dataset.monto)}`, true);
    if (!ui.obsInput.value.trim()) {
      ui.obsInput.value = `Pago aplicado a ${button.dataset.label || 'prestacion'}`;
    }
    renderResumenPaciente();
  });

  ui.tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="edit"]');
    if (!button) return;
    const id = button.dataset.id;
    const pago = state.pagos.find((p) => String(p.id) === String(id));
    if (!pago) return;

    state.mode = 'edit';
    state.editId = pago.id;
    ui.submitBtn.textContent = 'Guardar cambios';
    ui.pacienteSelect.value = pago.paciente_id;
    ui.turnoInput.value = pago.turno_id || '';
    ui.montoInput.value = pago.monto;
    ui.metodoSelect.value = pago.metodo;
    ui.estadoSelect.value = pago.estado;
    ui.fechaInput.value = pago.fecha_pago ? String(pago.fecha_pago).slice(0, 10) : '';
    ui.obsInput.value = pago.observaciones || '';
    setMontoSuggestion('Estás editando un pago registrado.', true);
  });
}

function bindForm() {
  ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      paciente_id: ui.pacienteSelect.value,
      turno_id: ui.turnoInput.value || null,
      monto: ui.montoInput.value,
      metodo: ui.metodoSelect.value,
      estado: ui.estadoSelect.value,
      fecha_pago: ui.fechaInput.value || null,
      observaciones: ui.obsInput.value || null,
    };

    try {
      if (state.mode === 'edit' && state.editId) {
        await updatePago(state.editId, payload);
        renderAlert(ui.alertContainer, 'Pago actualizado', 'success');
      } else {
        await createPago(payload);
        renderAlert(ui.alertContainer, 'Pago registrado', 'success');
      }

      resetForm();
      await loadPagos();
      await loadResumenPaciente(ui.pacienteSelect.value || null);
    } catch (error) {
      renderAlert(ui.alertContainer, error.message, 'danger');
    }
  });
}

function bindFilters() {
  ui.filtroForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadPagos();
  });
}

function bindPacienteChange() {
  ui.pacienteSelect.addEventListener('change', async () => {
    state.selectedConceptTurnoId = null;
    setMontoSuggestion('Selecciona un concepto pendiente y te sugerimos el importe exacto.');
    await loadResumenPaciente(ui.pacienteSelect.value || null);
  });
}

export async function initPagosView() {
  await loadPacientes();
  await loadPagos();
  bindForm();
  bindFilters();
  bindTable();
  bindPacienteChange();
  renderResumenPaciente();
}

