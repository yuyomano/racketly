# Definir los puertos de Racketly
$puertos = 3001..3006

foreach ($puerto in $puertos) {
    # Busca la conexión en el puerto y obtiene el ID del proceso (PID)
    $proceso = Get-NetTCPConnection -LocalPort $puerto -ErrorAction SilentlyContinue
    
    if ($proceso) {
        Write-Host "Cerrando proceso en puerto $puerto (PID: $($proceso.OwningProcess))"
        Stop-Process -Id $proceso.OwningProcess -Force
    }
}
