import { getResumenClinicoFinanciero } from '../api.js';
import { renderAlert } from '../components/alerts.js';

const ui = {
  alertContainer: document.getElementById('alert-container'),
  form: document.getElementById('reportes-form'),
  fechaDesde: document.getElementById('reportes-desde'),
  fechaHasta: document.getElementById('reportes-hasta'),
  incluirDetalle: document.getElementById('reportes-detalle'),
  exportCsv: document.getElementById('reportes-export-csv'),
  exportPdf: document.getElementById('reportes-export-pdf'),
  financieroCards: document.getElementById('reportes-resumen'),
  clinicoCards: document.getElementById('reportes-clinico-resumen'),
  metodosTable: document.getElementById('reportes-metodos-tbody'),
  prestacionTable: document.getElementById('reportes-prestaciones-tbody'),
  turnosWrap: document.getElementById('reportes-turnos-wrap'),
  turnosTable: document.getElementById('reportes-turnos-tbody'),
  rangoLabel: document.getElementById('reportes-rango'),
  criterioLabel: document.getElementById('reportes-criterio'),
};

let lastReport = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatCurrency(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '0').trim());
  if (!match) return '$ 0,00';
  const integer = match[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(match[2] || '').padEnd(2, '0');
  return `$ ${integer},${decimals}`;
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

function renderCards(container, items) {
  container.innerHTML = items.map((item) => `
    <div class="report-card border rounded-3 p-3 bg-white">
      <div class="text-secondary small">${escapeHtml(item.label)}</div>
      <div class="fw-semibold fs-5">${escapeHtml(item.value)}</div>
      ${item.help ? `<div class="small text-secondary mt-1">${escapeHtml(item.help)}</div>` : ''}
    </div>
  `).join('');
}

function renderFinancial(financial = {}) {
  renderCards(ui.financieroCards, [
    { label: 'Ingresos reales', value: formatCurrency(financial.ingresos_reales), help: 'Pagos activos del período' },
    { label: 'Total adeudado', value: formatCurrency(financial.total_adeudado), help: 'Saldo actual de cargos del período' },
    { label: 'Cargos pendientes', value: financial.cargos_pendientes ?? 0 },
    { label: 'Cargos parciales', value: financial.cargos_parciales ?? 0 },
    { label: 'Cargos pagados', value: financial.cargos_pagados ?? 0 },
    { label: 'Pagos anulados', value: financial.pagos_anulados ?? 0, help: 'Informativo; no suman ingresos' },
  ]);

  const methods = financial.ingresos_por_metodo || {};
  ui.metodosTable.innerHTML = [
    ['Efectivo', methods.efectivo],
    ['Tarjeta', methods.tarjeta],
    ['Transferencia', methods.transferencia],
  ].map(([label, value]) => `<tr><td>${label}</td><td class="text-end">${formatCurrency(value)}</td></tr>`).join('');
}

function renderClinical(clinical = {}) {
  const summary = clinical.resumen || {};
  renderCards(ui.clinicoCards, [
    { label: 'Total turnos', value: summary.total_turnos ?? 0 },
    { label: 'Realizados', value: summary.total_realizados ?? 0 },
    { label: 'Cancelados', value: summary.total_cancelados ?? 0 },
    { label: 'Reprogramados', value: summary.total_reprogramados ?? 0 },
    { label: 'Confirmados', value: summary.total_confirmados ?? 0 },
  ]);
}

function renderPrestations(rows = []) {
  if (!rows.length) {
    ui.prestacionTable.innerHTML = '<tr><td colspan="2" class="text-center text-secondary">Sin prestaciones realizadas en el rango</td></tr>';
    return;
  }
  ui.prestacionTable.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.prestacion_nombre)}</td>
      <td>${escapeHtml(row.cantidad)}</td>
    </tr>
  `).join('');
}

function renderTurns(rows = []) {
  if (!rows.length) {
    ui.turnosTable.innerHTML = '<tr><td colspan="5" class="text-center text-secondary">Sin turnos en el rango</td></tr>';
    return;
  }
  ui.turnosTable.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatDateTime(row.fecha_hora_inicio)}</td>
      <td>${escapeHtml(`${row.paciente_apellido || ''}, ${row.paciente_nombre || ''}`.replace(/^,\s*/, ''))}</td>
      <td>${escapeHtml(row.paciente_dni || '-')}</td>
      <td>${escapeHtml(row.prestacion_nombre || '-')}</td>
      <td><span class="badge text-bg-light border">${escapeHtml(row.estado || '-')}</span></td>
    </tr>
  `).join('');
}

function renderRange(range) {
  ui.rangoLabel.textContent = range ? `Período: ${formatDate(range.desde)} al ${formatDate(range.hasta)}` : '';
  ui.criterioLabel.textContent = range
    ? 'Ingresos por fecha de pago · Cargos y saldos por fecha de cargo · Fechas inclusivas'
    : '';
}

