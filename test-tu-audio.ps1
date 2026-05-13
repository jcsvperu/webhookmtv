# Test Webhook MTV - Tu Audio

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST CON TU PROPIO AUDIO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Archivos de audio soportados: .mp3, .wav, .webm, .m4a, .ogg" -ForegroundColor Yellow
Write-Host ""

$audioFile = Read-Host "Pega la ruta de tu archivo de audio"

if (Test-Path $audioFile) {
    $ext = [System.IO.Path]::GetExtension($audioFile).ToLower()
    
    Write-Host ""
    Write-Host "Archivo encontrado: $audioFile" -ForegroundColor Green
    Write-Host "Tipo: $ext"
    Write-Host ""
    Write-Host "Enviando al webhook..." -ForegroundColor Yellow
    
    $audioBytes = [System.IO.File]::ReadAllBytes($audioFile)
    $audioBase64 = [Convert]::ToBase64String($audioBytes)
    
    $body = @{
        audio = $audioBase64
        respondWithVoice = $true
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/webhook" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 90
        
        Write-Host ""
        Write-Host "RESPUESTA:" -ForegroundColor Cyan
        Write-Host $response.answer -ForegroundColor White
        
        if ($response.audio) {
            $outputFile = "tu_respuesta_$(Get-Date -Format 'yyyyMMddHHmmss').mp3"
            $respBytes = [Convert]::FromBase64String($response.audio)
            [System.IO.File]::WriteAllBytes($outputFile, $respBytes)
            Write-Host ""
            Write-Host "Audio de respuesta guardado: $outputFile" -ForegroundColor Green
            Write-Host "Ejecuta este comando para reproducir:" -ForegroundColor Yellow
            Write-Host "  Start-Process '$outputFile'"
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Archivo no encontrado. Verifica la ruta." -ForegroundColor Red
    Write-Host ""
    Write-Host "Ayuda: Las rutas se pegan con formato como:" -ForegroundColor Gray
    Write-Host "  C:\Users\TuUsuario\Documents\audio.wav" -ForegroundColor Gray
}

Write-Host ""
Read-Host "Presiona Enter para salir"