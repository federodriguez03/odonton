# Diagnóstico del inicio espontáneo del bot de WhatsApp

Fecha del incidente analizado: 2026-08-21, aproximadamente 12:07 (America/Buenos_Aires).

Alcance: análisis estático, revisión de configuración y consultas PostgreSQL dentro de una transacción `READ ONLY`. No se inició el backend, no se enviaron mensajes y no se modificó la base de datos.

## Conclusión ejecutiva

El menú principal se genera únicamente en `backend/src/services/whatsappAutogestion.service.js`, función `menuPrincipalMessage`. La evidencia de auditoría confirma que a las 12:07:32 se creó una sesión de autogestión mediante `startAutogestion`, y luego el contacto respondió. Esto prueba que `processAutogestionMessage` recibió una entrada no numérica que coincidió con una palabra clave de autogestión.

No existe evidencia suficiente para determinar si esa entrada llegó desde el evento en vivo `message`, desde el polling/manual debug o desde el endpoint autenticado `POST /api/whatsapp/simulate-reply`. La auditoría actual no conserva el origen, ID ni fecha del mensaje entrante. Por lo tanto, la causa exacta es:

**NO SE PUEDE CONFIRMAR CON EL CÓDIGO Y LOS LOGS DISPONIBLES.**

La hipótesis más compatible con la configuración normal es que hubo una entrada procesada por el evento `message`, porque el polling está desactivado por defecto y no está configurado en el entorno actual. Sin embargo, existen dos caminos que podrían iniciar el bot sin un mensaje nuevo visible del contacto: el endpoint de simulación y el procesamiento manual/automático de mensajes recuperados mediante polling.

## 1. Origen exacto del menú

La cadena completa del menú aparece una sola vez:

- Archivo: `backend/src/services/whatsappAutogestion.service.js`
- Función: `menuPrincipalMessage` (línea aproximada 416)

Se envía en dos lugares:

| Emisor | Condición | ¿Requiere una entrada procesada? | Resultado |
|---|---|---:|---|
| `startAutogestion` | No existe sesión activa; el texto no es `1/2/3`; `shouldStartAutogestion(text)` coincide con una palabra clave | Sí | Crea sesión, audita `BOT_SESSION_STARTED` y envía el menú |
| `handleGuidedDniNotFound` | Existe una sesión en `esperando_dni_no_encontrado` y la entrada procesada es `2` | Sí | Vuelve a `esperando_opcion_menu` y reenvía el menú |

No hay otro literal ni otra función que envíe exactamente este menú.

`shouldStartAutogestion` normaliza el texto y usa coincidencia por subcadena (`text.includes(keyword)`). Esto puede aceptar frases que contengan una palabra clave aunque no sean un comando explícito. Aun así, el código necesita recibir/procesar alguna entrada: no existe un timer que invoque directamente `startAutogestion`.

## 2. Todos los callers ejecutables

### Callers de `handleIncomingMessage`

1. Evento normal de `whatsapp-web.js`:
   - `client.on('message', message => handleIncomingMessage(message, 'message'))`
   - Archivo: `backend/src/services/whatsappClient.service.js`, línea aproximada 578.
2. Polling de chats recientes:
   - `pollRecentMessagesOnce` llama `handleIncomingMessage(message, 'manual_poll')`.
   - Archivo: `backend/src/services/whatsappClient.service.js`, línea aproximada 279.

No hay callers de inicio, reconexión o scheduler que invoquen directamente `handleIncomingMessage`.

### Callers externos de `processAutogestionMessage`

1. `handleIncomingMessage`, después de validar tipo, intención, recordatorios y sesión activa.
2. `simulateReply`, controlador de `POST /api/whatsapp/simulate-reply`, cuando `processPatientReply` devuelve `NO_PENDING_REMINDER`.

El segundo caller es importante: está protegido por autenticación y rol odontólogo, pero procesa el teléfono/texto proporcionado y puede enviar el menú real sin que exista un mensaje entrante de WhatsApp. No se encontró consumidor en `frontend/src`, pero la ruta permanece montada y ejecutable.

## 3. Evento `message` y protección `fromMe`

La aplicación escucha `message`, no `message_create`.

