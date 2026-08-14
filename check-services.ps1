<#
.SYNOPSIS
    Verifica que todos los servicios de Racketly (backend, web y Expo) esten
    corriendo y levanta los que falten.

.DESCRIPTION
    Revisa el puerto de cada servicio del monorepo. Si un servicio no esta
    escuchando en su puerto, lo levanta en una nueva ventana de PowerShell
    con "npm run dev --workspace=<paquete>" desde la raiz del repo.
    Para Expo (mobile) revisa si el proceso/puerto del bundler de Metro esta
    activo y, si no, lo levanta con "npm run start --workspace=apps/mobile".

.USAGE
    Ejecutar desde cualquier lado:
        .\check-services.ps1
    O forzar reinicio de todo lo que ya este corriendo:
        .\check-services.ps1 -Restart
#>

param(
    [switch]$Restart
)

$ErrorActionPreference = 'Stop'
$RepoRoot = $PSScriptRoot

# Nombre visible | puerto | workspace npm | icono ventana
$services = @(
    @{ Name = 'api-gateway';         Port = 3000; Workspace = 'services/api-gateway' }
    @{ Name = 'auth-service';        Port = 3001; Workspace = 'services/auth-service' }
    @{ Name = 'booking-service';     Port = 3002; Workspace = 'services/booking-service' }
    @{ Name = 'tournament-service';  Port = 3003; Workspace = 'services/tournament-service' }
    @{ Name = 'community-service';   Port = 3004; Workspace = 'services/community-service' }
    @{ Name = 'academy-service';     Port = 3005; Workspace = 'services/academy-service' }
    @{ Name = 'notification-service';Port = 3006; Workspace = 'services/notification-service' }
    @{ Name = 'web';                 Port = 3010; Workspace = 'apps/web' }
)

# Puerto por defecto del bundler de Metro para Expo
$ExpoPort = 8081

function Test-PortListening {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Service {
    param(
        [string]$Name,
        [string]$Command
    )
    Write-Host "  -> Levantando $Name ..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "cd '$RepoRoot'; Write-Host 'Iniciando $Name' -ForegroundColor Cyan; $Command"
    ) -WindowStyle Normal | Out-Null
}

Write-Host "=== Verificando servicios de Racketly ===" -ForegroundColor Cyan
Write-Host "Raiz del repo: $RepoRoot`n"

$results = @()

foreach ($svc in $services) {
    $isUp = Test-PortListening -Port $svc.Port

    if ($isUp -and $Restart) {
        $conn = Get-NetTCPConnection -LocalPort $svc.Port -State Listen -ErrorAction SilentlyContinue
        if ($conn) {
            Write-Host "Reiniciando $($svc.Name) (puerto $($svc.Port), PID $($conn.OwningProcess))..." -ForegroundColor Magenta
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
            $isUp = $false
        }
    }

    if ($isUp) {
        Write-Host "[OK]   $($svc.Name) (puerto $($svc.Port)) ya esta corriendo." -ForegroundColor Green
        $status = 'UP'
    } else {
        Write-Host "[DOWN] $($svc.Name) (puerto $($svc.Port)) no esta corriendo." -ForegroundColor Red
        Start-Service -Name $svc.Name -Command "npm run dev --workspace=$($svc.Workspace)"
        $status = 'LEVANTADO'
    }

    $results += [PSCustomObject]@{
        Servicio = $svc.Name
        Puerto   = $svc.Port
        Estado   = $status
    }
}

Write-Host "`n=== Verificando Expo (mobile) ===" -ForegroundColor Cyan

$expoUp = Test-PortListening -Port $ExpoPort
if (-not $expoUp) {
    # Fallback: por si Metro quedo en otro puerto, busca el proceso node de expo
    $expoProc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'expo' -and $_.CommandLine -match 'mobile' }
    if ($expoProc) { $expoUp = $true }
}

if ($expoUp -and $Restart) {
    $conn = Get-NetTCPConnection -LocalPort $ExpoPort -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "Reiniciando Expo (PID $($conn.OwningProcess))..." -ForegroundColor Magenta
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        $expoUp = $false
    }
}

if ($expoUp) {
    Write-Host "[OK]   Expo (mobile) ya esta corriendo." -ForegroundColor Green
    $expoStatus = 'UP'
} else {
    Write-Host "[DOWN] Expo (mobile) no esta corriendo." -ForegroundColor Red
    Start-Service -Name 'expo (mobile)' -Command 'npm run start --workspace=apps/mobile'
    $expoStatus = 'LEVANTADO'
}

$results += [PSCustomObject]@{
    Servicio = 'expo (mobile)'
    Puerto   = $ExpoPort
    Estado   = $expoStatus
}

Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize

if ($results.Estado -contains 'LEVANTADO') {
    Write-Host "Se abrieron ventanas nuevas de PowerShell para los servicios levantados." -ForegroundColor Yellow
    Write-Host "Dales unos segundos para compilar/arrancar antes de probar." -ForegroundColor Yellow
}
