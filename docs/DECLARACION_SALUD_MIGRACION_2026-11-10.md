# Declaración de salud — migración pendiente

La migración `database/2026-11-10_declaraciones_salud.sql` agrega versiones inmutables de la declaración de salud. Cada guardado crea una versión nueva; las respuestas previas no se sobrescriben.

Debe probarse primero en una copia aislada y luego aplicarse explícitamente al ambiente elegido antes de habilitar la interfaz. No aplicarla sobre `odonton_db` sin respaldo, verificación de conexión y autorización específica.

Estado al 2026-11-10: validada en un esquema-copia y aplicada únicamente en `odonton_ficha_20261109_test`. Continúa pendiente para `odonton_db` y cualquier ambiente productivo.

El cuestionario vigente es `hc_general_v1`. Los campos clínicos previos de `pacientes` permanecen independientes y no se convierten automáticamente en respuestas.

La fuente de preguntas es `HC GENERAL.pdf`. Se excluyeron deliberadamente historia odontológica, examen bucal profesional, diagnóstico, odontograma, plan de tratamiento y texto de consentimiento.
