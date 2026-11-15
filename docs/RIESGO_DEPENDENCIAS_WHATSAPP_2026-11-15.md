# Riesgo residual de dependencias WhatsApp

Fecha de evidencia: 2026-11-15. Comando: `npm audit --omit=dev` sobre `backend/package-lock.json`.

Resultado: 16 paquetes informados (11 altos y 5 moderados, sin críticos). Todos llegan por la dependencia directa de producción `whatsapp-web.js@1.34.8`. La versión es la última publicada al momento de la revisión; npm no ofrece una actualización compatible corregida. El frontend registra 0 vulnerabilidades tanto total como producción.

| Paquetes afectados | Advisories publicados | Exposición en Odonton | Mitigación aplicable |
|---|---|---|---|
| `extract-zip`, `@puppeteer/browsers`, `puppeteer`, `puppeteer-core` | `GHSA-jmr9-qjv8-65gv`, `GHSA-7pqw-9j4j-h8q3` | Puppeteer puede descargar/descomprimir Chromium durante instalación o preparación. Un archivo o fuente comprometida podría intentar escribir fuera del destino. | Instalación reproducible desde lock y registro confiable, imagen de despliegue inmutable, usuario sin privilegios, no aceptar archivos Chromium aportados por usuarios y persistir sólo LocalAuth/uploads requeridos. |
| `basic-ftp`, `get-uri`, `pac-proxy-agent`, `proxy-agent` | `GHSA-c475-qrg2-pj4r`, `GHSA-5pm8-86m8-9m6r`, `GHSA-r4jh-29pc-gfqr` | La cadena de resolución proxy de Puppeteer contiene parsers con posibles DoS. Odonton no configura FTP/PAC desde solicitudes, pero el código queda cargado en una ruta de producción. | No aceptar configuración proxy desde clientes, controlar variables de entorno y salida de red, limitar reinicios/reconexiones y ejecutar WhatsApp en la única instancia administrada. |
| `chromium-bidi`, `zod`, `puppeteer`, `puppeteer-core` | `GHSA-mrhx-c7xc-m3w5` | Datos de protocolo sobredimensionados podrían agotar memoria durante automatización del navegador. La exposición requiere alcanzar el cliente WhatsApp/Chromium, no una ruta HTTP general. | Mantener conexión sólo para dueño, timeouts/reintentos limitados, límites de memoria del proceso y supervisión; no iniciar el cliente en instancias que no sean responsables de WhatsApp. |
| `glob`, `minimatch`, `archiver-utils`, `archiver`, `zip-stream`, `whatsapp-web.js` | `GHSA-3g3m-2fjr-6pw4`, `GHSA-g3hv-75wg-m249` | Recorridos o patrones adversos pueden consumir CPU después de un timeout. Odonton usa LocalAuth y no expone una API para elegir patrones o rutas de archivado, pero la funcionalidad permanece en la biblioteca directa. | Mantener rutas de sesión fijas y confinadas, permisos mínimos, no habilitar almacenamiento remoto/archivado configurable y aislar la instancia responsable. |

`whatsapp-web.js`, `@puppeteer/browsers`, `puppeteer`, `puppeteer-core`, `archiver`, `archiver-utils`, `zip-stream`, `glob`, `minimatch`, `chromium-bidi`, `zod`, `proxy-agent`, `pac-proxy-agent`, `get-uri`, `basic-ftp` y `extract-zip` conforman los 16 nodos reportados. Algunos son agregaciones transitivas del mismo advisory; el conteo no equivale a 16 fallas independientes.

## Decisión y seguimiento

No se consideran inocuos: el impacto predominante es disponibilidad y, en la extracción de Chromium, integridad del filesystem del usuario del proceso. Tampoco se aplican `--force`, downgrades sugeridos por npm ni overrides fuera de los rangos de los mantenedores. Debe revisarse nuevamente la cadena cuando `whatsapp-web.js` publique una versión que actualice Puppeteer/archiver, seguida por las regresiones simuladas y una validación real controlada separada.
