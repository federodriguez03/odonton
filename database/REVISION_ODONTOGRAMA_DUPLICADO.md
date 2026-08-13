# Revisión de modelos de odontograma duplicados

Fecha de revisión: 2026-08-12

Alcance: análisis estático de `backend/src` y `frontend/src`, inspección del esquema y consultas PostgreSQL agregadas ejecutadas dentro de transacciones `READ ONLY`.

Esta revisión no modificó código, tablas ni datos. No se muestran identidades de pacientes ni datos clínicos individualizados.

## Estado posterior: retiro controlado

El 2026-08-12 se completó el retiro del modelo anterior. Antes de la eliminación se confirmó nuevamente que `odontograma_piezas` y `odontograma_cambios` tenían 0 filas y que no existían consumidores ejecutables en `backend/src` ni `frontend/src`. También se creó y validó un backup completo actualizado, en formato PostgreSQL custom, fuera del repositorio.

Las dos tablas fueron eliminadas mediante la migración transaccional `2026-08-12_remove_legacy_odontograma.sql`. El esquema fue regenerado y `odontograma` junto con `odontograma_meta` permanecen como único modelo activo. Las secciones siguientes conservan el diagnóstico previo como registro histórico.

## 1. Arquitectura y consumidores

| Modelo | Frontend consumidor | Función en `api.js` | Endpoint | Route | Controller | Service | Tablas | Estado |
|---|---|---|---|---|---|---|---|---|
| Actual: lectura | `pacientesView.js` (`loadOdontograma`) | `getOdontogramaPaciente` | `GET /api/odontograma/:pacienteId` | `odontogramaRoutes.js` | `odontogramaController.getOdontogramaPaciente` | `odontogramaService.obtenerOdontogramaPorPaciente` | `odontograma`, `odontograma_meta` | ACTIVO |
| Actual: escritura | `pacientesView.js` (`guardarToothSeleccionado`) | `postOdontograma` | `POST /api/odontograma` | `odontogramaRoutes.js` | `odontogramaController.postOdontograma` | `odontogramaService.guardarEstadoCara` y `guardarMeta` | `odontograma`, `odontograma_meta` | ACTIVO |
| Anterior: lectura | Ninguno encontrado en `frontend/src` | `getOdontograma` está exportada, pero no importada | `GET /api/pacientes/:id/odontograma` | `pacientesRoutes.js` | `pacientesController.obtenerOdontograma` | `pacientesService.obtenerOdontogramaPaciente` | `odontograma_piezas` | LEGACY PERO CONECTADO |
| Anterior: escritura | Ninguno encontrado en `frontend/src` | `updateOdontogramaPieza` está exportada, pero no importada | `PUT /api/pacientes/:id/odontograma/piezas/:pieza` | `pacientesRoutes.js` | `pacientesController.guardarOdontogramaPieza` | `pacientesService.guardarOdontogramaPieza` | `odontograma_piezas`, `odontograma_cambios` | LEGACY PERO CONECTADO |

Ambos routers están montados en `app.js`: `/api/odontograma` y `/api/pacientes`. Por eso el flujo anterior no puede clasificarse como código sin consumidor en sentido absoluto: carece de consumidor dentro del frontend actual, pero sus endpoints siguen siendo ejecutables.

`pacientesView.js` utiliza exclusivamente el modelo actual. Solo importa `getOdontogramaPaciente` y `postOdontograma`; no importa `getOdontograma` ni `updateOdontogramaPieza`.

No se encontraron dependencias indirectas desde funciones actuales hacia los controladores o servicios anteriores. La existencia de clientes externos que invoquen los endpoints legacy **NO SE PUEDE CONFIRMAR CON EL CÓDIGO DISPONIBLE**.

## 2. Conteos del modelo actual

### `odontograma`

| Métrica | Resultado |
|---|---:|
| Registros totales | 50 |
| Pacientes distintos | 2 |
| Fecha mínima | 2026-05-29 12:07:01.989 |
| Fecha máxima | 2026-06-16 13:05:16.437 |
| Dientes distintos | 10 |
| Caras distintas | 5 |

Cantidad por estado:

| Estado | Cantidad |
|---|---:|
| `ausente` | 10 |
| `corona` | 2 |
| `existente` | 1 |
| `protesis_fija` | 10 |
| `protesis_removible` | 5 |
| `requerido` | 4 |
| `sano` | 18 |

Las cinco caras encontradas son `distal`, `lingual`, `mesial`, `oclusal` y `vestibular`, con 10 registros cada una.

### `odontograma_meta`

| Métrica | Resultado |
|---|---:|
| Registros totales | 2 |
| Pacientes distintos | 2 |
| `sarro = true` | 1 |
| `periodontal = true` | 1 |
| Observaciones no vacías | 2 |
| `updated_at` mínimo | 2026-05-29 12:07:02.078 |
| `updated_at` máximo | 2026-06-16 13:05:16.440 |
| Referencias `paciente_id` huérfanas | 0 |

