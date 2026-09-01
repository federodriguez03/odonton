const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

async function testDashboardFrontend() {
  const ids = [
    'stat-pacientes',
    'stat-turnos-hoy',
    'stat-tratamientos',
    'stat-ingresos',
    'chart-atenciones',
    'chart-ingresos',
    'chart-tratamientos',
  ];
  const elements = new Map(ids.map((id) => [id, { id, textContent: '' }]));
  const chartConfigs = [];
  const requests = [];

  global.document = {
    getElementById: (id) => elements.get(id) || null,
  };
  global.localStorage = {
    getItem: () => 'jwt-de-prueba',
    setItem: () => {},
    removeItem: () => {},
  };
  global.window = {
    Chart: function FakeChart(_element, config) {
      chartConfigs.push(config);
      this.destroy = () => {};
    },
    dispatchEvent: () => {},
  };

  const now = new Date();
  const currentMonthDay = formatDate(new Date(now.getFullYear(), now.getMonth(), 10));

  async function request(input) {
    const url = new URL(String(input), 'http://odonton.local');
    requests.push(url);

    if (url.pathname === '/api/estadisticas') {
      return jsonResponse({
        resumen: { total_realizados: 99 },
        turnos_por_dia: [{ dia: currentMonthDay, total_turnos: 9, total_realizados: 4 }],
        top_prestaciones: [{ prestacion_nombre: 'Control', cantidad: 4 }],
      });
    }
    if (url.pathname === '/api/reportes/resumen') {
      return jsonResponse({
        clinico: { resumen: { total_realizados: 3 } },
        financiero: {
          ingresos_reales: '1500.50',
          ingresos_por_metodo: { efectivo: '1000.50', tarjeta: '500.00', transferencia: '0.00' },
        },
      });
    }
    if (url.pathname === '/api/pacientes') return jsonResponse({ total: 12, pacientes: [] });
    if (url.pathname === '/api/turnos') return jsonResponse({ total: 2, turnos: [] });
    throw new Error(`Endpoint inesperado en Dashboard: ${url.pathname}`);
  }

  function apiRequest(pathname, params = {}) {
    const query = new URLSearchParams(params);
    const suffix = query.toString() ? `?${query}` : '';
    return request(`${pathname}${suffix}`).then((response) => response.json());
  }

  global.__dashboardApiMocks = {
    getEstadisticas: (params) => apiRequest('/api/estadisticas', params),
    getResumenClinicoFinanciero: (params) => apiRequest('/api/reportes/resumen', params),
    getPacientes: (params) => apiRequest('/api/pacientes', params),
    getTurnos: (params) => apiRequest('/api/turnos', params),
  };

  const dashboardPath = path.resolve(__dirname, '../../frontend/src/pages/dashboard.js');
  const dashboardSource = fs.readFileSync(dashboardPath, 'utf8').replace(
    /import \{[\s\S]*?\} from '\.\.\/js\/api\.js';/,
    'const { getEstadisticas, getPacientes, getResumenClinicoFinanciero, getTurnos } = globalThis.__dashboardApiMocks;',
  );
  const dashboardUrl = `data:text/javascript;base64,${Buffer.from(dashboardSource).toString('base64')}`;
  const { loadDashboard } = await import(dashboardUrl);
  await loadDashboard();

  const statsRequest = requests.find((url) => url.pathname === '/api/estadisticas');
  const reportRequest = requests.find((url) => url.pathname === '/api/reportes/resumen');
  const expectedSixMonthStart = formatDate(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const expectedMonthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));

  assert.equal(statsRequest.searchParams.get('fecha_desde'), expectedSixMonthStart);
  assert.equal(reportRequest.searchParams.get('fecha_desde'), expectedMonthStart);
  assert.equal(requests.some((url) => url.pathname === '/api/tratamientos'), false);
  assert.equal(elements.get('stat-pacientes').textContent, 12);
  assert.equal(elements.get('stat-turnos-hoy').textContent, 2);
  assert.equal(elements.get('stat-tratamientos').textContent, 3);
  assert.equal(elements.get('stat-ingresos').textContent, '$ 1.500,50');

  const atencionesChart = chartConfigs.find((config) => config.type === 'line');
  const tratamientosChart = chartConfigs.find((config) => config.type === 'doughnut');
  const ingresosChart = chartConfigs.find((config) => config.type === 'bar');
  assert.equal(atencionesChart.data.datasets[0].data.reduce((sum, value) => sum + value, 0), 4);
  assert.deepEqual(tratamientosChart.data.datasets[0].data, [4]);
  assert.deepEqual(ingresosChart.data.datasets[0].data, [1000.5, 500, 0]);
}

async function testDashboardBackend() {
  const queries = [];
  const dbPath = require.resolve('../src/config/db');
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      pool: {
        query: async (sql) => {
          queries.push(String(sql).replace(/\s+/g, ' ').trim());
          return { rows: [], rowCount: 0 };
        },
      },
    },
  };

  const servicePath = require.resolve('../src/services/estadisticasService');
  delete require.cache[servicePath];
  const { generarEstadisticas } = require(servicePath);
  await generarEstadisticas({ fechaDesde: '2026-04-01', fechaHasta: '2026-09-30' });

  const topPrestacionesQuery = queries.find((query) => query.includes('JOIN prestaciones pr'));
  assert.match(topPrestacionesQuery, /AND t\.estado = 'realizado'/);
}

async function testAlertTimers() {
  const timers = [];
  const cleared = [];
  const alertElement = {
    isConnected: true,
    addEventListener: () => {},
    remove() {
      this.isConnected = false;
    },
  };
  const container = {
    innerHTML: '',
    querySelector: () => alertElement,
  };

  window.setTimeout = (callback, duration) => {
    const id = timers.length + 1;
    timers.push({ id, callback, duration });
    return id;
  };
  window.clearTimeout = (id) => cleared.push(id);

  const alertsUrl = pathToFileURL(path.resolve(__dirname, '../../frontend/src/js/components/alerts.js')).href;
  const { renderAlert } = await import(`${alertsUrl}?test=${Date.now()}`);
  renderAlert(container, 'Primer mensaje', 'success');
  renderAlert(container, 'Segundo mensaje', 'danger');

  assert.deepEqual(timers.map((timer) => timer.duration), [4500, 9000]);
  assert.deepEqual(cleared, [1]);
  timers[1].callback();
  assert.equal(alertElement.isConnected, false);
}

async function main() {
  await testDashboardFrontend();
  await testDashboardBackend();
  await testAlertTimers();
  console.log('OK - Dashboard usa seis meses, atenciones realizadas y fuentes separadas');
  console.log('OK - ranking de prestaciones considera solo turnos realizados');
  console.log('OK - alertas reinician el temporizador y los errores duran más');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