En la versión instalada de `whatsapp-web.js`, `message_create` se emite para mensajes propios y ajenos, pero luego la biblioteca ejecuta `if (msg.id.fromMe) return` antes de emitir `message`. Además:

- `handleIncomingMessage` retorna inmediatamente cuando `message.fromMe === true`.
- El polling solo entrega mensajes cuando `!message.fromMe`.

Conclusión: un mensaje enviado por la propia cuenta no debería reingresar por ninguno de los dos caminos actuales. La protección `fromMe` existe en tres niveles. No se encontró evidencia de que el menú se haya realimentado a sí mismo.

La biblioteca emite `message` a partir de mensajes considerados nuevos por su capa interna. El proyecto no ejecuta una carga histórica explícita en ese evento. Aun así, sin el ID/origen auditado del mensaje del incidente no se puede demostrar cómo lo clasificó WhatsApp Web durante una sincronización o reconexión.

## 4. Polling

### Funcionamiento

- Función: `startMessagePolling`.
- Habilitación: solamente cuando `WHATSAPP_POLLING_ENABLED` es exactamente `true`.
- Intervalo predeterminado: 5 segundos.
- Por ciclo: hasta 20 chats y 5 mensajes por chat.
- Antigüedad máxima automática: 30 minutos.
- Filtro adicional: timestamp posterior a `readyAt - 15 segundos`.
- Origen entregado al handler: `manual_poll`.

También puede ejecutarse a demanda mediante `GET /api/whatsapp/debug/chats?process=true`; allí la ventana predeterminada es de 120 minutos, aunque se conserva el filtro `readyAt - 15 segundos`.

### Valor actual

`WHATSAPP_POLLING_ENABLED` no está definido en `backend/.env` ni en las variables de entorno actuales de proceso, usuario o equipo. La función devuelve `false` en ese caso. El archivo `.env` no fue modificado el día del incidente.

Por ello, con una ejecución normal usando esta configuración, el polling automático estaba desactivado. **NO SE PUEDE CONFIRMAR CON EL CÓDIGO DISPONIBLE** que el proceso concreto de las 12:07 no haya sido iniciado con una sobreescritura temporal de entorno.

### Dependencia real

El flujo principal no depende del polling: los mensajes entrantes se procesan por el evento `message`. No se encontró consumidor funcional de los resultados de polling fuera de:

- el propio procesamiento opcional de mensajes;
- la respuesta diagnóstica de `/api/whatsapp/debug/chats`.

Clasificación: **redundante/diagnóstico para el funcionamiento normal**, con capacidad peligrosa de procesar mensajes recuperados como si fueran actuales.

## 5. Deduplicación y reinicios

El servicio mantiene:

- `processedMessageIds`: `Set` en memoria, máximo 500 IDs;
- `recentProcessedFingerprints`: `Map` en memoria, máximo 500 entradas, con limpieza a los 10 minutos.

Ambas estructuras se pierden al reiniciar Node. Por tanto, la deduplicación **no persiste entre reinicios**.

El filtro del polling reduce el riesgo de reprocesar historial: normalmente solo acepta mensajes con timestamp desde 15 segundos antes de `ready`. No elimina por completo una carrera durante arranque/reconexión. Si el polling estuviera habilitado, un mensaje de esa ventana podría volver a procesarse después de reiniciar porque el dedup comienza vacío.

## 6. Sesiones de autogestión

Las sesiones se almacenan en PostgreSQL, tabla `whatsapp_conversations`:

- `createSession` cancela sesiones activas anteriores del mismo teléfono y crea una nueva;
- el timeout configurado actualmente es 10 minutos;
- la expiración se evalúa cuando se procesa una entrada posterior;
- no existe un timer que reabra una sesión o envíe el menú por sí solo.

Una sesión persistida puede continuar después de un reinicio si aún está vigente, pero no genera mensajes sin una nueva entrada procesada. El retorno al menú desde `handleGuidedDniNotFound` también requiere procesar la opción `2`.

## 7. Inicio, reconexión y schedulers

En `backend/src/app.js` se inicializa WhatsApp cuando `WHATSAPP_AUTO_START=true` y se inicia `reminderScheduler`.