Los dos pacientes de `odontograma_meta` también poseen registros en `odontograma`.

## 3. Conteos del modelo anterior

### `odontograma_piezas`

| Métrica | Resultado |
|---|---:|
| Registros totales | 0 |
| Pacientes distintos | 0 |
| `created_at` mínimo/máximo | Sin datos |
| `updated_at` mínimo/máximo | Sin datos |
| Registros con `caras <> '{}'` | 0 |
| Observaciones no vacías | 0 |
| Referencias `paciente_id` huérfanas | 0 |

No existen estados `estado_pieza` almacenados para agrupar. Tampoco existen referencias `updated_by_usuario_id` huérfanas.

### `odontograma_cambios`

| Métrica | Resultado |
|---|---:|
| Registros totales | 0 |
| Pacientes distintos | 0 |
| Fecha mínima/máxima | Sin datos |
| Registros con observaciones | 0 |
| Registros con `usuario_id` | 0 |
| Piezas distintas | 0 |
| Referencias `paciente_id` huérfanas | 0 |
| Referencias `usuario_id` huérfanas | 0 |

No existen acciones almacenadas para agrupar. `paciente_id` posee una FK real a `pacientes`; `usuario_id` no posee FK y su integridad se comprobó mediante un `LEFT JOIN` agregado.

## 4. Pacientes representados

Se contabilizaron 7 pacientes en total, sin mostrar sus identidades.

| Cobertura | Pacientes |
|---|---:|
| Solo en el modelo actual | 2 |
| Solo en el modelo anterior | 0 |
| En ambos modelos | 0 |
| Sin registros en ninguno | 5 |

Separación por componente:

| Componente | Pacientes distintos |
|---|---:|
| Actual: `odontograma` | 2 |
| Actual: `odontograma_meta` | 2 |
| Actual: presentes en ambas tablas | 2 |
| Anterior: `odontograma_piezas` | 0 |
| Anterior: `odontograma_cambios` | 0 |
| Anterior: presentes en ambas tablas | 0 |

## 5. Comparación estructural

| Modelo anterior | Modelo actual | Equivalencia |
|---|---|---|
| `pieza_numero` | `diente` | Directa en formato FDI |
| `estado_pieza` | Múltiples filas `estado`, una por cara | No directa: cambia la granularidad |
| `caras` JSONB | Columnas `cara` y `estado`, una fila por cara | Migrable con expansión del JSON, pero requiere normalización |
| Cara `palatina` y cara `lingual` | Solo `lingual` | Requiere decidir una regla de consolidación |
| `observaciones` por pieza | `odontograma_meta.observaciones` por paciente | No directa; se perdería la asociación con una pieza si se copiara sin diseño adicional |
| `updated_by_usuario_id` | Sin equivalente | No representado en el modelo actual |
| `odontograma_cambios` con `accion`, estado, caras, observación, usuario y fecha | Sin tabla de historial | Sin equivalente |
| Sin campos equivalentes | `sarro`, `periodontal` | Información propia del modelo actual |

Los vocabularios tampoco son idénticos. El anterior admite estados como `sana`, `realizado` y `protesis`; el actual usa, entre otros, `sano`, `existente`, `protesis_fija` y `protesis_removible`. `realizado` no tiene una equivalencia explícita y `protesis` no indica si es fija o removible.

## 6. Información potencialmente única

1. Sí existen campos del diseño anterior sin equivalente directo: historial, usuario responsable, observaciones por pieza y parte de su vocabulario de estados.
2. Conceptualmente, `odontograma_cambios` representa historial clínico que se perdería si contuviera filas y se eliminara sin migración. Actualmente contiene 0 filas, por lo que no conserva historial real que migrar.
3. El modelo actual conserva el último estado por paciente, diente y cara mediante un `UPSERT`. Al actualizar, reemplaza `estado` y `fecha`; no crea una entrada histórica separada.
4. Una migración estructural podría automatizar la expansión de `caras` JSONB a filas. Sin embargo, una migración general de datos no sería segura sin definir equivalencias para estados, `palatina`/`lingual`, observaciones por pieza e historial. En el estado actual, las tablas anteriores están vacías y no hace falta migrar datos.
5. Si aparecieran datos antes del retiro, requerirían decisión manual: `realizado`, `protesis`, conflictos entre estados de pieza y de caras, coexistencia de `palatina` y `lingual`, destino de observaciones por pieza y conservación del historial/autor.

## 7. Datos clínicos potencialmente únicos

Para pacientes presentes solo en el modelo anterior:

