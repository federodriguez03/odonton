param(
  [string]$BaseUrl = "http://localhost:3000",
  [switch]$UseExistingServer
)

$ErrorActionPreference = "Stop"
$serverProcess = $null

function Api {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null
  )
  if ($null -eq $Body) {
    return Invoke-RestMethod -Uri $Url -Method $Method
  }
  return Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10)
}

if (-not $UseExistingServer) {
  try {
    Api -Method "GET" -Url "$BaseUrl/health" | Out-Null
  } catch {
    $serverProcess = Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory "backend" -PassThru
    Start-Sleep -Seconds 4
  }
}

try {
  $health = Api -Method "GET" -Url "$BaseUrl/health"
  Write-Host "Health: $($health.estado)"

  $prest = Api -Method "GET" -Url "$BaseUrl/api/prestaciones"
  if (-not $prest.prestaciones -or $prest.prestaciones.Count -eq 0) { throw "No hay prestaciones cargadas." }
  $prestId = [int]$prest.prestaciones[0].id

  # 2.1 Solicitar turno
  $dni1 = [string](Get-Random -Minimum 30000000 -Maximum 49999999)
  $tel1 = "+549351" + (Get-Random -Minimum 1000000 -Maximum 9999999)
  $link1 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/solicitar-turno/link" -Body @{ telefono = $tel1 }
  $token1 = $link1.token.token
  $null = Api -Method "GET" -Url "$BaseUrl/api/pacientes/autogestion/solicitar-turno/token/$token1"
  $null = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/solicitar-turno/disponibilidad" -Body @{ token = $token1 }
  $inicio1 = (Get-Date).AddDays(14).Date.AddHours(10).ToString("yyyy-MM-ddTHH:mm:ss")
  $cu21 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/solicitar-turno/confirmar" -Body @{
    token = $token1
    dni = $dni1
    nombre = "Auto"
    apellido = "Solicita"
    telefono = $tel1
    prestacionId = $prestId
    fechaHoraInicio = $inicio1
  }
  Write-Host "CU 2.1 OK -> Turno $($cu21.turno.id) estado $($cu21.turno.estado)"

  # Paciente base para 2.2 y 2.3
  $dni2 = [string](Get-Random -Minimum 30000000 -Maximum 49999999)
  $tel2 = "+549351" + (Get-Random -Minimum 1000000 -Maximum 9999999)
  $pac2 = Api -Method "POST" -Url "$BaseUrl/api/pacientes" -Body @{ nombre = "Auto"; apellido = "Paciente"; dni = $dni2; telefono = $tel2 }

  # 2.2 Cancelar turno propio
  $inicio2 = (Get-Date).AddDays(10).Date.AddHours(11).ToString("yyyy-MM-ddTHH:mm:ss")
  $t2 = Api -Method "POST" -Url "$BaseUrl/api/turnos" -Body @{ pacienteId = $pac2.paciente.id; prestacionId = $prestId; fechaHoraInicio = $inicio2 }
  $null = Api -Method "POST" -Url "$BaseUrl/api/turnos/recordatorios/respuesta" -Body @{ turnoId = $t2.turno.id; accion = "confirmar" }
  $link2 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/cancelar-turno/link" -Body @{ telefono = $tel2 }
  $token2 = $link2.token.token
  $lista2 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/cancelar-turno/listar" -Body @{ token = $token2; dni = $dni2 }
  $cu22 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/cancelar-turno/confirmar" -Body @{ token = $token2; dni = $dni2; turnoId = $t2.turno.id; confirmar = $true }
  Write-Host "CU 2.2 OK -> Lista $($lista2.turnos.Count) | Turno $($cu22.turno.id) estado $($cu22.turno.estado)"

  # 2.3 Reprogramar turno propio
  $inicio3 = (Get-Date).AddDays(12).Date.AddHours(12).ToString("yyyy-MM-ddTHH:mm:ss")
  $t3 = Api -Method "POST" -Url "$BaseUrl/api/turnos" -Body @{ pacienteId = $pac2.paciente.id; prestacionId = $prestId; fechaHoraInicio = $inicio3 }
  $null = Api -Method "POST" -Url "$BaseUrl/api/turnos/recordatorios/respuesta" -Body @{ turnoId = $t3.turno.id; accion = "confirmar" }
  $link3 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/reprogramar-turno/link" -Body @{ telefono = $tel2 }
  $token3 = $link3.token.token
  $lista3 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/reprogramar-turno/listar" -Body @{ token = $token3; dni = $dni2 }
  $null = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/reprogramar-turno/disponibilidad" -Body @{ token = $token3; dni = $dni2; turnoId = $t3.turno.id }
  $nuevoInicio3 = (Get-Date).AddDays(16).Date.AddHours(13).ToString("yyyy-MM-ddTHH:mm:ss")
  $cu23 = Api -Method "POST" -Url "$BaseUrl/api/pacientes/autogestion/reprogramar-turno/confirmar" -Body @{
    token = $token3
    dni = $dni2
    turnoId = $t3.turno.id
    fechaHoraInicioNueva = $nuevoInicio3
    confirmar = $true
  }
  Write-Host "CU 2.3 OK -> Lista $($lista3.turnos.Count) | Turno $($cu23.turno.id) estado $($cu23.turno.estado)"

  Write-Host "Pruebas de autogestion finalizadas correctamente."
} finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
  }
}
