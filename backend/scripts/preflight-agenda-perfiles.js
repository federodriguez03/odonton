require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { pool } = require('../src/config/db');
const { validarEntornoDemo } = require('../src/domain/demoSafety');

(async () => {
  const database = pool.options.database || process.env.DB_NAME;
  validarEntornoDemo(process.env, process.argv.slice(2), database);
  const destino = (await pool.query('SELECT current_database() db,inet_server_addr()::text host')).rows[0];
  if (destino.db !== 'odonton_ficha_20261109_test' || !['localhost', '127.0.0.1', '::1'].includes(pool.options.host)) {
    throw new Error('Preflight rechazado fuera de la base local aislada');
  }
  const { rows } = await pool.query(`SELECT
    (SELECT COUNT(*)::int FROM turnos WHERE profesional_id IS NOT NULL AND profesional_perfil_id IS NULL) legacy_sin_perfil,
    (SELECT COUNT(*)::int FROM profesionales_horarios_atencion WHERE profesional_id IS NOT NULL AND profesional_perfil_id IS NULL) horarios_legacy,
    (SELECT COUNT(*)::int FROM turnos a JOIN turnos b ON a.id<b.id
      AND a.profesional_perfil_id=b.profesional_perfil_id
      AND a.estado IN ('programado','reprogramado','confirmado')
      AND b.estado IN ('programado','reprogramado','confirmado')
      AND a.fecha_hora_inicio<b.fecha_hora_fin AND a.fecha_hora_fin>b.fecha_hora_inicio
      WHERE a.profesional_perfil_id IS NOT NULL) solapamientos_existentes`);
  console.log(JSON.stringify({ destino, ...rows[0] }));
})().finally(() => pool.end());
