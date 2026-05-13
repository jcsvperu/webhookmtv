# Test Webhook MTV

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST WEBHOOK MTV - Decreto 012-2015" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$opciones = @(
    "De qué trata el documento?",
    "Qué es un modulo temporal de vivienda?",
    "Quién puede acceder a los modulos de vivienda?"
)

Write-Host "Opciones:" -ForegroundColor Yellow
for ($i = 0; $i -lt $opciones.Count; $i++) {
    Write-Host "  $($i+1) - $($opciones[$i])"
}
Write-Host "  4 - Pregunta personalizada"
Write-Host ""

$opcion = Read-Host "Elige una opcion (1-4)"

switch ($opcion) {
    1 { $pregunta = "De qué trata el documento?" }
    2 { $pregunta = "Qué es un modulo temporal de vivienda?" }
    3 { $pregunta = "Quién puede acceder a los modulos de vivienda?" }
    4 { $pregunta = Read-Host "Escribe tu pregunta" }
    default { Write-Host "Opción inválida"; exit }
}

Write-Host ""
Write-Host "Enviando: $pregunta" -ForegroundColor Green
Write-Host ""

$body = @{
    text = $pregunta
    respondWithVoice = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/webhook" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 60
    
    Write-Host "RESPUESTA:" -ForegroundColor Cyan
    Write-Host $response.answer -ForegroundColor White
    
    if ($response.audio) {
        Write-Host ""
        Write-Host "Audio: SÍ (base64 de $($response.audio.Length) caracteres)" -ForegroundColor Green
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Read-Host "Presiona Enter para salir"