# Test Webhook MTV con Audio

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST WEBHOOK - VOZ A VOZ" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$audioFile = Read-Host "Ruta del archivo de audio (o Enter para prueba simple)"

if ([string]::IsNullOrWhiteSpace($audioFile)) {
    Write-Host "Generando audio de prueba..." -ForegroundColor Yellow
    
    $testText = "De que trata el documento"
    $url = "https://translate.google.com/translate_tts?ie=UTF-8&q=$([System.Uri]::EscapeDataString($testText))&tl=es&client=tw-ob"
    
    try {
        $audioBytes = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing | ForEach-Object { $_.Content }
        $audioBase64 = [Convert]::ToBase64String($audioBytes)
        
        Write-Host "Enviando audio al webhook..." -ForegroundColor Yellow
        
        $body = @{
            audio = $audioBase64
            respondWithVoice = $true
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "http://localhost:3000/webhook" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 60
        
        Write-Host ""
        Write-Host "TRANSCRIPCION: $testText" -ForegroundColor Gray
        Write-Host ""
        Write-Host "RESPUESTA:" -ForegroundColor Cyan
        Write-Host $response.answer -ForegroundColor White
        
        if ($response.audio) {
            $audioFileName = "respuesta_$(Get-Date -Format 'yyyyMMddHHmmss').mp3"
            $audioBytes = [Convert]::FromBase64String($response.audio)
            [System.IO.File]::WriteAllBytes($audioFileName, $audioBytes)
            Write-Host ""
            Write-Host "Audio guardado: $audioFileName" -ForegroundColor Green
            Write-Host "Reproduce el archivo para escuchar la respuesta" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    if (Test-Path $audioFile) {
        $audioBytes = [System.IO.File]::ReadAllBytes($audioFile)
        $audioBase64 = [Convert]::ToBase64String($audioBytes)
        
        Write-Host "Enviando audio: $audioFile" -ForegroundColor Yellow
        
        $body = @{
            audio = $audioBase64
            respondWithVoice = $true
        } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri "http://localhost:3000/webhook" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 60
            
            Write-Host ""
            Write-Host "RESPUESTA:" -ForegroundColor Cyan
            Write-Host $response.answer -ForegroundColor White
            
            if ($response.audio) {
                $outputFile = "respuesta_$(Get-Date -Format 'yyyyMMddHHmmss').mp3"
                $respBytes = [Convert]::FromBase64String($response.audio)
                [System.IO.File]::WriteAllBytes($outputFile, $respBytes)
                Write-Host ""
                Write-Host "Audio guardado: $outputFile" -ForegroundColor Green
            }
        } catch {
            Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "Archivo no encontrado" -ForegroundColor Red
    }
}

Write-Host ""
Read-Host "Presiona Enter para salir"