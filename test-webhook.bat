@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   TEST WEBHOOK MTV - Decreto 012-2015
echo ========================================
echo.
echo Opciones:
echo 1 - Pregunta: ¿De qué trata el documento?
echo 2 - Pregunta: ¿Qué es un modulo temporal de vivienda?
echo 3 - Pregunta personalizada
echo.
set /p opcion="Elige una opcion (1-3): "

if "%opcion%"=="1" (
    set "pregunta=¿De qué trata el documento?"
) else if "%opcion%"=="2" (
    set "pregunta=¿Qué es un modulo temporal de vivienda?"
) else if "%opcion%"=="3" (
    set /p pregunta="Escribe tu pregunta: "
) else (
    echo Opcion invalida
    exit /b 1
)

echo.
echo Enviando pregunta: %pregunta%
echo.
curl -s -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d "{\"text\": \"%pregunta%\", \"respondWithVoice\": true}"
echo.
pause