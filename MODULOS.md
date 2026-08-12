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

## Integracion WhatsApp Web

La integracion activa forma parte del backend y utiliza `whatsapp-web.js`. No depende de un integrador HTTP externo ni de webhooks propios.

### Componentes activos

- `whatsappClient.service.js`: administra la sesion, el QR, la conexion y el envio/recepcion de mensajes.
- `whatsappReminder.service.js`: envia recordatorios y procesa respuestas asociadas a turnos.
- `whatsappAutogestion.service.js`: interpreta solicitudes de turno, cancelacion o reprogramacion recibidas por WhatsApp.
- `turnoSolicitudesService.js`: registra las solicitudes pendientes para revision del odontologo.

### Flujo actual

```text
Backend
  -> whatsapp-web.js
  -> whatsappClient.service.js
  -> recordatorios o autogestion interna
  -> solicitud pendiente
  -> revision del odontologo
```

El paciente puede solicitar un turno, una cancelacion o una reprogramacion. El odontologo conserva la decision sobre el dia y horario definitivo.

La configuracion de sesion y recordatorios se realiza mediante variables `WHATSAPP_*` y `REMINDER_*` documentadas en `backend/.env.example`. Las antiguas variables `WHATSAPP_NOTIFY_ENDPOINT` y `WHATSAPP_WEBHOOK_TOKEN` ya no pertenecen a la implementacion activa.