El evento `ready` solo actualiza estado, inicia el polling si está habilitado y registra que el cliente está listo. No llama a la autogestión ni envía el menú.

El scheduler, cada 10 minutos, ejecuta:

- `marcarTurnosVencidosComoRealizados`;
- `processAutomaticReminders`.

Puede enviar recordatorios de turnos, pero no llama a `handleIncomingMessage`, `processAutogestionMessage`, `startAutogestion` ni `menuPrincipalMessage`. No es un origen del menú investigado.

## 8. Evidencia temporal de las 12:07

Las consultas se realizaron dentro de `BEGIN READ ONLY` y finalizaron con `ROLLBACK`. No se mostraron teléfonos, mensajes ni datos personales.

Evidencia técnica encontrada:

| Hora local | Evidencia |
|---|---|
| 12:07:32.832 | Creación de conversación técnica ID 65 |
| 12:07:32.845 | Auditoría `BOT_SESSION_STARTED`, recurso `whatsapp_conversations`, ID 65 |
| 12:07:51–12:08:29 | Auditorías de entradas posteriores y avance por pasos del diálogo |

La auditoría inicial no contiene `command`. En el código actual esto corresponde a `startAutogestion`, usado cuando una entrada no numérica coincide con una palabra clave. El camino directo por `1/2/3` registra `command` en metadata.

Esto confirma:

- la apertura efectiva de una sesión a las 12:07:32;
- el envío del menú desde el camino por palabra clave;
- que posteriormente hubo respuestas procesadas del contacto.

No confirma:

- el cuerpo original que disparó la palabra clave;
- el ID o timestamp del mensaje;
- si el origen fue `message`, `manual_poll` o `simulate-reply`;
- qué usuario o request pudo invocar la simulación.

No se encontraron archivos de log persistentes (`.log`, `.out` o `.err`) en el workspace. La consola registra `sourceEvent`, pero no se conserva. La historia local de PowerShell no contiene invocaciones de `simulate-reply`, `debug/chats` ni asignaciones de `WHATSAPP_POLLING_ENABLED`; esto reduce, pero no elimina, la posibilidad de llamadas realizadas por otra terminal, herramienta o equipo.

## 9. Escenarios evaluados sin enviar WhatsApp

| Escenario conceptual | ¿Puede producir el menú? | Evaluación |
|---|---:|---|
| A. Reiniciar con polling desactivado y sin mensaje nuevo | No se encontró un camino intencional | No hay lectura histórica propia del proyecto |
| B. Habilitar polling o usar debug con `process=true` | Sí | Puede entregar a `handleIncomingMessage` un mensaje recuperado que cumpla ventanas y filtros |
| C. Reiniciar con una sesión activa | No por sí solo | Necesita una entrada posterior para continuar o volver al menú |
| D. Recibir el propio mensaje enviado | No debería | Bloqueado por `whatsapp-web.js`, polling y handler mediante `fromMe` |
| E. Reconectar el cliente | No directamente | Solo presenta riesgo indirecto si polling está habilitado o si la biblioteca entrega una entrada como nueva |
| F. Ejecutar scheduler de recordatorios | No | No existe enlace con el menú/autogestión |
| G. Invocar `POST /api/whatsapp/simulate-reply` | Sí | Puede iniciar sesión y enviar el menú sin mensaje real entrante |

No se ejecutaron estos escenarios contra WhatsApp real.

## 10. Clasificación de la causa

### Causa comprobada

Una entrada no numérica, aceptada por coincidencia de palabra clave, llegó a `processAutogestionMessage` a las 12:07:32 y provocó `startAutogestion`, la creación de la sesión 65 y el envío del menú.

### Origen de esa entrada

**NO SE PUEDE CONFIRMAR CON EL CÓDIGO Y LOS LOGS DISPONIBLES.**

Nivel de certeza sobre el origen: **BAJO**.

Orden de plausibilidad con la evidencia disponible:

1. Evento real `message`, posiblemente originado por una entrada que WhatsApp Web consideró nueva aunque no quedara visible/identificada en la revisión manual.
2. Invocación del endpoint autenticado de simulación.
3. Polling manual o proceso iniciado con una sobreescritura temporal de `WHATSAPP_POLLING_ENABLED=true`.
4. Sesión, scheduler o mensaje propio: descartados como disparadores autónomos por el código actual.

