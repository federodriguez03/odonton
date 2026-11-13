$ErrorActionPreference = 'Stop'
$BackendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvFile = Join-Path $BackendRoot '.env'
if (-not (Test-Path -LiteralPath $EnvFile)) { throw 'No existe backend/.env para recuperar la configuración anterior.' }

Get-Content -LiteralPath $EnvFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') }
}

$env:ODONTON_DEMO_MODE = 'false'
$env:DOCUMENTOS_UPLOAD_SUBDIR = 'uploads/documentos'

Set-Location -LiteralPath $BackendRoot
& node 'src/server.js'
exit $LASTEXITCODE

