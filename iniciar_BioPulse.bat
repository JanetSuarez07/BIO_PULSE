@echo off
echo ======================================================
echo Iniciando BioPulse - Sistema Unificado
echo ======================================================

:: 1. Activar el entorno virtual
call env\Scripts\activate.bat

:: 2. Iniciar el Servidor Web (app.py)
echo Iniciando Servidor Web...
start "1. Servidor Web" cmd /k "python app.py"

:: 3. Esperar unos segundos para que Flask cargue correctamente
echo Esperando inicialización del servidor...
timeout /t 5

:: 4. Iniciar el Procesador (procesador.py)
echo Iniciando procesador.py...
start "2. Procesador" cmd /k "python procesador.py"

echo ======================================================
echo SISTEMA INICIADO:
echo 1. Servidor Web y Procesador corriendo en ventanas separadas.
echo 2. Mantén estas ventanas abiertas.
echo ======================================================
pause