import {
  getEstadisticas,
  getPacientes,
  getResumenClinicoFinanciero,
  getTurnos,
} from '../js/api.js';

const ui = {
  pacientes: document.getElementById('stat-pacientes'),
  turnosHoy: document.getElementById('stat-turnos-hoy'),
  tratamientos: document.getElementById('stat-tratamientos'),
  ingresos: document.getElementById('stat-ingresos'),
  chartAtenciones: document.getElementById('chart-atenciones'),
  chartIngresos: document.getElementById('chart-ingresos'),
  chartTratamientos: document.getElementById('chart-tratamientos'),
};

function formatCurrency(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? '0').trim());
  if (!match) return '$ 0,00';
  const integer = match[1].replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(match[2] || '').padEnd(2, '0');
  return `$ ${integer},${decimals}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfSixMonthWindow(date) {
  return new Date(date.getFullYear(), date.getMonth() - 5, 1);
}

function formatDateForApi(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildMonthBuckets(monthsBack = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString('es-AR', { month: 'short' }),
      turnos: 0,
    });
  }
  return buckets;
}

function aggregateByMonth(rows = []) {
  const buckets = buildMonthBuckets(6);
  const map = new Map(buckets.map((b) => [b.key, b]));

  rows.forEach((row) => {
    const date = new Date(row.dia);
    if (Number.isNaN(date.getTime())) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const bucket = map.get(key);
    if (!bucket) return;
    bucket.turnos += Number(row.total_realizados) || 0;
  });

  return buckets;
}

function destroyChart(chart) {
  if (chart && chart.destroy) chart.destroy();
}

let chartAtenciones = null;
let chartIngresos = null;
let chartTratamientos = null;

function renderCharts({ turnosPorDia, topPrestaciones, ingresosPorMetodo } = {}) {
  if (typeof window.Chart !== 'function') return;

  if (ui.chartAtenciones && Array.isArray(turnosPorDia)) {
    const buckets = aggregateByMonth(turnosPorDia);
    const labels = buckets.map((b) => b.label);
    const dataTurnos = buckets.map((b) => b.turnos);
    destroyChart(chartAtenciones);
    chartAtenciones = new window.Chart(ui.chartAtenciones, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Atenciones',
            data: dataTurnos,
            borderColor: '#1c3f5f',
            backgroundColor: 'rgba(28, 63, 95, 0.1)',
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  if (ui.chartIngresos && ingresosPorMetodo) {
    const metodosLabels = ['Efectivo', 'Tarjeta', 'Transferencia'];
    const dataIngresos = [
      ingresosPorMetodo.efectivo,
      ingresosPorMetodo.tarjeta,
      ingresosPorMetodo.transferencia,
    ].map((value) => Number(value) || 0);
    destroyChart(chartIngresos);
    chartIngresos = new window.Chart(ui.chartIngresos, {
      type: 'bar',
      data: {
        labels: metodosLabels,
        datasets: [
          {
            label: 'Ingresos',
            data: dataIngresos,
            backgroundColor: '#2f6ea0',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  if (ui.chartTratamientos && Array.isArray(topPrestaciones)) {
    const labelsTrat = topPrestaciones.map((p) => p.prestacion_nombre);
    const dataTrat = topPrestaciones.map((p) => p.cantidad);
    destroyChart(chartTratamientos);
    chartTratamientos = new window.Chart(ui.chartTratamientos, {
      type: 'doughnut',
      data: {
        labels: labelsTrat,
        datasets: [
          {
            data: dataTrat,
            backgroundColor: ['#1c3f5f', '#2f6ea0', '#8bb6d8', '#b7d3ea', '#e2edf7'],
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  }
}

export async function loadDashboard() {
  const now = new Date();
  const desdeMes = formatDateForApi(startOfMonth(now));
  const hastaMes = formatDateForApi(endOfMonth(now));
  const desdeSeisMeses = formatDateForApi(startOfSixMonthWindow(now));
  const today = formatDateForApi(now);

  const [statsResult, financialResult, pacientesResult, turnosResult] = await Promise.allSettled([
    getEstadisticas({ fecha_desde: desdeSeisMeses, fecha_hasta: hastaMes }),
    getResumenClinicoFinanciero({ fecha_desde: desdeMes, fecha_hasta: hastaMes, resumen: 'true' }),
    getPacientes({ limit: 1, page: 1 }),
    getTurnos({ limit: 1, page: 1, fecha_desde: today, fecha_hasta: today }),
  ]);

  if (statsResult.status === 'fulfilled') {
    const stats = statsResult.value;
    renderCharts({
      turnosPorDia: stats.turnos_por_dia || [],
      topPrestaciones: stats.top_prestaciones || [],
    });
  }

  if (financialResult.status === 'fulfilled') {
    const report = financialResult.value;
    ui.tratamientos.textContent = report.clinico?.resumen?.total_realizados ?? '-';
    ui.ingresos.textContent = formatCurrency(report.financiero?.ingresos_reales);
    renderCharts({ ingresosPorMetodo: report.financiero?.ingresos_por_metodo || {} });
  }

  if (pacientesResult.status === 'fulfilled') {
    const pacientes = pacientesResult.value;
    ui.pacientes.textContent = pacientes.total ?? '-';
  }

  if (turnosResult.status === 'fulfilled') {
    const turnosHoy = turnosResult.value;
    ui.turnosHoy.textContent = turnosHoy.total ?? '-';
  }

  const failures = [statsResult, financialResult, pacientesResult, turnosResult]
    .filter((result) => result.status === 'rejected');
  if (failures.length) {
    console.warn(`[DASHBOARD] No se pudieron cargar ${failures.length} indicadores.`);
  }
}
