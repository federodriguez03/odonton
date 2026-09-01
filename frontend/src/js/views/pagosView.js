import {
  anularPago,
  createCargo,
  createPago,
  getCargoById,
  getCargos,
  getConstanciaPago,
  getPacientes,
  getPrestaciones,
  getTurnos,
} from '../api.js';
import { renderAlert } from '../components/alerts.js';

const PAGE_SIZE = 20;
const FRIENDLY_ERRORS = Object.freeze({
  SOBREPAGO: 'El importe supera el saldo disponible del cargo.',
  PAGO_YA_ANULADO: 'El pago ya se encuentra anulado.',
  TURNO_PACIENTE_INCOMPATIBLE: 'El turno seleccionado no pertenece al paciente.',
  PRESTACION_TURNO_INCOMPATIBLE: 'La prestación no coincide con la asociada al turno.',
  CARGO_NO_ENCONTRADO: 'El cargo ya no está disponible.',
  PAGO_NO_ENCONTRADO: 'El pago ya no está disponible.',
});

const state = {
  cargos: [],
  pacientes: [],
  prestaciones: [],
  turnos: [],
  paginacion: { page: 1, limit: PAGE_SIZE, total: 0, total_pages: 0 },
  cargoDetalle: null,
  pagoAAnular: null,
  conceptoSugerido: '',
  importeSugerido: '',
  constancia: null,
};

const ui = {
  alertContainer: document.getElementById('alert-container'),
  nuevoCargoBtn: document.getElementById('nuevo-cargo-btn'),
  cargosTbody: document.getElementById('cargos-tbody'),
  filtroForm: document.getElementById('cargos-filter-form'),
  filtroPaciente: document.getElementById('cargos-filter-paciente'),
  filtroEstado: document.getElementById('cargos-filter-estado'),
  filtroDesde: document.getElementById('cargos-filter-desde'),
  filtroHasta: document.getElementById('cargos-filter-hasta'),
  filtroLimpiar: document.getElementById('cargos-filter-clear'),
  paginaInfo: document.getElementById('cargos-pagination-info'),
  paginaAnterior: document.getElementById('cargos-page-prev'),
  paginaSiguiente: document.getElementById('cargos-page-next'),
  cargoModalEl: document.getElementById('cargo-modal'),
  cargoForm: document.getElementById('cargo-form'),
  cargoPaciente: document.getElementById('cargo-paciente'),
  cargoTurno: document.getElementById('cargo-turno'),
  cargoPrestacion: document.getElementById('cargo-prestacion'),
  cargoConcepto: document.getElementById('cargo-concepto'),
  cargoImporte: document.getElementById('cargo-importe'),
  cargoFecha: document.getElementById('cargo-fecha'),
  cargoObservaciones: document.getElementById('cargo-observaciones'),
  cargoSubmit: document.getElementById('cargo-submit'),
  detalleModalEl: document.getElementById('cargo-detail-modal'),
  detalleContenido: document.getElementById('cargo-detail-content'),
  detallePagosTbody: document.getElementById('cargo-pagos-tbody'),
  detallePagar: document.getElementById('cargo-detail-pay'),
  constanciaModalEl: document.getElementById('constancia-modal'),
  constanciaContenido: document.getElementById('constancia-print-root'),
  constanciaImprimir: document.getElementById('constancia-print-btn'),
  pagoModalEl: document.getElementById('pago-modal'),
  pagoForm: document.getElementById('pago-form'),
  pagoSaldo: document.getElementById('pago-saldo-actual'),
  pagoImporte: document.getElementById('pago-importe'),
  pagoMetodo: document.getElementById('pago-metodo'),
  pagoFecha: document.getElementById('pago-fecha'),
  pagoObservaciones: document.getElementById('pago-observaciones'),
  pagoSubmit: document.getElementById('pago-submit'),
  anularModalEl: document.getElementById('pago-anular-modal'),
  anularForm: document.getElementById('pago-anular-form'),
  anularResumen: document.getElementById('pago-anular-resumen'),
  anularMotivo: document.getElementById('pago-anular-motivo'),
  anularSubmit: document.getElementById('pago-anular-submit'),
};

function getModal(element) {
  return window.bootstrap.Modal.getOrCreateInstance(element);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function decimalToCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const decimals = String(match[2] || '').padEnd(2, '0');
  return (BigInt(match[1]) * 100n) + BigInt(decimals || '0');
}

