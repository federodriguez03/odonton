# Odonton - Sistema Web de Gestión Odontológica

Sistema web modular para la gestión integral de un consultorio odontológico, desarrollado con Node.js, Express, PostgreSQL y Bootstrap 5.

## 📋 Características principales

- **Gestión de turnos**: Reserva, reprogramación, cancelación con calendario
- **Autogestión de pacientes**: Links seguros con tokens temporales
- **Recordatorios automáticos**: Integración con WhatsApp
- **Gestión de pacientes**: Historia clínica, odontograma digital
- **Facturación**: Emisión de recibos y reportes financieros
- **Reportes**: Estadísticas de pacientes, ingresos y tratamientos

## 🏗️ Estructura del proyecto

```
odonton/
├── backend/          # Node.js + Express API
│   └── src/
│       ├── config/    # Configuración BD
│       ├── routes/    # Rutas de la API
│       ├── controllers/ # Lógica de negocio
│       ├── models/    # Modelos de datos
│       ├── middleware/ # Autenticación, validación
│       └── utils/     # Funciones auxiliares
├── frontend/         # HTML5 + CSS3 + JS + Bootstrap 5
│   ├── pages/        # Vistas principales
│   ├── components/   # Componentes reutilizables
│   ├── js/          # JavaScript
│   ├── css/         # Estilos
│   └── assets/      # Imágenes y recursos
├── database/         # PostgreSQL
│   ├── migrations/   # Scripts de creación
│   └── seeds/       # Datos iniciales
└── package.json     # Dependencias
```

## 🚀 Instalación

### Requisitos previos
- Node.js (v16+)
- PostgreSQL (v12+)
- npm o yarn

### Pasos de instalación

```bash
# 1. Clonar o descargar el proyecto
cd odonton

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus datos

# 4. Crear base de datos
# Conectar a PostgreSQL y ejecutar:
# CREATE DATABASE odonton_db;

# 5. Ejecutar migraciones
npm run db:migrate

# 6. (Opcional) Llenar datos de prueba
npm run db:seed

# 7. Iniciar en desarrollo
npm run dev

# 8. Iniciar en producción
npm start
```

## 📊 Tecnologías

**Backend:**
- Node.js + Express.js
- PostgreSQL
- JWT para autenticación
- bcryptjs para cifrado

**Frontend:**
- HTML5, CSS3, JavaScript
- Bootstrap 5
- Bootstrap Icons

**Seguridad:**
- Sanitización de entradas
- Cifrado de credenciales
- Control de acceso por roles
- Tokens temporales

## 📝 Módulos en desarrollo

- [ ] Gestión de turnos
- [ ] Autogestión de pacientes
- [ ] Integración WhatsApp
- [ ] Gestión de pacientes e historia clínica
- [ ] Facturación y cobros
- [ ] Reportes y estadísticas

## 🔐 Variables de entorno

Ver `.env.example` para la lista completa de variables requeridas.

## 📚 Documentación adicional

- [Backend API](./backend/README.md) - Endpoints y uso
- [Frontend](./frontend/README.md) - Componentes y guías
- [Base de datos](./database/README.md) - Schema y migraciones

## 👨‍⚕️ Autor

Sistema desarrollado para Odonton - Consultorio Odontológico

## 📄 Licencia

MIT
