# Frontend - Interface Odonton

Interface responsiva desarrollada con HTML5, CSS3, JavaScript y Bootstrap 5.

## Estructura de carpetas

```
frontend/
├── index.html           # Página de inicio
├── pages/              # Páginas principales
│   ├── login.html
│   ├── dashboard.html
│   ├── patients.html
│   └── appointments.html
├── components/         # Componentes reutilizables
├── js/                # JavaScript
│   ├── main.js        # Funciones globales
│   └── auth.js        # Autenticación
├── css/               # Estilos
│   └── styles.css
└── assets/            # Imágenes y recursos
```

## Características

- ✅ Responsive Design (Mobile-first)
- ✅ Bootstrap 5 Framework
- ✅ Bootstrap Icons
- ✅ Componentes reutilizables
- ✅ Validación de formularios
- ✅ Gestión de sesión
- ✅ Integración con API

## Desarrollo

No requiere build. Servir con servidor HTTP local:

```bash
# Opción 1: Usando Python
python -m http.server 5500

# Opción 2: Usando Node.js (http-server)
npx http-server -p 5500

# Opción 3: Usando la carpeta en VS Code
# Live Server Extension
```

Acceder en: `http://localhost:5500`

## Estructura de páginas

### index.html
- Hero section con características
- Información general del sistema
- Links a login

### login.html
- Formulario de autenticación
- Validación de credenciales
- Redirección a dashboard

### dashboard.html (a crear)
- Panel de control del odontólogo
- Resumen de turnos
- Acceso a módulos

### patients.html (a crear)
- Listado de pacientes
- Búsqueda y filtrado
- Crear/editar pacientes

### appointments.html (a crear)
- Calendario de turnos
- Crear/editar/cancelar turnos
- Disponibilidad horaria

## Utilidades JavaScript

### apiCall(endpoint, method, data, requireAuth)
Realiza peticiones a la API con manejo automático de tokens.

```javascript
// GET
const patients = await apiCall('/patients', 'GET');

// POST
const result = await apiCall('/patients', 'POST', { name: 'Juan' });
```

### showAlert(type, message)
Muestra alertas de Bootstrap.

```javascript
showAlert('success', 'Operación exitosa');
showAlert('error', 'Ha ocurrido un error');
```

### formatDate(dateString)
Formatea fechas en español.

```javascript
formatDate('2026-01-20') // "20 de enero de 2026"
```

## Variables globales disponibles

- `getToken()` - Obtiene token de sesión
- `setToken(token)` - Guarda token
- `removeToken()` - Elimina token
- `logout()` - Cierra sesión

## Páginas a crear

- Dashboard administrativo
- Gestión de pacientes
- Gestión de turnos
- Autogestión de turnos (links públicos)
- Historial clínico
- Reportes

## Notas de desarrollo

- Usar componentes Bootstrap por defecto
- Mantener diseño responsivo
- Documentar funciones JavaScript
- Usar clases CSS semánticas
- Bootstrap Icons para iconos
