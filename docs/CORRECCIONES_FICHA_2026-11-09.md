# Correcciones de la ficha clínica

## Instalación
1. Respaldar la base y probar en una copia.
2. Aplicar primero database/2026-11-06_ficha_clinica_unificada.sql, si aún no está aplicada.
   Esa migración anterior agrega restricciones sin IF NOT EXISTS: no repetirla si ya se ejecutó.
3. Aplicar database/2026-11-09_historia_clinica_revisiones.sql antes de usar la edición de atenciones.
4. Reiniciar el backend.

La nueva migración crea el registro de correcciones futuras, sin modificar ni inventar datos históricos.
No se ejecutaron migraciones ni se conectó a PostgreSQL durante esta corrección.

## Comportamiento
- Las referencias se validan con el catálogo de la base.
- Una referencia inactiva o heredada puede conservarse en su cara actual, pero no asignarse a otra.
- Se serializan las escrituras del odontograma por paciente y se guardan dentro de una transacción.
- El historial dibuja las piezas temporales si la versión guardada contiene alguna.
- Cada edición de atención guarda antes/después completos, usuario autenticado y fecha en
  historias_clinicas_revisiones, en la misma transacción. No hay endpoints para modificar revisiones.
  Esto no reemplaza los permisos por rol ni una interfaz para consultar el registro de correcciones.
- El script demo exige NODE_ENV distinto de production, una base cuyo nombre termine en _demo
  o _test y el argumento --confirm-demo seguido exactamente por ese nombre.
  Ejemplo, con DB_NAME=odonton_demo: node scripts/cargar-datos-demo-pacientes-2026.js --confirm-demo odonton_demo
  No se debe apuntar esa conexión a la base del consultorio.

## Verificación
Desde la raíz:
- node backend/scripts/test-consultas-clinicas-transaccion.js
- node backend/scripts/test-odontograma-catalogo-guardado.js
- node backend/scripts/test-odontograma-historico-temporal.js
- node backend/scripts/test-demo-safety.js

Estas pruebas usan simulaciones, no verifican PostgreSQL ni una sesión de navegador real.
En una base de prueba, verificar además:
- Crear una referencia y aplicarla; guardar y volver a abrir.
- Inactivarla y modificar otra pieza; conservar la referencia anterior.
- Intentar asignar la referencia inactiva a otra pieza: debe rechazarse.
- Capturar una atención con piezas temporales y consultar el histórico.
- Editar un diagnóstico y revisar antes/después/actor en historias_clinicas_revisiones.
- Confirmar que un fallo al guardar la revisión revierte la edición.