function formatCurrency(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '0').trim());
  if (!match) return '$ 0,00';
  const integer = match[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(match[2] || '').padEnd(2, '0');
  return `$ ${integer},${decimals}`;
}

function isZeroAmount(value) {
  return decimalToCents(value) === 0n;
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '-';
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('es-AR');
}

function todayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function patientName(id, fallback = null) {
  const patient = state.pacientes.find((item) => String(item.id) === String(id));
  if (patient) return `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*/, '');
  if (fallback) return `${fallback.paciente_apellido || ''}, ${fallback.paciente_nombre || ''}`.replace(/^,\s*/, '');
  return `Paciente #${id}`;
}

function prestationName(id) {
  const prestation = state.prestaciones.find((item) => String(item.id) === String(id));
  return prestation?.nombre || null;
}

function methodLabel(method) {
  return {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
  }[method] || method || '-';
}

function statusBadge(status) {
  const styles = {
    PENDIENTE: 'text-bg-warning',
    PARCIAL: 'text-bg-info',
    PAGADO: 'text-bg-success',
  };
  const normalized = String(status || '').toUpperCase();
  return `<span class="badge ${styles[normalized] || 'text-bg-secondary'}">${escapeHtml(normalized || '-')}</span>`;
}

function friendlyError(error) {
  return FRIENDLY_ERRORS[error?.code] || error?.message || 'No se pudo completar la operación.';
}

function setSubmitting(button, active, activeText) {
  if (!button) return;
  if (active) button.dataset.originalText = button.textContent;
  button.disabled = active;
  button.textContent = active ? activeText : (button.dataset.originalText || button.textContent);
}

function showAlert(message, type = 'danger') {
  renderAlert(ui.alertContainer, message, type);
}

function switchModal(currentElement, nextElement) {
  currentElement.addEventListener('hidden.bs.modal', () => getModal(nextElement).show(), { once: true });
  getModal(currentElement).hide();
}

async function hideModalThen(element, callback) {
  await new Promise((resolve) => {
    element.addEventListener('hidden.bs.modal', resolve, { once: true });
    getModal(element).hide();
  });
  await callback();
}

