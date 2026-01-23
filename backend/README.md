# Backend - API REST Odonton

API Node.js + Express para gestión completa del consultorio odontológico.

## Estructura de carpetas

```
backend/
├── src/
│   ├── config/       # Configuración (base de datos)
│   ├── routes/       # Rutas de la API
│   ├── controllers/  # Lógica de negocio
│   ├── models/       # Modelos de datos
│   ├── middleware/   # Auth, validación
│   ├── utils/        # Utilidades (tokens, crypto)
│   └── index.js      # Servidor principal
└── package.json
```

## Instalación

```bash
cd backend
npm install
```

## Variables de entorno

Crear archivo `.env` en la raíz:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=odonton_db
DB_USER=postgres
DB_PASSWORD=contraseña

PORT=3000
NODE_ENV=development
JWT_SECRET=tu_clave_secreta
JWT_EXPIRES_IN=30m
FRONTEND_URL=http://localhost:5500
```

## Desarrollo

```bash
npm run dev    # Inicia con nodemon
```

## Producción

```bash
npm start      # Inicia servidor
```

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/logout` - Cerrar sesión
- `GET /api/auth/me` - Datos del usuario actual

### Pacientes
- `GET /api/patients` - Listar pacientes (admin)
- `GET /api/patients/:id` - Detalle de paciente
- `POST /api/patients` - Crear paciente
- `PUT /api/patients/:id` - Editar paciente (admin)
- `DELETE /api/patients/:id` - Eliminar paciente (admin)

### Turnos
- `GET /api/appointments` - Listar turnos
- `GET /api/appointments/:id` - Detalle de turno
- `POST /api/appointments` - Crear turno
- `PUT /api/appointments/:id` - Editar turno
- `DELETE /api/appointments/:id` - Cancelar turno

### Reportes
- `GET /api/reports/patients` - Estadísticas de pacientes
- `GET /api/reports/revenue` - Ingresos
- `GET /api/reports/treatments` - Tratamientos

## Seguridad

- Autenticación JWT con tokens de 30 minutos
- Tokens temporales para autogestión (30 minutos)
- Sanitización de entradas con express-validator
- Cifrado de contraseñas con bcryptjs
- CORS configurado
- Helmet para headers de seguridad

## Middleware

- `verifyToken` - Verifica autenticación
- `verifyAdmin` - Requiere rol de administrador
- `verifyTempToken` - Verifica token temporal
- `handleValidationErrors` - Procesa errores de validación

## Desarrollo futuro

- [ ] Módulo de turnos avanzado
- [ ] Integración WhatsApp
- [ ] Generación de PDF
- [ ] Estadísticas avanzadas
- [ ] Google Calendar sync
