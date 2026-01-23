# 🧪 PRUEBAS DEL SISTEMA ODONTON

## ✅ Error corregido

El error **"Cannot access 'API_BASE_URL' before initialization"** ha sido **SOLUCIONADO**.

**Causa:** El archivo `main.js` intentaba usar `process.env` que no existe en el navegador.
**Solución:** Cambiar a URL hardcodeada: `http://localhost:3000/api`

---

## 🚀 Acceso a la aplicación

### Opción 1: Página principal
```
http://localhost:3000
```

### Opción 2: Login directo
```
http://localhost:3000/pages/login.html
```

### Opción 3: Tests del sistema (Recomendado)
```
http://localhost:3000/test.html
```

---

## 📝 Credenciales para login

```
Email:      admin@odonton.com
Contraseña: admin123
```

---

## 🧪 Página de Tests

La página de tests en `/test.html` te mostrará:

1. ✅ **API_BASE_URL** - Verificar URL de API
2. ✅ **Conectar al servidor** - Probar conexión
3. ✅ **Token en localStorage** - Ver token guardado
4. ✅ **Variables globales** - Verificar funciones JS
5. ✅ **Probar login** - Validar autenticación
6. ✅ **GET /api/patients** - Obtener lista de pacientes

---

## 🔍 Pasos para acceder al sistema

### 1. Ir a la página de login
```
http://localhost:3000/pages/login.html
```

### 2. Ingresar credenciales
- Email: `admin@odonton.com`
- Contraseña: `admin123`

### 3. Click en "Iniciar Sesión"

### 4. Deberías ver el Dashboard

Si ves el dashboard correctamente, significa que el sistema está funcionando bien.

---

## 📊 Dashboard funcionalidades

Una vez logueado, verás:

### Estadísticas
- 📊 Número de pacientes
- 📅 Turnos de hoy
- 💰 Ingresos del mes
- 🏥 Tratamientos

### Acciones rápidas
- ➕ Crear turno
- ➕ Nuevo paciente
- 📈 Reportes

### Menú lateral
- 👥 Gestión de pacientes
- 📅 Calendario de turnos
- 💹 Reportes financieros
- 💬 Recordatorios
- ⚙️ Configuración

---

## 👥 Gestión de pacientes

Desde el dashboard o el menú lateral, accede a:

```
http://localhost:3000/pages/patients.html
```

Aquí puedes:
- 📋 Ver lista de pacientes
- 🔍 Buscar por nombre, DNI o email
- ➕ Crear nuevo paciente
- ✏️ Editar paciente
- 🗑️ Eliminar paciente

---

## 🐛 Troubleshooting

### Problema: "No puedo acceder a la página"
**Solución:**
1. Verifica que el servidor está corriendo: `npm run dev`
2. Abre en el navegador: http://localhost:3000
3. Si ves la página de inicio, el servidor funciona

### Problema: "Error de login"
**Solución:**
1. Ve a http://localhost:3000/test.html
2. Ejecuta los tests
3. Si el test de login falla, verifica:
   - PostgreSQL está corriendo
   - Base de datos tiene los datos de prueba (npm run db:seed)

### Problema: "La tabla de pacientes no muestra datos"
**Solución:**
1. Verifica que ejecutaste: `npm run db:seed`
2. Ejecuta nuevamente: `npm run db:seed`
3. Recarga la página (F5)

### Problema: "Error en la consola del navegador"
**Solución:**
1. Abre la consola (F12)
2. Busca el error específico
3. Verifica que:
   - `API_BASE_URL` está definida
   - Los archivos JS están cargando
   - El servidor está respondiendo

---

## 📱 Responsive

El sistema funciona en:
- ✅ Desktop
- ✅ Tablet
- ✅ Mobile

Prueba redimensionando la ventana del navegador.

---

## 🔐 Funcionalidades de seguridad

- ✅ JWT tokens (30 minutos)
- ✅ Contraseñas cifradas
- ✅ CORS habilitado
- ✅ Validación de datos
- ✅ Protección de rutas

---

## 📊 API Endpoints disponibles

### Autenticación
```bash
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
```

### Pacientes
```bash
GET /api/patients
GET /api/patients/:id
POST /api/patients
PUT /api/patients/:id
DELETE /api/patients/:id
```

---

## 🚀 Servidor está en

```
✅ http://localhost:3000
✅ API: http://localhost:3000/api
✅ Tests: http://localhost:3000/test.html
```

---

## 💾 Base de datos

```
✅ PostgreSQL corriendo
✅ BD: odonton_db
✅ Usuario: postgres
✅ Contraseña: fede2003
✅ 9 tablas creadas
✅ Datos de prueba cargados
```

---

## ✨ Próximos pasos

Una vez que confirmes que el sistema funciona:

1. **Módulo de turnos** - Calendario y disponibilidad
2. **Autogestión** - Links públicos para pacientes
3. **WhatsApp** - Recordatorios automáticos
4. **Reportes** - PDF y estadísticas

---

**¿Sistema funcionando?** ✅

Si puedes acceder a http://localhost:3000 y ver la página de inicio, **¡el sistema está listo!**

Si tienes problemas, prueba:
1. http://localhost:3000/test.html - Para diagnosticar
2. Verifica que `npm run dev` está ejecutándose
3. Abre F12 en el navegador para ver errores en la consola