No debe afirmarse que el polling causó este incidente: la configuración comprobable lo mantiene apagado.

## 11. Hotfix mínimo propuesto — no implementado

1. Desactivar como fuente de entrada el polling:
   - no iniciar `startMessagePolling` en `ready`;
   - conservar `/debug/chats` únicamente para listar, forzando `process=false`;
   - mantener los mensajes reales exclusivamente en el evento `message`.
2. Impedir envíos reales desde `simulate-reply`:
   - desmontar la ruta en producción o convertirla en simulación pura con transporte mock;
   - nunca permitir que el endpoint de diagnóstico abra una sesión real o llame `safeSend`.
3. Exigir contexto explícito para iniciar una sesión:
   - `processAutogestionMessage` no debería abrir una conversación por defecto;
   - solo `handleIncomingMessage` con `source='message'`, `fromMe=false` y mensaje fresco debería autorizar el inicio;
   - las llamadas internas/de prueba podrían procesar una sesión ya activa, pero no iniciar ni enviar menú real.
4. Incorporar trazabilidad segura:
   - auditar `source`, ID técnico del mensaje, timestamp recibido y tipo de disparador (`keyword`/`direct_command`);
   - auditar el envío del menú sin guardar el cuerpo ni datos personales;
   - registrar la identidad técnica del usuario autenticado cuando se usa un endpoint de prueba.
5. Para garantizar deduplicación entre reinicios, persistir el ID técnico de mensajes procesados con restricción única. Esto requiere un diseño/migración pequeña y debe evaluarse separadamente; el dedup actual en memoria no puede dar esa garantía.

La medida inmediata de menor alcance es retirar polling y simulación como fuentes capaces de procesar/enviar, y autorizar el inicio solo desde el evento entrante en vivo. La persistencia de IDs es la capa posterior para una garantía estricta entre reinicios.

## Resumen solicitado

- **ORIGEN DEL MENÚ:** `menuPrincipalMessage`; envíos desde `startAutogestion` y `handleGuidedDniNotFound`.
- **TODOS LOS CALLERS:** evento `message`; `pollRecentMessagesOnce` (`manual_poll`); controlador `simulateReply` directo a `processAutogestionMessage`; dispatcher de sesión para retorno desde DNI no encontrado.
- **EVENTO MESSAGE:** activo; solo para mensajes ajenos según la biblioteca y el guard local.
- **POLLING:** opcional, no requerido por el flujo real; también invocable por endpoint debug.
- **VALOR ACTUAL:** `WHATSAPP_POLLING_ENABLED` no definido, efectivo `false`.
- **DEDUP PERSISTE ENTRE REINICIOS:** NO.
- **FROM_ME PROTEGIDO:** SÍ, en biblioteca, polling y handler.
- **SESIONES:** persistidas en PostgreSQL; no envían ni se reabren solas.
- **SCHEDULERS:** no llaman al menú ni a la autogestión entrante.
- **EVIDENCIA 12:07:** sesión técnica 65 y `BOT_SESSION_STARTED` a las 12:07:32, seguida por respuestas; sin origen/ID/cuerpo inicial.
- **CAUSA:** entrada no numérica coincidente con keyword; origen exacto no determinable.
- **NIVEL CERTEZA:** alto sobre el camino interno; bajo sobre la fuente externa.
- **PUEDE REPETIRSE:** SÍ, porque `simulate-reply` sigue operativo y polling/manual debug puede procesar mensajes recuperados; el dedup no persiste.
- **HOTFIX PROPUESTO:** entrada real solo por evento `message`; polling solo lectura/desactivado; simulación sin transporte real; gate de inicio por contexto vivo; trazabilidad segura y, después, dedup persistente.

## Confirmaciones

- CÓDIGO MODIFICADO: NO
- BASE DE DATOS MODIFICADA: NO
- WHATSAPP REAL: NO
- BACKEND INICIADO: NO
- COMMIT GIT: NO

Único archivo creado por esta fase: `DIAGNOSTICO_BOT_INICIO_ESPONTANEO.md`.
