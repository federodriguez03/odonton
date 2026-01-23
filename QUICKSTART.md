# 🚀 Guía de Inicio Rápido - Odonton

## Estructura creada ✅

Se ha generado toda la estructura del proyecto Odonton con:

- **Backend**: Node.js + Express + PostgreSQL
- **Frontend**: HTML5 + CSS3 + Bootstrap 5
- **Base de datos**: Schema relacional completo
- **Seguridad**: JWT, bcryptjs, validación

## Instalación (Paso 1: Dependencias)

```bash
# Desde la carpeta raíz del proyecto
npm install
```

Se instalarán todas las dependencias necesarias.

## Configuración (Paso 2: Variables de entorno)

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar .env con tus datos
```

Datos importantes a configurar:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=odonton_db
DB_USER=postgres
DB_PASSWORD=tu_contraseña_postgres
JWT_SECRET=tu_clave_secreta_muy_segura
```

## Base de datos (Paso 3: PostgreSQL)

### Crear base de datos vacía
```sql
-- Conectar a PostgreSQL como superuser
createdb odonton_db
```

### Crear tablas e índices
```bash
npm run db:migrate
```

### Cargar datos de prueba
```bash
npm run db:seed
```

## Ejecución

### Desarrollo (con auto-reload)
```bash
npm run dev
```

Abre el servidor en:
- Backend: http://localhost:3000
- Frontend: http://localhost:3000 (servido automáticamente)

### Producción
```bash
npm start
```

## Credenciales de prueba

Después de ejecutar `npm run db:seed`:

**Email:** admin@odonton.com
**Contraseña:** admin123

## Estructura de archivos clave

```
odonton/
├── backend/src/
│   ├── index.js              ← Servidor principal
│   ├── config/database.js    ← Conexión BD
│   ├── routes/               ← Rutas API
│   ├── models/               ← Modelos de datos
│   ├── middleware/           ← Auth, validación
│   └── utils/                ← Funciones auxiliares
│
├── frontend/
│   ├── index.html            ← Página inicio
│   ├── pages/login.html      ← Login
│   ├── css/styles.css        ← Estilos
│   └── js/                   ← JavaScript
│
├── database/
│   ├── migrate.js            ← Script de migraciones
│   └── seed.js               ← Script de datos de prueba
│
├── .env                      ← Variables de entorno
├── package.json              ← Dependencias
└── README.md
```

## Próximos pasos - Módulos a desarrollar

1. **✅ Estructura base** (completado)
2. **Gestión de turnos** - Calendario, disponibilidad
3. **Autogestión de turnos** - Links públicos con tokens
4. **WhatsApp integration** - Recordatorios automáticos
5. **Historia clínica** - Odontograma digital
6. **Facturación** - PDF y reportes

## Troubleshooting

### Error de conexión a BD
- Verificar que PostgreSQL está corriendo
- Verificar credenciales en .env
- Verificar que la base de datos existe

### Puerto 3000 en uso
```bash
# Cambiar puerto en .env
PORT=3001
```

### Módulos no encontrados
```bash
rm -rf node_modules
npm install
```

## Documentación de módulos

- Ver [backend/README.md](./backend/README.md) para API endpoints
- Ver [frontend/README.md](./frontend/README.md) para componentes
- Ver [database/README.md](./database/README.md) para schema

## Tecnologías utilizadas

**Backend:**
- Express.js 4.18+
- PostgreSQL
- JWT (jsonwebtoken)
- bcryptjs
- express-validator

**Frontend:**
- Bootstrap 5.3
- Bootstrap Icons
- Vanilla JavaScript

## 📝 Notas importantes

- Un usuario principal (odontólogo)
- Pacientes sin portal completo
- Acceso por links seguros con tokens
- Datos clínicos protegidos
- Sistema 24/7 con conexión a Internet

## Soporte

Para dudas o problemas, revisar los archivos README en cada módulo.

---

**¡Sistema listo para desarrollo!** 🎉

Ahora puedes comenzar con el desarrollo de módulos específicos o trabajar en las funcionalidades principales.
