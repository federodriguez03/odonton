import {
  getEstadisticas,
  getPacientes,
  getTratamientos,
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
  const num = Number(value);
  if (!Number.isFinite(num)) return '$ 0.00';
  return `$ ${num.toFixed(2)}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
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
      ingresos: 0,
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
    bucket.turnos += Number(row.total_turnos) || 0;
    bucket.ingresos += Number(row.ingresos_estimados) || 0;
  });

  return buckets;
}

function destroyChart(chart) {
  if (chart && chart.destroy) chart.destroy();
}

let chartAtenciones = null;
let chartIngresos = null;
let chartTratamientos = null;

function renderCharts({ turnosPorDia = [], topPrestaciones = [] }) {
  if (typeof window.Chart !== 'function') return;

  const buckets = aggregateByMonth(turnosPorDia);

  const labels = buckets.map((b) => b.label);
  const dataTurnos = buckets.map((b) => b.turnos);
  const dataIngresos = buckets.map((b) => b.ingresos);

  destroyChart(chartAtenciones);
  destroyChart(chartIngresos);
  destroyChart(chartTratamientos);

  if (ui.chartAtenciones) {
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

  if (ui.chartIngresos) {
    chartIngresos = new window.Chart(ui.chartIngresos, {
      type: 'bar',
      data: {
        labels,
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

  if (ui.chartTratamientos) {
    const labelsTrat = topPrestaciones.map((p) => p.prestacion_nombre);
    const dataTrat = topPrestaciones.map((p) => p.cantidad);
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
  const today = formatDateForApi(now);

  const [statsResult, pacientesResult, turnosResult, tratamientosResult] = await Promise.allSettled([
    getEstadisticas({ fecha_desde: desdeMes, fecha_hasta: hastaMes }),
    getPacientes({ limit: 1, page: 1 }),
    getTurnos({ limit: 1, page: 1, fecha_desde: today, fecha_hasta: today }),
    getTratamientos({ desde: desdeMes, hasta: hastaMes }),
  ]);

  if (statsResult.status === 'fulfilled') {
    const stats = statsResult.value;
    ui.ingresos.textContent = formatCurrency(stats.resumen?.ingresos_estimados);
    ui.tratamientos.textContent = stats.resumen?.total_realizados ?? '-';
    renderCharts({
      turnosPorDia: stats.turnos_por_dia || [],
      topPrestaciones: stats.top_prestaciones || [],
    });
  }

  if (pacientesResult.status === 'fulfilled') {
    const pacientes = pacientesResult.value;
    ui.pacientes.textContent = pacientes.total ?? '-';
  }

  if (turnosResult.status === 'fulfilled') {
    const turnosHoy = turnosResult.value;
    ui.turnosHoy.textContent = turnosHoy.total ?? '-';
  }

  if (tratamientosResult.status === 'fulfilled') {
    const tratamientos = tratamientosResult.value;
    if (Array.isArray(tratamientos.tratamientos)) {
      ui.tratamientos.textContent = tratamientos.tratamientos.length;
    }
  }

  const failures = [statsResult, pacientesResult, turnosResult, tratamientosResult]
    .filter((result) => result.status === 'rejected');
  if (failures.length) {
    console.warn(`[DASHBOARD] No se pudieron cargar ${failures.length} indicadores.`);
  }
}
