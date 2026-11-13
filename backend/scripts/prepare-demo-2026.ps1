param(
  [string]$SourceDatabase = 'odonton_ficha_20261109_test'
)

$ErrorActionPreference = 'Stop'
$TargetDatabase = 'odonton_demo_2026'
$GeneratorId = 'odonton-demo-2026-v1'
$BackendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$EnvFile = Join-Path $BackendRoot '.env'

if ($SourceDatabase -eq $TargetDatabase) {
  throw 'La base fuente no puede ser la base demo de destino.'
}

$localConfig = @{}
if (Test-Path -LiteralPath $EnvFile) {
  Get-Content -LiteralPath $EnvFile | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $localConfig[$matches[1]] = $matches[2] }
  }
}

function Resolve-Setting([string]$Name) {
  $environmentValue = [Environment]::GetEnvironmentVariable($Name)
  if ($environmentValue) { return $environmentValue }
  return $localConfig[$Name]
}

$dbHost = Resolve-Setting 'DB_HOST'
$dbPort = Resolve-Setting 'DB_PORT'
$dbUser = Resolve-Setting 'DB_USER'
$dbPassword = Resolve-Setting 'DB_PASSWORD'
if (-not $dbHost -or -not $dbPort -or -not $dbUser -or -not $dbPassword) {
  throw 'Falta configuración local DB_HOST, DB_PORT, DB_USER o DB_PASSWORD.'
}

$postgresBin = if ($env:POSTGRES_BIN) { $env:POSTGRES_BIN } else { 'C:\Program Files\PostgreSQL\16\bin' }
$psql = Join-Path $postgresBin 'psql.exe'
$pgDump = Join-Path $postgresBin 'pg_dump.exe'
if (-not (Test-Path -LiteralPath $psql) -or -not (Test-Path -LiteralPath $pgDump)) {
  throw 'No se encontraron psql y pg_dump. Definí POSTGRES_BIN localmente.'
}

$env:PGPASSWORD = $dbPassword
$exists = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='$TargetDatabase'"
if (-not $exists) {
  & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $TargetDatabase"
}

$identity = & $psql -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -At -v ON_ERROR_STOP=1 -c "SELECT current_database() || '|' || COALESCE(inet_server_addr()::text,'local')"
if (-not $identity.StartsWith("$TargetDatabase|")) { throw "Destino no autorizado: $identity" }

$tableCount = [int](& $psql -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if ($tableCount -gt 0) {
  $hasMarker = & $psql -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -At -v ON_ERROR_STOP=1 -c "SELECT CASE WHEN to_regclass('public.demo_generator_runs') IS NULL THEN 0 ELSE 1 END"
  $marker = if ($hasMarker -eq '1') { & $psql -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -At -v ON_ERROR_STOP=1 -c "SELECT COALESCE((SELECT generator_id FROM demo_generator_runs LIMIT 1),'')" } else { '' }
  if ($marker -ne $GeneratorId) {
    throw 'La base demo ya contiene tablas no identificadas como propias de este generador. No se modificó.'
  }
} else {
  $sourceExists = & $psql -h $dbHost -p $dbPort -U $dbUser -d postgres -At -v ON_ERROR_STOP=1 -c "SELECT 1 FROM pg_database WHERE datname='$SourceDatabase'"
  if (-not $sourceExists) { throw "No existe la base de esquema fuente $SourceDatabase" }

  & $psql -q -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -v ON_ERROR_STOP=1 -c "DROP SCHEMA public; CREATE SCHEMA public; CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el esquema vacío de la base demo.' }
  $schemaLines = & $pgDump -h $dbHost -p $dbPort -U $dbUser -d $SourceDatabase --schema-only --no-owner --no-privileges --schema=public
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer el esquema vigente desde la base fuente.' }
  $schemaSql = ($schemaLines -join [Environment]::NewLine) -replace '(?m)^CREATE SCHEMA public;\r?\n', ''
  $schemaSql | & $psql -q -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo importar el esquema vigente en la base demo.' }

  & $psql -h $dbHost -p $dbPort -U $dbUser -d $TargetDatabase -v ON_ERROR_STOP=1 -c @"
CREATE TABLE demo_generator_runs (
  generator_id TEXT PRIMARY KEY,
  seed INTEGER NOT NULL,
  cutoff_date DATE NOT NULL,
  status TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  signatures JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);
INSERT INTO demo_generator_runs(generator_id,seed,cutoff_date,status,created_at)
VALUES('$GeneratorId',20261208,DATE '2026-11-13','preparing',TIMESTAMPTZ '2026-11-13 12:00:00-03');
"@
}

$env:DB_HOST = $dbHost
$env:DB_PORT = $dbPort
$env:DB_USER = $dbUser
$env:DB_PASSWORD = $dbPassword
$env:DB_NAME = $TargetDatabase
$env:DEMO_SCHEMA_SOURCE_DATABASE = $SourceDatabase
$env:DEMO_CUTOFF_DATE = if ($env:DEMO_CUTOFF_DATE) { $env:DEMO_CUTOFF_DATE } else { '2026-11-13' }
$env:WHATSAPP_AUTO_START = 'false'
$env:REMINDERS_ENABLED = 'false'

& node (Join-Path $PSScriptRoot 'seed-demo-2026.js')
if ($LASTEXITCODE -ne 0) { throw 'La generación demo falló.' }


