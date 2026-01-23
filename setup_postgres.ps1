# Script de configuración de PostgreSQL para Odonton
# Este script ayuda a crear la base de datos

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  CONFIGURACIÓN DE PostgreSQL - Odonton" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Detectar si PostgreSQL está instalado
$pgPath = Get-Command psql -ErrorAction SilentlyContinue

if ($null -eq $pgPath) {
    Write-Host "⚠️  PostgreSQL no está en el PATH" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "OPCIONES DE INSTALACIÓN:" -ForegroundColor Green
    Write-Host ""
    Write-Host "1️⃣  OPCIÓN A: Usar PostgreSQL Desktop App (recomendado)" -ForegroundColor Cyan
    Write-Host "   • Descargar desde: https://www.postgresql.org/download/windows/" -ForegroundColor Gray
    Write-Host "   • Instalar (mantener usuario 'postgres', contraseña 'postgres')" -ForegroundColor Gray
    Write-Host "   • Agregar PostgreSQL bin al PATH (C:\Program Files\PostgreSQL\XX\bin)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2️⃣  OPCIÓN B: Usar pgAdmin 4 (GUI)" -ForegroundColor Cyan
    Write-Host "   • Descargar: https://www.pgadmin.org/download/" -ForegroundColor Gray
    Write-Host "   • Crear conexión local con credenciales" -ForegroundColor Gray
    Write-Host "   • Ejecutar el script init_db.sql" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3️⃣  OPCIÓN C: Usar Docker" -ForegroundColor Cyan
    Write-Host "   docker run --name odonton-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres" -ForegroundColor Gray
    Write-Host ""
    exit
}

# PostgreSQL está instalado
Write-Host "✅ PostgreSQL encontrado" -ForegroundColor Green
Write-Host ""

# Pedirle al usuario credenciales
$user = Read-Host "Usuario PostgreSQL (por defecto: postgres)"
if ([string]::IsNullOrEmpty($user)) { $user = "postgres" }

$password = Read-Host "Contraseña PostgreSQL" -AsSecureString
$passwordText = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($password))

Write-Host ""
Write-Host "Intentando conectar a PostgreSQL..." -ForegroundColor Yellow

# Intentar conexión
try {
    $env:PGPASSWORD = $passwordText
    $output = psql -U $user -h localhost -f ".\database\init_db.sql" 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ ¡Base de datos creada exitosamente!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Resumen:" -ForegroundColor Cyan
        Write-Host "  • Base de datos: odonton_db" -ForegroundColor Gray
        Write-Host "  • Tablas: 9" -ForegroundColor Gray
        Write-Host "  • Usuario: admin@odonton.com" -ForegroundColor Gray
        Write-Host "  • Contraseña: admin123" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Puedes iniciar el servidor con: npm run dev" -ForegroundColor Green
    } else {
        Write-Host "❌ Error al crear la base de datos" -ForegroundColor Red
        Write-Host $output
    }
}
catch {
    Write-Host "❌ Error de conexión: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Verifica:" -ForegroundColor Yellow
    Write-Host "  • PostgreSQL está corriendo" -ForegroundColor Gray
    Write-Host "  • Usuario y contraseña son correctos" -ForegroundColor Gray
    Write-Host "  • Host es localhost" -ForegroundColor Gray
}
finally {
    $env:PGPASSWORD = ""
}
