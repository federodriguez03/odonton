$ErrorActionPreference = 'Stop'
$BackendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvFile = Join-Path $BackendRoot '.env'
if (-not (Test-Path -LiteralPath $EnvFile)) { throw 'No existe backend/.env con la conexión local base.' }

Get-Content -LiteralPath $EnvFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
}

$env:DB_NAME = 'odonton_demo_2026'
$env:ODONTON_DEMO_MODE = 'true'
$env:WHATSAPP_AUTO_START = 'false'
$env:WHATSAPP_POLLING_ENABLED = 'false'
$env:REMINDERS_ENABLED = 'false'
$env:EXTERNAL_SENDS_ENABLED = 'false'
$env:DOCUMENTOS_UPLOAD_SUBDIR = 'uploads/demo-2026'

Set-Location -LiteralPath $BackendRoot
& node 'src/server.js'
exit $LASTEXITCODE

