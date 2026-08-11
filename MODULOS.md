📦 MÓDULOS DEL SISTEMA (definitivos y coherentes)

Según tu alcance, límites y requisitos, el sistema Odonton queda dividido en 6 módulos principales. No más, no menos.

1️⃣ Autenticación y acceso

(uso interno – odontólogo)

👉 Es transversal, pero conviene tratarlo como módulo.

Responsabilidad

Login del odontólogo

Protección de rutas

Sesión activa

Incluye

Inicio de sesión

Cierre de sesión

Middleware de autenticación

Roles simples (solo odontólogo)

NO incluye

Portal de pacientes

Múltiples usuarios

📁 Backend:

auth.routes.js

auth.controller.js

auth.middleware.js

2️⃣ Gestión de pacientes

(núcleo clínico)

Responsabilidad

Identidad y ficha del paciente

Incluye

Datos personales

Antecedentes

Consentimientos

Imágenes clínicas

Odontograma

Relaciones

Un paciente → muchos turnos

Un paciente → muchas historias clínicas

Un paciente → muchos pagos

📁 Backend:

pacientes.routes.js

pacientes.controller.js

pacientes.model.js

3️⃣ Gestión de turnos

(módulo MÁS importante del sistema)

Responsabilidad

Agenda, disponibilidad y estados

Incluye

Alta / edición / cancelación

Control de solapamientos

Duración por prestación

Estados (programado, confirmado, cancelado)

Agenda diaria y semanal

Relaciones

Turno → paciente

Turno → prestación

Turno → recordatorios

📁 Backend:

turnos.routes.js

turnos.controller.js

turnos.service.js

4️⃣ Autogestión de turnos (paciente)

(módulo externo, separado a propósito)

👉 Este módulo NO comparte login, NO comparte vistas, NO accede a historia clínica.

Responsabilidad

Permitir acciones limitadas por token

Incluye

Link con token temporal

Solicitar turno

Cancelar / reprogramar

Validación de disponibilidad en tiempo real

Clave

Token con vencimiento (30 min)

Datos mínimos (nombre, DNI, teléfono)

📁 Backend:

autogestion.routes.js

autogestion.controller.js

token.service.js

5️⃣ Historia clínica

(registro médico real)

Responsabilidad

Evolución clínica del paciente

Incluye

Tratamientos

Observaciones

Evoluciones

Adjuntos

Exportación PDF

Relaciones

Historia clínica → paciente

Historia clínica → turnos

📁 Backend:

historia.routes.js

historia.controller.js

6️⃣ Facturación y pagos

(administrativo)

Responsabilidad

Dinero y comprobantes

Incluye

Registro de pagos

Deudas

Comprobantes PDF

Reportes mensuales

Relaciones

Pago → paciente

Pago → tratamiento / turno

📁 Backend:

pagos.routes.js

pagos.controller.js

---

## Contrato de Integracion WhatsApp (Webhooks y API)

Esta seccion documenta el intercambio entre el sistema Odonton y el servicio externo de WhatsApp para recordatorios y respuestas del paciente.

### Variables de entorno

- `WHATSAPP_NOTIFY_ENABLED`: habilita/deshabilita envio de mensajes.
- `WHATSAPP_NOTIFY_ENDPOINT`: endpoint integrador para envio saliente.
- `WHATSAPP_WEBHOOK_TOKEN`: token opcional para validar webhook entrante (`x-webhook-token`).

### 1) Webhook entrante: respuesta del paciente

Endpoint del sistema:
- `POST /api/turnos/recordatorios/webhook/whatsapp`

Headers:
- `Content-Type: application/json`
- `x-webhook-token: <WHATSAPP_WEBHOOK_TOKEN>` (opcional, recomendado)

Payload minimo esperado:

```json
{
  "turnoId": 123,
  "telefono": "+5493511234567",
  "mensaje": "CONFIRMAR"
}
```

Campos alternativos soportados:
- `turno_id`
- `metadata.turnoId`
- `text`, `body` o `mensaje`
- `from`, `numero` o `telefono`

Acciones validas interpretadas:
- `CONFIRMAR`
- `CANCELAR`
- `REPROGRAMAR`

### 2) Respuestas del sistema al webhook

Caso exitoso (confirmar/cancelar/reprogramar):

```json
{
  "ok": true,
  "turnoId": 123,
  "accion": "confirmar",
  "mensaje": "Turno confirmado por el paciente"
}
```

Respuesta invalida:

```json
{
  "ok": false,
  "codigo": "RESPUESTA_INVALIDA",
  "mensaje": "Respuesta no valida"
}
```

Turno no encontrado:

```json
{
  "ok": false,
  "codigo": "TURNO_NO_ENCONTRADO",
  "mensaje": "No se encontro turno asociado a la respuesta"
}
```

### 3) Payload saliente: recordatorio automatico

Destino: `WHATSAPP_NOTIFY_ENDPOINT`  
Metodo: `POST`

```json
{
  "telefono": "+5493511234567",
  "tipo": "recordatorio_turno",
  "turno": {
    "id": 123,
    "fecha_hora_inicio": "2026-03-06T18:00:00.000Z",
    "fecha_hora_fin": "2026-03-06T18:30:00.000Z",
    "estado": "programado",
    "paciente": {
      "id": 9,
      "nombre": "Ana",
      "apellido": "Lopez",
      "dni": "30111222"
    },
    "prestacion": {
      "id": 4,
      "nombre": "Limpieza"
    }
  },
  "acciones": ["confirmar", "cancelar", "reprogramar"]
}
```

### 4) Payload saliente: confirmacion o aviso al paciente

Destino: `WHATSAPP_NOTIFY_ENDPOINT`  
Metodo: `POST`

```json
{
  "telefono": "+5493511234567",
  "mensaje": "Turno confirmado por el paciente",
  "tipo": "recordatorio_confirmacion_respuesta"
}
```

### 5) Reglas de negocio del canal

- Solo se procesa respuesta para turnos activos en estado `programado`.
- El turno debe tener fecha/hora futura.
- Se prioriza identificar turno por `turnoId`; si no llega, se busca por telefono.
- Si la respuesta es `REPROGRAMAR`, se genera link temporal y se envia al paciente.
- Toda accion queda registrada en auditoria.
