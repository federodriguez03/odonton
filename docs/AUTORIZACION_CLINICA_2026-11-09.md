# Autorización acotada de pacientes y clínica

## Orden de migraciones

En una base aislada, aplicar en este orden antes de iniciar el backend nuevo:

1. `2026-11-06_ficha_clinica_unificada.sql`.
2. `2026-11-09_historia_clinica_revisiones.sql`.
3. `2026-11-09_identidad_roles_profesionales.sql`.
4. `2026-11-09_autorizacion_clinica_actores.sql`.

La última migración es aditiva. Incorpora el usuario actor y el perfil profesional a
nuevas atenciones, documentos, tratamientos, prótesis y cambios de odontograma.
No completa filas históricas: inferir esos responsables atribuiría datos clínicos sin
evidencia. `profesional_id` se conserva temporalmente para compatibilidad y las altas
nuevas de atenciones usan `profesional_perfil_id`.

No se considera seguro volver a un backend anterior después de comenzar a escribir
`profesional_perfil_id`: ese backend no reconoce la nueva autoría y podría crear o
modificar relaciones usando IDs de usuario. La recuperación requiere detener
escrituras, conservar las columnas nuevas y validar que ningún registro nuevo dependa
exclusivamente de ellas antes de evaluar una reversión de aplicación.

## Política aplicada

- Pacientes administrativos: recepción u odontólogo. Un administrador solo no accede.
- Lectura clínica y documentos: odontólogo.
- Escritura clínica y documental: odontólogo con perfil vinculado y activo.
- Edición de una atención: únicamente su `profesional_perfil_id` responsable.
- Referencias de odontograma: lectura odontológica; administración exige administrador
  y odontólogo.

Los archivos se descargan únicamente por `/api/documentos/descargar/:id`. La ruta
directa `/uploads/*` continúa bloqueada.

## Fuera de esta etapa

No se migraron agenda, cobros, reportes, estadísticas, configuración, WhatsApp ni la
navegación del frontend. Tampoco se retiraron las columnas profesionales legacy.