function csvValue(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function buildCsv(report) {
  const financial = report.financiero || {};
  const clinical = report.clinico || {};
  const summary = clinical.resumen || {};
  const methods = financial.ingresos_por_metodo || {};
  const lines = [
    'Resumen financiero',
    `Ingresos reales,${financial.ingresos_reales || '0.00'}`,
    `Total adeudado,${financial.total_adeudado || '0.00'}`,
    `Cargos pendientes,${financial.cargos_pendientes ?? 0}`,
    `Cargos parciales,${financial.cargos_parciales ?? 0}`,
    `Cargos pagados,${financial.cargos_pagados ?? 0}`,
    `Pagos anulados informativos,${financial.pagos_anulados ?? 0}`,
    '',
    'Ingresos reales por método',
    `Efectivo,${methods.efectivo || '0.00'}`,
    `Tarjeta,${methods.tarjeta || '0.00'}`,
    `Transferencia,${methods.transferencia || '0.00'}`,
    '',
    'Resumen clínico',
    `Total turnos,${summary.total_turnos ?? 0}`,
    `Realizados,${summary.total_realizados ?? 0}`,
    `Cancelados,${summary.total_cancelados ?? 0}`,
    `Reprogramados,${summary.total_reprogramados ?? 0}`,
    `Confirmados,${summary.total_confirmados ?? 0}`,
    '',
    'Prestaciones realizadas',
    'Prestación,Cantidad',
  ];

  (clinical.prestaciones_realizadas || []).forEach((row) => {
    lines.push(`${csvValue(row.prestacion_nombre)},${row.cantidad}`);
  });

  if (Array.isArray(clinical.turnos)) {
    lines.push('', 'Detalle clínico', 'Fecha,Paciente,DNI,Prestación,Estado');
    clinical.turnos.forEach((row) => {
      const patient = `${row.paciente_apellido || ''}, ${row.paciente_nombre || ''}`.trim();
      lines.push([
        csvValue(formatDateTime(row.fecha_hora_inicio)),
        csvValue(patient),
        csvValue(row.paciente_dni),
        csvValue(row.prestacion_nombre),
        csvValue(row.estado),
      ].join(','));
    });
  }
  return lines.join('\n');
}

function downloadCsv(report) {
  const blob = new Blob([buildCsv(report)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'resumen_clinico_financiero.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function printReport(report) {
  const financial = report.financiero || {};
  const clinical = report.clinico || {};
  const summary = clinical.resumen || {};
  const methods = financial.ingresos_por_metodo || {};
  const rows = [
    ['Ingresos reales', formatCurrency(financial.ingresos_reales)],
    ['Total adeudado', formatCurrency(financial.total_adeudado)],
    ['Cargos pendientes', financial.cargos_pendientes ?? 0],
    ['Cargos parciales', financial.cargos_parciales ?? 0],
    ['Cargos pagados', financial.cargos_pagados ?? 0],
    ['Efectivo', formatCurrency(methods.efectivo)],
    ['Tarjeta', formatCurrency(methods.tarjeta)],
    ['Transferencia', formatCurrency(methods.transferencia)],
  ];
  const clinicalRows = [
    ['Total turnos', summary.total_turnos ?? 0],
    ['Realizados', summary.total_realizados ?? 0],
    ['Cancelados', summary.total_cancelados ?? 0],
    ['Reprogramados', summary.total_reprogramados ?? 0],
    ['Confirmados', summary.total_confirmados ?? 0],
  ];
  const tableRows = (values) => values.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('');
  const reportWindow = window.open('', '_blank', 'width=900,height=800');
  if (!reportWindow) return;
  reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Resumen clínico y financiero</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:28px}h1{margin-bottom:4px}h2{margin-top:24px}p{color:#526173}table{width:100%;border-collapse:collapse}td{border:1px solid #dbe3eb;padding:8px}td:first-child{font-weight:600}</style></head><body><h1>Resumen clínico y financiero</h1><p>${escapeHtml(ui.rangoLabel.textContent)} · Ingresos por fecha de pago; cargos por fecha de cargo.</p><h2>Resumen financiero</h2><table>${tableRows(rows)}</table><h2>Reporte clínico</h2><table>${tableRows(clinicalRows)}</table></body></html>`);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.print();
}

async function generateReport() {
  const from = ui.fechaDesde.value;
  const to = ui.fechaHasta.value;
  if (!from || !to) {
    renderAlert(ui.alertContainer, 'Seleccioná fecha desde y hasta.', 'warning');
    return;
  }
  if (from > to) {
    renderAlert(ui.alertContainer, 'La fecha desde no puede ser posterior a la fecha hasta.', 'warning');
    return;
  }

  try {
    const data = await getResumenClinicoFinanciero({
      fecha_desde: from,
      fecha_hasta: to,
      resumen: ui.incluirDetalle.checked ? 'false' : 'true',
    });
    lastReport = data;
    renderRange(data.rango);
    renderFinancial(data.financiero);
    renderClinical(data.clinico);
    renderPrestations(data.clinico?.prestaciones_realizadas || []);
    const turns = data.clinico?.turnos;
    ui.turnosWrap.classList.toggle('d-none', !Array.isArray(turns));
    if (Array.isArray(turns)) renderTurns(turns);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function setDefaultRange() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  ui.fechaDesde.value = `${year}-${month}-01`;
  ui.fechaHasta.value = `${year}-${month}-${day}`;
}

export async function initReportesView() {
  setDefaultRange();
  ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await generateReport();
  });
  ui.exportCsv.addEventListener('click', () => {
    if (lastReport) downloadCsv(lastReport);
    else renderAlert(ui.alertContainer, 'Primero generá un reporte.', 'warning');
  });
  ui.exportPdf.addEventListener('click', () => {
    if (lastReport) printReport(lastReport);
    else renderAlert(ui.alertContainer, 'Primero generá un reporte.', 'warning');
  });
}