function renderCargos() {
  if (!state.cargos.length) {
    ui.cargosTbody.innerHTML = '<tr><td colspan="8" class="text-center text-secondary py-4">No se encontraron cargos.</td></tr>';
    return;
  }

  ui.cargosTbody.innerHTML = state.cargos.map((cargo) => {
    const canPay = !isZeroAmount(cargo.saldo);
    return `
      <tr>
        <td class="text-nowrap">${formatDate(cargo.fecha_cargo)}</td>
        <td>${escapeHtml(patientName(cargo.paciente_id, cargo))}</td>
        <td>${escapeHtml(cargo.concepto)}</td>
        <td class="text-nowrap">${formatCurrency(cargo.importe_total)}</td>
        <td class="text-nowrap">${formatCurrency(cargo.total_abonado)}</td>
        <td class="text-nowrap fw-semibold">${formatCurrency(cargo.saldo)}</td>
        <td>${statusBadge(cargo.estado_cobro)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-action="detail" data-id="${escapeHtml(cargo.id)}">Ver detalle</button>
          ${canPay ? `<button class="btn btn-sm btn-primary ms-1" type="button" data-action="pay" data-id="${escapeHtml(cargo.id)}">Registrar pago</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

function renderPagination() {
  const { page, total, total_pages: totalPages } = state.paginacion;
  ui.paginaInfo.textContent = total
    ? `Página ${page} de ${totalPages} · ${total} cargo${total === 1 ? '' : 's'}`
    : 'Sin resultados';
  ui.paginaAnterior.disabled = page <= 1;
  ui.paginaSiguiente.disabled = totalPages === 0 || page >= totalPages;
}

async function loadCargos(page = state.paginacion.page) {
  ui.cargosTbody.innerHTML = '<tr><td colspan="8" class="text-center text-secondary py-4">Cargando cargos...</td></tr>';
  try {
    const data = await getCargos({
      paciente_id: ui.filtroPaciente.value || undefined,
      estado_cobro: ui.filtroEstado.value || undefined,
      desde: ui.filtroDesde.value || undefined,
      hasta: ui.filtroHasta.value || undefined,
      page,
      limit: PAGE_SIZE,
    });
    state.cargos = Array.isArray(data.cargos) ? data.cargos : [];
    state.paginacion = data.paginacion || { page, limit: PAGE_SIZE, total: 0, total_pages: 0 };
    renderCargos();
    renderPagination();
  } catch (error) {
    state.cargos = [];
    state.paginacion = { page: 1, limit: PAGE_SIZE, total: 0, total_pages: 0 };
    renderCargos();
    renderPagination();
    showAlert(friendlyError(error));
  }
}

async function loadPatients() {
  const patients = [];
  let page = 1;
  let total = 0;
  do {
    const data = await getPacientes({ page, limit: 100, sort: 'apellido:asc' });
    const batch = Array.isArray(data.pacientes) ? data.pacientes : [];
    patients.push(...batch);
    total = Number(data.total || patients.length);
    if (!batch.length) break;
    page += 1;
  } while (patients.length < total);

  state.pacientes = patients;
  const options = patients.map((patient) => (
    `<option value="${escapeHtml(patient.id)}">${escapeHtml(patientName(patient.id))}${patient.dni ? ` (${escapeHtml(patient.dni)})` : ''}</option>`
  )).join('');
  ui.cargoPaciente.innerHTML = `<option value="">Seleccionar paciente</option>${options}`;
  ui.filtroPaciente.innerHTML = `<option value="">Todos los pacientes</option>${options}`;
}

async function loadPrestations() {
  const data = await getPrestaciones();
  state.prestaciones = Array.isArray(data.prestaciones) ? data.prestaciones : [];
  const options = state.prestaciones.map((prestation) => (
    `<option value="${escapeHtml(prestation.id)}">${escapeHtml(prestation.nombre)}${prestation.precio_base !== null && prestation.precio_base !== undefined ? ` · ${formatCurrency(prestation.precio_base)}` : ''}</option>`
  )).join('');
  ui.cargoPrestacion.innerHTML = `<option value="">Sin prestación asociada</option>${options}`;
}

function formatTurnLabel(turn) {
  const date = turn.fecha_hora_inicio ? new Date(turn.fecha_hora_inicio) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : 'Sin fecha asignada';
  return `#${turn.id} · ${dateLabel} · ${turn.prestacion?.nombre || 'Sin prestación'}`;
}

async function loadPatientTurns(patientId) {
  state.turnos = [];
  ui.cargoTurno.disabled = true;
  ui.cargoTurno.innerHTML = '<option value="">Cargando turnos...</option>';
  if (!patientId) {
    ui.cargoTurno.innerHTML = '<option value="">Primero seleccioná un paciente</option>';
    return;
  }

  try {
    const data = await getTurnos({ paciente_id: patientId, page: 1, limit: 100, sort: 'fecha_hora_inicio:desc' });
    state.turnos = Array.isArray(data.turnos) ? data.turnos : [];
    const options = state.turnos.map((turn) => (
      `<option value="${escapeHtml(turn.id)}">${escapeHtml(formatTurnLabel(turn))}</option>`
    )).join('');
    ui.cargoTurno.innerHTML = `<option value="">Sin turno asociado</option>${options}`;
    ui.cargoTurno.disabled = false;
  } catch (error) {
    ui.cargoTurno.innerHTML = '<option value="">No se pudieron cargar los turnos</option>';
    showAlert(friendlyError(error));
  }
}

function applyPrestationSuggestion() {
  const prestation = state.prestaciones.find((item) => String(item.id) === ui.cargoPrestacion.value);
  const conceptCanChange = !ui.cargoConcepto.value.trim() || ui.cargoConcepto.value === state.conceptoSugerido;
  const amountCanChange = !ui.cargoImporte.value.trim() || ui.cargoImporte.value === state.importeSugerido;

  if (!prestation) {
    state.conceptoSugerido = '';
    state.importeSugerido = '';
    return;
  }
  if (conceptCanChange) ui.cargoConcepto.value = prestation.nombre || '';
  if (amountCanChange && prestation.precio_base !== null && prestation.precio_base !== undefined) {
    ui.cargoImporte.value = String(prestation.precio_base);
  }
  state.conceptoSugerido = prestation.nombre || '';
  state.importeSugerido = prestation.precio_base === null || prestation.precio_base === undefined
    ? ''
    : String(prestation.precio_base);
}

function resetCargoForm() {
  ui.cargoForm.reset();
  const today = todayInputValue();
  ui.cargoFecha.value = today;
  ui.cargoFecha.max = today;
  ui.cargoTurno.disabled = true;
  ui.cargoTurno.innerHTML = '<option value="">Primero seleccioná un paciente</option>';
  state.turnos = [];
  state.conceptoSugerido = '';
  state.importeSugerido = '';
}

function renderDetail() {
  const { cargo, pagos } = state.cargoDetalle;
  const patient = patientName(cargo.paciente_id);
  const prestation = cargo.prestacion_id ? prestationName(cargo.prestacion_id) : null;
  ui.detalleContenido.innerHTML = `
    <div class="row g-3">
      <div class="col-12 col-md-6"><div class="small text-secondary">Paciente</div><strong>${escapeHtml(patient)}</strong></div>
      <div class="col-12 col-md-6"><div class="small text-secondary">Concepto</div><strong>${escapeHtml(cargo.concepto)}</strong></div>
      <div class="col-6 col-lg-3"><div class="small text-secondary">Fecha</div><strong>${formatDate(cargo.fecha_cargo)}</strong></div>
      <div class="col-6 col-lg-3"><div class="small text-secondary">Importe total</div><strong>${formatCurrency(cargo.importe_total)}</strong></div>
      <div class="col-6 col-lg-2"><div class="small text-secondary">Abonado</div><strong>${formatCurrency(cargo.total_abonado)}</strong></div>
      <div class="col-6 col-lg-2"><div class="small text-secondary">Saldo</div><strong>${formatCurrency(cargo.saldo)}</strong></div>
      <div class="col-12 col-lg-2"><div class="small text-secondary">Estado</div>${statusBadge(cargo.estado_cobro)}</div>
      <div class="col-6"><div class="small text-secondary">Turno</div><span>${cargo.turno_id ? `#${escapeHtml(cargo.turno_id)}` : 'Sin turno asociado'}</span></div>
      <div class="col-6"><div class="small text-secondary">Prestación</div><span>${escapeHtml(prestation || (cargo.prestacion_id ? `#${cargo.prestacion_id}` : 'Sin prestación asociada'))}</span></div>
      <div class="col-12"><div class="small text-secondary">Observaciones</div><span>${escapeHtml(cargo.observaciones || 'Sin observaciones')}</span></div>
    </div>
  `;

  if (!pagos.length) {
    ui.detallePagosTbody.innerHTML = '<tr><td colspan="6" class="text-center text-secondary py-4">Este cargo todavía no tiene pagos.</td></tr>';
  } else {
    ui.detallePagosTbody.innerHTML = pagos.map((payment) => {
      const annulled = payment.estado === 'anulado';
      const observations = [
        payment.observaciones,
        annulled && payment.motivo_anulacion ? `Motivo de anulación: ${payment.motivo_anulacion}` : null,
        annulled && payment.fecha_anulacion ? `Anulado: ${formatDateTime(payment.fecha_anulacion)}` : null,
      ].filter(Boolean).join(' · ');
      return `
        <tr class="${annulled ? 'table-light text-secondary' : ''}">
          <td class="text-nowrap">${formatDate(payment.fecha_pago)}</td>
          <td class="text-nowrap ${annulled ? 'text-decoration-line-through' : 'fw-semibold'}">${formatCurrency(payment.importe)}</td>
          <td>${escapeHtml(methodLabel(payment.metodo_pago))}</td>
          <td><span class="badge ${annulled ? 'text-bg-secondary' : 'text-bg-success'}">${annulled ? 'Anulado' : 'Activo'}</span></td>
          <td>${escapeHtml(observations || 'Sin observaciones')}</td>
          <td class="text-end text-nowrap">
            <button type="button" class="btn btn-sm btn-outline-primary" data-action="receipt" data-id="${escapeHtml(payment.id)}">Constancia</button>
            ${annulled ? '' : `<button type="button" class="btn btn-sm btn-outline-danger ms-1" data-action="annul" data-id="${escapeHtml(payment.id)}">Anular</button>`}
          </td>
        </tr>
      `;
    }).join('');
  }
  ui.detallePagar.classList.toggle('d-none', isZeroAmount(cargo.saldo));
}

function renderReceipt() {
  const { consultorio, paciente, pago, cargo, generado_en: generatedAt } = state.constancia;
  const annulled = pago.estado === 'anulado';
  const clinicDetails = [
    consultorio.telefono ? `Teléfono: ${consultorio.telefono}` : null,
    consultorio.timezone ? `Zona administrativa: ${consultorio.timezone}` : null,
  ].filter(Boolean);
  const observations = [
    pago.observaciones ? `<div><span class="payment-receipt-label">Observaciones del pago</span>${escapeHtml(pago.observaciones)}</div>` : '',
    cargo.observaciones ? `<div><span class="payment-receipt-label">Observaciones del cargo</span>${escapeHtml(cargo.observaciones)}</div>` : '',
  ].filter(Boolean).join('');

  ui.constanciaContenido.innerHTML = `
    <header class="payment-receipt-header">
      <div class="payment-receipt-brand">${escapeHtml(consultorio.nombre || 'Odonton')}</div>
      <h3 class="payment-receipt-title">Constancia interna de pago — no fiscal</h3>
      ${clinicDetails.length ? `<div class="small text-secondary mt-2">${clinicDetails.map(escapeHtml).join(' · ')}</div>` : ''}
    </header>

    ${annulled ? '<div class="payment-receipt-annulled">PAGO ANULADO</div>' : ''}

    <section class="payment-receipt-section">
      <div class="payment-receipt-section-title">Paciente</div>
      <div class="payment-receipt-grid">
        <div><span class="payment-receipt-label">Nombre y apellido</span><strong>${escapeHtml(`${paciente.nombre || ''} ${paciente.apellido || ''}`.trim())}</strong></div>
        <div><span class="payment-receipt-label">DNI</span><strong>${escapeHtml(paciente.dni || '-')}</strong></div>
      </div>
    </section>

    <section class="payment-receipt-section">
      <div class="payment-receipt-section-title">Pago</div>
      <div class="payment-receipt-grid">
        <div><span class="payment-receipt-label">Número interno</span><strong>N.º ${escapeHtml(pago.id)}</strong></div>
        <div><span class="payment-receipt-label">Fecha</span><strong>${formatDate(pago.fecha_pago)}</strong></div>
        <div><span class="payment-receipt-label">Importe abonado</span><strong>${formatCurrency(pago.importe)}</strong></div>
        <div><span class="payment-receipt-label">Método</span><strong>${escapeHtml(methodLabel(pago.metodo_pago))}</strong></div>
        <div><span class="payment-receipt-label">Estado</span><strong>${annulled ? 'Anulado' : 'Activo'}</strong></div>
        ${annulled ? `<div><span class="payment-receipt-label">Fecha de anulación</span><strong>${escapeHtml(formatDateTime(pago.fecha_anulacion))}</strong></div>` : ''}
        ${annulled ? `<div class="grid-column-full"><span class="payment-receipt-label">Motivo de anulación</span><strong>${escapeHtml(pago.motivo_anulacion || 'Sin motivo informado')}</strong></div>` : ''}
      </div>
    </section>

    <section class="payment-receipt-section">
      <div class="payment-receipt-section-title">Cargo</div>
      <div class="payment-receipt-grid">
        <div><span class="payment-receipt-label">Número interno</span><strong>N.º ${escapeHtml(cargo.id)}</strong></div>
        <div><span class="payment-receipt-label">Concepto histórico</span><strong>${escapeHtml(cargo.concepto)}</strong></div>
        <div><span class="payment-receipt-label">Importe total</span><strong>${formatCurrency(cargo.importe_total)}</strong></div>
        <div><span class="payment-receipt-label">Total abonado actual</span><strong>${formatCurrency(cargo.total_abonado)}</strong></div>
        <div><span class="payment-receipt-label">Saldo restante</span><strong>${formatCurrency(cargo.saldo)}</strong></div>
        <div><span class="payment-receipt-label">Estado de cobro</span><strong>${escapeHtml(cargo.estado_cobro)}</strong></div>
      </div>
    </section>

    ${observations ? `<section class="payment-receipt-section"><div class="payment-receipt-section-title">Observaciones</div><div class="payment-receipt-grid">${observations}</div></section>` : ''}

    <footer class="payment-receipt-footer">
      <div>Generada el ${escapeHtml(formatDateTime(generatedAt))}</div>
      <div class="mt-2 fw-semibold">Constancia administrativa interna sin validez fiscal.</div>
    </footer>
  `;
}

async function openReceipt(paymentId) {
  try {
    const data = await getConstanciaPago(paymentId);
    state.constancia = data.constancia;
    renderReceipt();
    switchModal(ui.detalleModalEl, ui.constanciaModalEl);
  } catch (error) {
    showAlert(friendlyError(error));
  }
}

async function openCargoDetail(cargoId) {
  try {
    const data = await getCargoById(cargoId);
    state.cargoDetalle = {
      cargo: data.cargo,
      pagos: Array.isArray(data.pagos) ? data.pagos : [],
    };
    renderDetail();
    getModal(ui.detalleModalEl).show();
  } catch (error) {
    showAlert(friendlyError(error));
    await loadCargos();
  }
}

async function preparePayment(cargoId) {
  try {
    const data = await getCargoById(cargoId);
    state.cargoDetalle = { cargo: data.cargo, pagos: Array.isArray(data.pagos) ? data.pagos : [] };
    if (isZeroAmount(data.cargo.saldo)) {
      showAlert('El cargo ya se encuentra pagado.', 'warning');
      await loadCargos();
      return false;
    }
    ui.pagoForm.reset();
    ui.pagoSaldo.textContent = formatCurrency(data.cargo.saldo);
    ui.pagoImporte.max = data.cargo.saldo;
    ui.pagoImporte.value = data.cargo.saldo;
    ui.pagoFecha.value = todayInputValue();
    ui.pagoFecha.min = data.cargo.fecha_cargo;
    ui.pagoFecha.max = todayInputValue();
    return true;
  } catch (error) {
    showAlert(friendlyError(error));
    return false;
  }
}

function bindFiltersAndPagination() {
  ui.filtroForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (ui.filtroDesde.value && ui.filtroHasta.value && ui.filtroDesde.value > ui.filtroHasta.value) {
      showAlert('La fecha desde no puede ser posterior a la fecha hasta.', 'warning');
      return;
    }
    await loadCargos(1);
  });
  ui.filtroLimpiar.addEventListener('click', async () => {
    ui.filtroForm.reset();
    await loadCargos(1);
  });
  ui.paginaAnterior.addEventListener('click', () => loadCargos(state.paginacion.page - 1));
  ui.paginaSiguiente.addEventListener('click', () => loadCargos(state.paginacion.page + 1));
}

function bindCargoCreation() {
  ui.nuevoCargoBtn.addEventListener('click', () => {
    resetCargoForm();
    getModal(ui.cargoModalEl).show();
  });
  ui.cargoPaciente.addEventListener('change', async () => {
    await loadPatientTurns(ui.cargoPaciente.value);
  });
  ui.cargoTurno.addEventListener('change', () => {
    const turn = state.turnos.find((item) => String(item.id) === ui.cargoTurno.value);
    if (turn?.prestacion?.id) {
      ui.cargoPrestacion.value = String(turn.prestacion.id);
      applyPrestationSuggestion();
    }
  });
  ui.cargoPrestacion.addEventListener('change', applyPrestationSuggestion);

  ui.cargoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amountCents = decimalToCents(ui.cargoImporte.value);
    if (amountCents === null || amountCents <= 0n) {
      showAlert('Ingresá un importe total válido, mayor que cero.', 'warning');
      return;
    }
    if (!ui.cargoPrestacion.value && !ui.cargoConcepto.value.trim()) {
      showAlert('Ingresá un concepto o seleccioná una prestación.', 'warning');
      return;
    }
    if (ui.cargoFecha.value > todayInputValue()) {
      showAlert('La fecha del cargo no puede ser futura.', 'warning');
      return;
    }

    const payload = {
      paciente_id: ui.cargoPaciente.value,
      turno_id: ui.cargoTurno.value || null,
      prestacion_id: ui.cargoPrestacion.value || null,
      concepto: ui.cargoConcepto.value.trim() || null,
      importe_total: ui.cargoImporte.value,
      fecha_cargo: ui.cargoFecha.value,
      observaciones: ui.cargoObservaciones.value.trim() || null,
    };

    try {
      setSubmitting(ui.cargoSubmit, true, 'Creando...');
      await createCargo(payload);
      getModal(ui.cargoModalEl).hide();
      showAlert('Cargo registrado correctamente.', 'success');
      await loadCargos(1);
    } catch (error) {
      showAlert(friendlyError(error));
    } finally {
      setSubmitting(ui.cargoSubmit, false);
    }
  });
}

function bindCargoActions() {
  ui.cargosTbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'detail') await openCargoDetail(button.dataset.id);
    if (button.dataset.action === 'pay' && await preparePayment(button.dataset.id)) {
      getModal(ui.pagoModalEl).show();
    }
  });

  ui.detallePagar.addEventListener('click', async () => {
    const cargoId = state.cargoDetalle?.cargo?.id;
    if (!cargoId || !await preparePayment(cargoId)) return;
    switchModal(ui.detalleModalEl, ui.pagoModalEl);
  });

  ui.detallePagosTbody.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    if (button.dataset.action === 'receipt') {
      await openReceipt(button.dataset.id);
      return;
    }
    if (button.dataset.action !== 'annul') return;
    const payment = state.cargoDetalle?.pagos.find((item) => String(item.id) === button.dataset.id);
    if (!payment || payment.estado !== 'activo') return;
    state.pagoAAnular = payment;
    ui.anularForm.reset();
    ui.anularResumen.textContent = `Pago #${payment.id} por ${formatCurrency(payment.importe)} (${methodLabel(payment.metodo_pago)}).`;
    switchModal(ui.detalleModalEl, ui.anularModalEl);
  });
}

function bindPaymentForm() {
  ui.pagoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const cargo = state.cargoDetalle?.cargo;
    if (!cargo) return;
    const amountCents = decimalToCents(ui.pagoImporte.value);
    const balanceCents = decimalToCents(cargo.saldo);
    if (amountCents === null || amountCents <= 0n) {
      showAlert('Ingresá un importe válido, mayor que cero.', 'warning');
      return;
    }
    if (balanceCents !== null && amountCents > balanceCents) {
      showAlert(FRIENDLY_ERRORS.SOBREPAGO, 'warning');
      return;
    }
    if (ui.pagoFecha.value < cargo.fecha_cargo || ui.pagoFecha.value > todayInputValue()) {
      showAlert('La fecha debe estar entre la fecha del cargo y hoy.', 'warning');
      return;
    }

    try {
      setSubmitting(ui.pagoSubmit, true, 'Registrando...');
      await createPago({
        cargo_id: cargo.id,
        importe: ui.pagoImporte.value,
        metodo_pago: ui.pagoMetodo.value,
        fecha_pago: ui.pagoFecha.value,
        observaciones: ui.pagoObservaciones.value.trim() || null,
      });
      showAlert('Pago registrado correctamente.', 'success');
      await hideModalThen(ui.pagoModalEl, async () => {
        await loadCargos();
        await openCargoDetail(cargo.id);
      });
    } catch (error) {
      showAlert(friendlyError(error));
    } finally {
      setSubmitting(ui.pagoSubmit, false);
    }
  });

  ui.anularForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payment = state.pagoAAnular;
    const cargoId = state.cargoDetalle?.cargo?.id;
    const reason = ui.anularMotivo.value.trim();
    if (!payment || !cargoId) return;
    if (!reason) {
      showAlert('Ingresá el motivo de la anulación.', 'warning');
      return;
    }

    try {
      setSubmitting(ui.anularSubmit, true, 'Anulando...');
      await anularPago(payment.id, { motivo: reason });
      showAlert('Pago anulado correctamente.', 'success');
      state.pagoAAnular = null;
      await hideModalThen(ui.anularModalEl, async () => {
        await loadCargos();
        await openCargoDetail(cargoId);
      });
    } catch (error) {
      showAlert(friendlyError(error));
    } finally {
      setSubmitting(ui.anularSubmit, false);
    }
  });
}

function bindReceiptPrint() {
  ui.constanciaImprimir.addEventListener('click', () => {
    const clearPrintMode = () => document.body.classList.remove('constancia-print-active');
    document.body.classList.add('constancia-print-active');
    window.addEventListener('afterprint', clearPrintMode, { once: true });
    window.print();
    window.setTimeout(clearPrintMode, 60000);
  });
}

export async function initPagosView() {
  bindFiltersAndPagination();
  bindCargoCreation();
  bindCargoActions();
  bindPaymentForm();
  bindReceiptPrint();

  try {
    await Promise.all([loadPatients(), loadPrestations()]);
  } catch (error) {
    showAlert(`No se pudieron cargar los datos auxiliares: ${friendlyError(error)}`);
  }
  await loadCargos(1);
}
