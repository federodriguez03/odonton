# 🚀 COMANDOS RÁPIDOS - ODONTON

## Sistema está corriendo en: http://localhost:3000

---

## 📍 URLs principales

| URL | Descripción |
|-----|------------|
| http://localhost:3000 | Página de inicio |
| http://localhost:3000/pages/login.html | Login |
| http://localhost:3000/pages/dashboard.html | Dashboard (después de login) |
| http://localhost:3000/pages/patients.html | Gestión de pacientes |
| http://localhost:3000/test.html | Tests del sistema |

---

## 🔐 Credenciales

```
Email:      admin@odonton.com
Contraseña: admin123
```

---

## 🛠️ Comandos npm

### Iniciar servidor (ya está corriendo)
```bash
npm run dev
```

### Crear base de datos (ya completado)
```bash
npm run db:migrate
```

### Cargar datos de prueba (ya completado)
```bash
npm run db:seed
```

### Instalar dependencias (ya completado)
```bash
npm install
```

---

## 📝 Pasos básicos para probar

### 1. Ir a login
```
http://localhost:3000/pages/login.html
```

### 2. Ingresar credenciales
```
admin@odonton.com / admin123
```

### 3. Click "Iniciar Sesión"

### 4. Ver Dashboard

### 5. Ir a "Gestión de Pacientes"

### 6. Probar CRUD:
- Crear paciente
- Ver paciente
- Editar paciente
- Eliminar paciente

---

## 🧪 Diagnosticar problemas

### Ver tests del sistema
```
http://localhost:3000/test.html
```

Esto ejecutará 6 tests automáticamente:
1. API_BASE_URL
2. Conexión al servidor
3. Token en localStorage
4. Variables globales
5. Probar login
6. Obtener pacientes

---

## 📊 Base de datos

### Conectar con psql
```bash
psql -h localhost -U postgres -d odonton_db
```

### Listar tablas
```sql
\dt
```

### Ver pacientes
```sql
SELECT * FROM patients;
```

### Ver usuarios
```sql
SELECT email, role FROM users;
```

---

## 🔍 Ver logs del servidor

El servidor está corriendo con `npm run dev`, verás los logs en:
- Terminal con nodemon
- Console (F12) en el navegador

---

## 🔄 Reiniciar servidor

### Opción 1: En la terminal de nodemon
```
Presiona: rs
```

### Opción 2: Detener y reiniciar
```bash
Ctrl + C
npm run dev
```

---

## 📁 Archivos importantes

| Archivo | Función |
|---------|---------|
| backend/src/index.js | Servidor Express |
| backend/src/routes/* | Rutas API |
| frontend/index.html | Página inicio |
| frontend/pages/login.html | Login |
| frontend/pages/dashboard.html | Dashboard |
| frontend/pages/patients.html | Pacientes |
| frontend/js/main.js | Funciones globales |
| frontend/js/auth.js | Autenticación |
| frontend/js/patients.js | CRUD pacientes |

---

## ✅ Checklist de funcionamiento

- [ ] Servidor corriendo en puerto 3000
- [ ] Página de inicio carga correctamente
- [ ] Login funciona con admin@odonton.com / admin123
- [ ] Dashboard muestra estadísticas
- [ ] Tabla de pacientes muestra 3 pacientes
- [ ] Puedo crear un nuevo paciente
- [ ] Puedo editar un paciente
- [ ] Puedo eliminar un paciente
- [ ] Búsqueda funciona
- [ ] Logout funciona

---

## 🚀 Sistema operacional

Si todo funciona correctamente, el sistema está listo para:
- Desarrollo de nuevos módulos
- Pruebas de funcionalidad
- Integración de nuevas características

---

## 📞 Problemas comunes

### "Cannot find module..."
```bash
npm install
npm run dev
```

### "Puerto 3000 en uso"
```bash
# Cambiar en .env: PORT=3001
npm run dev
```

### "Base de datos no existe"
```bash
npm run db:migrate
npm run db:seed
npm run dev
```

### "No puedo conectar a PostgreSQL"
```bash
# Verificar que PostgreSQL está corriendo
# Verificar credenciales en .env
psql -h localhost -U postgres
```

---

## 🎓 Resumen rápido

| Acción | Comando/URL |
|--------|------------|
| Iniciar sistema | npm run dev |
| Acceder | http://localhost:3000 |
| Login | admin@odonton.com / admin123 |
| Tests | http://localhost:3000/test.html |
| Crear BD | npm run db:migrate |
| Datos prueba | npm run db:seed |
| Ver logs | Consola navegador (F12) |

---

**¡Sistema listo para usar!** ✅
