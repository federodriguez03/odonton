# Preparación de identidad, roles y perfiles profesionales

## Alcance

Esta etapa expande el modelo sin reemplazar todavía las relaciones legacy ni habilitar todas las pantallas por rol.

- La cuenta ID 1 es una cuenta de desarrollo y recibe únicamente `administrador`.
- Sus referencias históricas se conservan mediante el perfil inactivo
  `Profesional de desarrollo — identidad no verificada`.
- Ese perfil no está vinculado como cuenta operativa, no puede recibir nuevas asignaciones y no atribuye las atenciones a una identidad profesional verificada.
- Los IDs nuevos de profesionales son generados independientemente de `usuarios.id`.
- Las cuentas de recepción y odontólogo demo se crean sólo mediante un script protegido, en bases `_test` o `_demo` y con contraseñas tomadas del entorno.

## Decisiones de autorización para la siguiente etapa

- Administrador no implica recepción, odontólogo ni cobros.
- Recepción y odontólogo podrán consultar precios.
- Registrar cobros requerirá además `usuarios.puede_cobrar=TRUE`.
- Consultar referencias odontológicas requerirá odontólogo.
- Crear, modificar o inactivar referencias requerirá combinar administrador y odontólogo.
- El estado activo y los roles se consultarán en PostgreSQL en cada solicitud; un token vigente no mantendrá permisos retirados.
- La interfaz no persistirá automáticamente formularios clínicos en `sessionStorage` ni en otro almacenamiento compartido del navegador.
- Ante una reautenticación, cualquier estado en memoria sólo podrá conservarse si continúa la misma identidad; un cambio de cuenta debe descartarlo.

## Orden en una base de prueba

1. Confirmar que host sea local, `NODE_ENV` no sea `production` y el nombre termine en `_test` o `_demo`.
2. Ejecutar el preflight y guardar su salida.
3. Confirmar que `2026-11-09_historia_clinica_revisiones.sql` esté aplicada antes de probar ediciones clínicas.
4. Aplicar `2026-11-09_identidad_roles_profesionales.sql`.
5. Definir `DEMO_RECEPCION_PASSWORD` y `DEMO_ODONTOLOGO_PASSWORD` fuera de Git.
6. Crear las cuentas demo con confirmación exacta del nombre de la base.
7. Repetir el preflight y ejecutar la prueba de correspondencias.

## Compatibilidad y recuperación

La migración agrega `profesional_perfil_id` y conserva `profesional_id`. El backend actual sigue leyendo la relación legacy; el futuro backend deberá usar la nueva relación.

Volver a un backend anterior sólo es admisible durante la etapa aditiva y si se comprueba que:

1. no existen turnos, horarios o atenciones que dependan exclusivamente de `profesional_perfil_id`;
2. toda escritura nueva mantiene una correspondencia legacy válida;
3. no se crearon profesionales operativos sin una cuenta legacy equivalente que el backend anterior pueda interpretar;
4. las columnas y constraints legacy no fueron retiradas;
5. se verificó en una copia restaurada que el backend anterior puede leer todos los registros creados durante la ventana de cambio.

Si alguna condición no se cumple, recuperar significa restaurar el backup completo y reconciliar las escrituras posteriores; no alcanza con desplegar código anterior.

No deben ejecutarse scripts destructivos para eliminar roles, perfiles o correspondencias ya utilizadas.

## Credenciales demo

No se almacenan contraseñas en archivos versionados ni se imprimen en los resultados. Las variables requeridas son:

- `DEMO_RECEPCION_PASSWORD`
- `DEMO_ODONTOLOGO_PASSWORD`

Las cuentas demo no tienen `puede_cobrar`. El perfil odontológico se marca explícitamente como ficticio.

## Pendientes fuera de esta etapa

- Autorización de todas las rutas y navegación por rol.
- Llegada y finalización clínica.
- Importación de aranceles.
- Rediseño del odontograma.
- Separar `no evaluado` de `sano`.
- Corregir la leyenda exportada de ausente y extracción indicada.
