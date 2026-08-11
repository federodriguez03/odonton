import { getReporteAtencionFacturacion } from '../api.js';
import { renderAlert } from '../components/alerts.js';

const ui = {
  alertContainer: document.getElementById('alert-container'),
  form: document.getElementById('reportes-form'),
  fechaDesde: document.getElementById('reportes-desde'),
  fechaHasta: document.getElementById('reportes-hasta'),
  incluirDetalle: document.getElementById('reportes-detalle'),
  exportCsv: document.getElementById('reportes-export-csv'),
  exportPdf: document.getElementById('reportes-export-pdf'),
  resumenCards: document.getElementById('reportes-resumen'),
  prestacionTable: document.getElementById('reportes-prestaciones-tbody'),
  turnosWrap: document.getElementById('reportes-turnos-wrap'),
  turnosTable: document.getElementById('reportes-turnos-tbody'),
  rangoLabel: document.getElementById('reportes-rango'),
};

let lastReport = null;

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '$ 0.00';
  return `$ ${num.toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-AR');
}

function renderResumen(resumen) {
  const items = [
    { label: 'Total turnos', value: resumen.total_turnos ?? 0 },
    { label: 'Realizados', value: resumen.total_realizados ?? 0 },
    { label: 'Cancelados', value: resumen.total_cancelados ?? 0 },
    { label: 'Reprogramados', value: resumen.total_reprogramados ?? 0 },
    { label: 'Confirmados', value: resumen.total_confirmados ?? 0 },
    { label: 'Ingresos estimados', value: formatCurrency(resumen.ingresos_estimados) },
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

function renderPorPrestacion(rows = []) {
  if (!rows.length) {
    ui.prestacionTable.innerHTML =
      '<tr><td colspan="3" class="text-center text-secondary">Sin datos para el rango</td></tr>';
    return;
  }

  ui.prestacionTable.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.prestacion_nombre}</td>
          <td>${row.cantidad}</td>
          <td>${formatCurrency(row.ingresos_estimados)}</td>
        </tr>
      `,
    )
    .join('');
}

