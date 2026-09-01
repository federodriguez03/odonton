import { getEstadisticas } from '../api.js';
import { renderAlert } from '../components/alerts.js';

const ui = {
  alertContainer: document.getElementById('alert-container'),
  form: document.getElementById('estadisticas-form'),
  fechaDesde: document.getElementById('estadisticas-desde'),
  fechaHasta: document.getElementById('estadisticas-hasta'),
  rangoLabel: document.getElementById('estadisticas-rango'),
  resumenCards: document.getElementById('estadisticas-resumen'),
  chartTurnos: document.getElementById('chart-turnos'),
  chartPacientes: document.getElementById('chart-pacientes'),
  chartTurnosSvg: document.getElementById('chart-turnos-svg'),
  chartPacientesSvg: document.getElementById('chart-pacientes-svg'),
  topPrestacionesBody: document.getElementById('estadisticas-prestaciones-tbody'),
};

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function renderResumen(resumen = {}) {
  const items = [
    { label: 'Total turnos', value: resumen.total_turnos ?? 0 },
    { label: 'Realizados', value: resumen.total_realizados ?? 0 },
    { label: 'Cancelados', value: resumen.total_cancelados ?? 0 },
    { label: 'Reprogramados', value: resumen.total_reprogramados ?? 0 },
    { label: 'Confirmados', value: resumen.total_confirmados ?? 0 },
  ];

  ui.resumenCards.innerHTML = items
    .map(
      (item) => `
        <div class="report-card border rounded-3 p-3 bg-white">
          <div class="text-secondary small">${item.label}</div>
          <div class="fw-semibold">${item.value}</div>
        </div>
      `,
    )
    .join('');
}

function renderLineChart(svg, rows, labelKey, valueKey, emptyLabel) {
  if (!svg) return;

  if (!rows.length) {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 560 220');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '50%');
    text.setAttribute('y', '50%');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'chart-label');
    text.textContent = emptyLabel;
    svg.appendChild(text);
    return;
  }

  const width = 560;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 32, left: 36 };
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = '';

  const values = rows.map((row) => Number(row[valueKey]) || 0);
  const labels = rows.map((row) => row[labelKey]);
  const maxValue = Math.max(...values, 1);

  const xStep = (width - padding.left - padding.right) / Math.max(values.length - 1, 1);

  const points = values.map((value, idx) => {
    const x = padding.left + idx * xStep;
    const y = height - padding.bottom - (value / maxValue) * (height - padding.top - padding.bottom);
    return { x, y };
  });

  const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  grid.setAttribute('x1', padding.left);
  grid.setAttribute('x2', width - padding.right);
  grid.setAttribute('y1', height - padding.bottom);
  grid.setAttribute('y2', height - padding.bottom);
  grid.setAttribute('class', 'chart-axis');
  svg.appendChild(grid);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const d = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  path.setAttribute('d', d);
  path.setAttribute('class', 'chart-line');
  svg.appendChild(path);

  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const areaD = `${d} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;
  area.setAttribute('d', areaD);
  area.setAttribute('class', 'chart-area');
  svg.appendChild(area);

  points.forEach((p, idx) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', 3.5);
    circle.setAttribute('class', 'chart-point');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${labels[idx]}: ${values[idx]}`;
    circle.appendChild(title);
    svg.appendChild(circle);
  });

  const labelStep = Math.ceil(labels.length / 6);
  labels.forEach((label, idx) => {
    if (idx % labelStep !== 0 && idx !== labels.length - 1) return;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', points[idx].x);
    text.setAttribute('y', height - 10);
    text.setAttribute('class', 'chart-label');
    text.setAttribute('text-anchor', 'middle');
    text.textContent = label;
    svg.appendChild(text);
  });

  const maxText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  maxText.setAttribute('x', padding.left);
  maxText.setAttribute('y', padding.top + 4);
  maxText.setAttribute('class', 'chart-value');
  maxText.textContent = maxValue;
  svg.appendChild(maxText);
}

function renderTurnosChart(rows = []) {
  const mapped = rows.map((row) => ({
    label: formatDate(row.dia),
    value: row.total_turnos,
  }));
  renderLineChart(ui.chartTurnosSvg, mapped, 'label', 'value', 'Sin datos de turnos en el rango.');
}

function renderPacientesChart(rows = []) {
  const mapped = rows.map((row) => ({
    label: formatDate(row.dia),
    value: row.nuevos_pacientes,
  }));
  renderLineChart(ui.chartPacientesSvg, mapped, 'label', 'value', 'Sin nuevos pacientes en el rango.');
}

function renderTopPrestaciones(rows = []) {
  if (!rows.length) {
    ui.topPrestacionesBody.innerHTML =
      '<tr><td colspan="2" class="text-center text-secondary">Sin datos</td></tr>';
    return;
  }

  ui.topPrestacionesBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.prestacion_nombre}</td>
          <td>${row.cantidad}</td>
        </tr>
      `,
    )
    .join('');
}

function renderRango(rango) {
  if (!rango) {
    ui.rangoLabel.textContent = '';
    return;
  }
  const desde = new Date(rango.desde).toLocaleDateString('es-AR');
  const hasta = new Date(rango.hasta).toLocaleDateString('es-AR');
  ui.rangoLabel.textContent = `Rango: ${desde} - ${hasta}`;
}

async function generarEstadisticas() {
  const desde = ui.fechaDesde.value;
  const hasta = ui.fechaHasta.value;

  if (!desde || !hasta) {
    renderAlert(ui.alertContainer, 'Seleccione fecha desde y hasta.', 'warning');
    return;
  }

  try {
    const data = await getEstadisticas({
      fecha_desde: desde,
      fecha_hasta: hasta,
    });
    renderRango(data.rango);
    renderResumen(data.resumen || {});
    renderTurnosChart(data.turnos_por_dia || []);
    renderPacientesChart(data.pacientes_nuevos_por_dia || []);
    renderTopPrestaciones(data.top_prestaciones || []);
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function bindForm() {
  ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await generarEstadisticas();
  });
}

export async function initEstadisticasView() {
  bindForm();
}
