# 🗄️ Instalación de PostgreSQL - Odonton

## Estado actual ✅

- ✅ npm install - COMPLETADO (457 paquetes instalados)
- ✅ .env configurado - COMPLETADO
- ⏳ PostgreSQL - PENDIENTE

---

## 📋 Opción 1: PostgreSQL Installer (RECOMENDADO)

### Paso 1: Descargar
1. Ve a: https://www.postgresql.org/download/windows/
2. Descarga PostgreSQL 15 o superior

### Paso 2: Instalar
1. Ejecuta el instalador
2. **Importante - Datos requeridos:**
   - Usuario: `postgres`
   - Contraseña: `postgres` (o la que prefieras)
   - Puerto: `5432`
3. Completa la instalación

### Paso 3: Agregar al PATH (Windows)
1. Abre "Variables de entorno"
2. Agrega: `C:\Program Files\PostgreSQL\15\bin` (ajusta número de versión)
3. Reinicia PowerShell

### Paso 4: Crear base de datos
```powershell
cd "c:\Users\Usuario\Desktop\IES 21\Tesis Odonton\odonton"
.\setup_postgres.ps1
```

Cuando te pida credenciales:
- Usuario: `postgres`
- Contraseña: (la que ingresaste en la instalación)

---

## 🐳 Opción 2: Usar Docker (ALTERNATIVA)

Si tienes Docker instalado:

```powershell
# Crear contenedor PostgreSQL
docker run --name odonton-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres

# Esperar 10 segundos a que inicie
Start-Sleep -Seconds 10

# Crear base de datos
psql -h localhost -U postgres -f "database\init_db.sql"
```

---

## 🖥️ Opción 3: pgAdmin 4 (GUI)

Si prefieres interfaz gráfica:

1. Descargar: https://www.pgadmin.org/
2. Instalar y abrir pgAdmin
3. Crear nueva conexión:
   - Host: `localhost`
   - Puerto: `5432`
   - Usuario: `postgres`
   - Contraseña: (la que ingresaste)
4. Abrir herramienta Query:
   - Copiar contenido de [database/init_db.sql](./database/init_db.sql)
   - Ejecutar

---

## ✅ Verificar instalación

Después de instalar PostgreSQL:

```powershell
# Verificar que psql está disponible
psql --version

# Deberá mostrar: psql (PostgreSQL) X.X.X
```

---

## 🔧 Si tienes problemas

### Error: "psql no se reconoce"
- ✓ Reinicia PowerShell después de instalar
- ✓ Verifica que PostgreSQL está en PATH
- ✓ Usa ruta completa: `C:\Program Files\PostgreSQL\15\bin\psql.exe`

### Error: "conexión rechazada"
- ✓ Verifica que el servicio PostgreSQL está corriendo
- ✓ En Windows: Panel de Control → Servicios → PostgreSQL

### Error: "contraseña incorrecta"
- ✓ Usa la contraseña que ingresaste en la instalación
- ✓ Por defecto el usuario es `postgres`

---

## 📊 Credenciales por defecto (después de setup)

```
Host:       localhost
Puerto:     5432
Base de datos: odonton_db
Usuario:    postgres
Contraseña: postgres (o la que ingresaste)

Usuario Admin Odonton:
Email:      admin@odonton.com
Contraseña: admin123
```

---

## 🚀 Siguiente paso

Una vez que PostgreSQL esté configurado:

```bash
npm run dev
```

El sistema estará listo en: http://localhost:3000

---

## 📚 Recursos

- PostgreSQL: https://www.postgresql.org/
- pgAdmin: https://www.pgadmin.org/
- Docker: https://www.docker.com/
- SQL inicialización: [database/init_db.sql](./database/init_db.sql)