function renderTurnos(rows = []) {
  if (!rows.length) {
    ui.turnosTable.innerHTML =
      '<tr><td colspan="6" class="text-center text-secondary">Sin turnos en el rango</td></tr>';
    return;
  }

  ui.turnosTable.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${formatDateTime(row.fecha_hora_inicio)}</td>
          <td>${row.paciente_apellido || ''}, ${row.paciente_nombre || ''}</td>
          <td>${row.paciente_dni || '-'}</td>
          <td>${row.prestacion_nombre || '-'}</td>
          <td><span class="badge text-bg-light border">${row.estado || '-'}</span></td>
          <td>${formatCurrency(row.prestacion_precio_base)}</td>
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

function buildCsv(report) {
  const lines = [];

  lines.push('Resumen');
  const resumen = report.resumen || {};
  lines.push('Total turnos,' + (resumen.total_turnos ?? 0));
  lines.push('Realizados,' + (resumen.total_realizados ?? 0));
  lines.push('Cancelados,' + (resumen.total_cancelados ?? 0));
  lines.push('Reprogramados,' + (resumen.total_reprogramados ?? 0));
  lines.push('Confirmados,' + (resumen.total_confirmados ?? 0));
  lines.push('Ingresos estimados,' + (resumen.ingresos_estimados ?? 0));
  lines.push('');

  lines.push('Resumen por prestacion');
  lines.push('Prestacion,Cantidad,Ingresos estimados');
  (report.por_prestacion || []).forEach((row) => {
    lines.push(`"${row.prestacion_nombre}",${row.cantidad},${row.ingresos_estimados}`);
  });
  lines.push('');

  if (Array.isArray(report.turnos)) {
    lines.push('Detalle de turnos');
    lines.push('Fecha,Paciente,DNI,Prestacion,Estado,Precio base');
    report.turnos.forEach((row) => {
      const paciente = `${row.paciente_apellido || ''}, ${row.paciente_nombre || ''}`.trim();
      lines.push(
        `"${formatDateTime(row.fecha_hora_inicio)}","${paciente}","${row.paciente_dni || ''}","${row.prestacion_nombre || ''}","${row.estado || ''}",${row.prestacion_precio_base || ''}`,
      );
    });
  }

  return lines.join('\n');
}

function downloadCsv(report) {
  const csv = buildCsv(report);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reporte_atencion_facturacion.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function printPdf(report) {
  const rango = report.rango || {};
  const resumen = report.resumen || {};
  const porPrestacion = report.por_prestacion || [];
  const turnos = report.turnos || [];

  const resumenRows = [
    ['Total turnos', resumen.total_turnos ?? 0],
    ['Realizados', resumen.total_realizados ?? 0],
    ['Cancelados', resumen.total_cancelados ?? 0],
    ['Reprogramados', resumen.total_reprogramados ?? 0],
    ['Confirmados', resumen.total_confirmados ?? 0],
    ['Ingresos estimados', formatCurrency(resumen.ingresos_estimados)],
  ];

  const resumenHtml = resumenRows
    .map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`)
    .join('');

  const prestacionHtml = porPrestacion.length
    ? porPrestacion
        .map(
          (row) => `
          <tr>
            <td>${row.prestacion_nombre}</td>
            <td>${row.cantidad}</td>
            <td>${formatCurrency(row.ingresos_estimados)}</td>
          </tr>
        `,
        )
        .join('')
    : '<tr><td colspan="3">Sin datos</td></tr>';

  const turnosHtml = turnos.length
    ? turnos
        .map(
          (row) => `
          <tr>
            <td>${formatDateTime(row.fecha_hora_inicio)}</td>
            <td>${row.paciente_apellido || ''}, ${row.paciente_nombre || ''}</td>
            <td>${row.paciente_dni || '-'}</td>
            <td>${row.prestacion_nombre || '-'}</td>
            <td>${row.estado || '-'}</td>
            <td>${formatCurrency(row.prestacion_precio_base)}</td>
          </tr>
        `,
        )
        .join('')
    : '';

  const html = `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Reporte atencion y facturacion</title>
    <style>
      body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
      h1, h2 { margin: 0 0 12px 0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th, td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 12px; }
      th { background: #f8fafc; text-align: left; }
      .meta { color: #475569; font-size: 12px; margin-bottom: 16px; }
    </style>
  </head>
  <body>
    <h1>Reporte de atencion y facturacion</h1>
    <div class="meta">Rango: ${new Date(rango.desde).toLocaleDateString('es-AR')} - ${new Date(rango.hasta).toLocaleDateString('es-AR')}</div>

    <h2>Resumen</h2>
    <table>
      <tbody>${resumenHtml}</tbody>
    </table>

    <h2>Resumen por prestacion</h2>
    <table>
      <thead><tr><th>Prestacion</th><th>Cantidad</th><th>Ingresos estimados</th></tr></thead>
      <tbody>${prestacionHtml}</tbody>
    </table>

    ${turnos.length ? `
      <h2>Detalle de turnos</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Paciente</th><th>DNI</th><th>Prestacion</th><th>Estado</th><th>Precio base</th></tr></thead>
        <tbody>${turnosHtml}</tbody>
      </table>
    ` : ''}
  </body>
  </html>`;

  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

async function generarReporte() {
  const desde = ui.fechaDesde.value;
  const hasta = ui.fechaHasta.value;
  const resumenOnly = !ui.incluirDetalle.checked;

  if (!desde || !hasta) {
    renderAlert(ui.alertContainer, 'Seleccione fecha desde y hasta.', 'warning');
    return;
  }

  try {
    const data = await getReporteAtencionFacturacion({
      fecha_desde: desde,
      fecha_hasta: hasta,
      resumen: resumenOnly ? 'true' : 'false',
    });

    lastReport = data;
    renderRango(data.rango);
    renderResumen(data.resumen || {});
    renderPorPrestacion(data.por_prestacion || []);

    if (resumenOnly) {
      ui.turnosWrap.classList.add('d-none');
    } else {
      ui.turnosWrap.classList.remove('d-none');
      renderTurnos(data.turnos || []);
    }
  } catch (error) {
    renderAlert(ui.alertContainer, error.message, 'danger');
  }
}

function bindForm() {
  ui.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await generarReporte();
  });
}

function bindExport() {
  ui.exportCsv?.addEventListener('click', () => {
    if (!lastReport) {
      renderAlert(ui.alertContainer, 'Primero generá un reporte.', 'warning');
      return;
    }
    downloadCsv(lastReport);
  });

  ui.exportPdf?.addEventListener('click', () => {
    if (!lastReport) {
      renderAlert(ui.alertContainer, 'Primero generá un reporte.', 'warning');
      return;
    }
    printPdf(lastReport);
  });
}

export async function initReportesView() {
  bindForm();
  bindExport();
}