| Métrica agregada | Resultado |
|---|---:|
| Pacientes | 0 |
| Piezas | 0 |
| Caras JSON registradas | 0 |
| Caras con estado distinto de `sano` | 0 |
| Observaciones en piezas | 0 |
| Cambios históricos | 0 |
| Observaciones en cambios | 0 |

Para pacientes presentes en ambos modelos:

| Métrica agregada | Resultado |
|---|---:|
| Pacientes | 0 |
| Piezas anteriores | 0 |
| Piezas sin diente equivalente aparente en el actual | 0 |
| Caras anteriores sin equivalente aparente | 0 |
| Estados comparables distintos | 0 |
| Observaciones únicamente en el anterior | 0 |
| Cambios históricos únicamente en el anterior | 0 |

No se detectan datos contradictorios porque no hay pacientes ni filas en el modelo anterior. Esto no demuestra equivalencia conceptual entre los modelos; solo demuestra ausencia actual de datos que comparar.

## 8. Endpoints y elementos legacy

Pertenecen exclusivamente al modelo anterior:

- `api.js`: `getOdontograma` y `updateOdontogramaPieza`.
- `pacientesRoutes.js`: `GET /:id/odontograma` y `PUT /:id/odontograma/piezas/:pieza`.
- `pacientesController.js`: `obtenerOdontograma` y `guardarOdontogramaPieza`.
- `pacientesMiddleware.js`: `validarOdontogramaPieza`.
- `pacientesService.js`: `asegurarTablasOdontograma`, `normalizarCaras`, `validarEstadoPiezaYCaras`, `obtenerOdontogramaPaciente`, `guardarOdontogramaPieza` y sus constantes específicas.

No se encontró que una función del modelo actual dependa de estos elementos. El frontend conserva dos exports sin consumidor, mientras que el backend conserva el recorrido completo y público bajo autenticación/autorización.

Un riesgo importante es que `asegurarTablasOdontograma` ejecuta `CREATE TABLE IF NOT EXISTS` para las dos tablas legacy. Si las tablas fueran eliminadas antes de desmontar los endpoints y servicios, una invocación posterior podría recrearlas.

Orden de desmontaje futuro recomendado, sin aplicarlo en esta fase:

1. Confirmar que no existen clientes externos de los dos endpoints legacy.
2. Retirar o desactivar las dos rutas legacy.
3. Retirar los dos helpers frontend sin consumidor.
4. Retirar controladores, validación y funciones de servicio exclusivamente legacy.
5. Repetir búsqueda estática y confirmar nuevamente que ambas tablas siguen vacías.
6. Crear backup completo y una migración controlada para eliminar solo las tablas anteriores.
7. Regenerar el esquema y actualizar la documentación.

## 9. Integridad y riesgos

- Todas las referencias de `paciente_id` comprobadas en los cuatro componentes tienen 0 huérfanos.
- `usuario_id` de `odontograma_cambios` no tiene FK real, pero actualmente tiene 0 huérfanos porque la tabla está vacía.
- `updated_by_usuario_id` de `odontograma_piezas` tampoco tiene FK real y actualmente tiene 0 huérfanos.
- El modelo actual sí contiene datos clínicos y no debe eliminarse ni reemplazarse.
- El modelo anterior no contiene datos, pero continúa accesible mediante endpoints; puede dejar de estar vacío mientras ese flujo siga conectado.
- El posible uso por integraciones externas **NO SE PUEDE CONFIRMAR CON EL CÓDIGO DISPONIBLE**.
- La ausencia de historial en el modelo actual debe quedar explícita en la tesis: registra estado actual, no una evolución histórica completa.

## 10. Escenario recomendado y próximos pasos

**ESCENARIO A: modelo viejo vacío y sin información única almacenada; candidato a retiro directo controlado.**

La recomendación se apoya en que `odontograma_piezas` y `odontograma_cambios` tienen 0 filas, 0 pacientes, 0 observaciones y 0 cambios históricos. No corresponde una migración de datos en su estado actual.

El retiro no debería comenzar por las tablas. Primero debe desconectarse el recorrido ejecutable anterior, especialmente la función que puede recrearlas. Después deben repetirse los conteos, confirmar consumidores externos, realizar backup y eliminar las tablas mediante una migración pequeña y transaccional.

Estado posterior al saneamiento: modelo actual **ACTIVO**; modelo anterior **RETIRADO** mediante migración controlada.

## 11. Confirmaciones de esta fase

- BASE DE DATOS MODIFICADA: NO
- DATOS CLÍNICOS MODIFICADOS: NO
- MIGRACIONES EJECUTADAS: NINGUNA
- CÓDIGO MODIFICADO: NO
- TABLAS ELIMINADAS: NINGUNA
- ARCHIVOS CREADOS: `database/REVISION_ODONTOGRAMA_DUPLICADO.md`
