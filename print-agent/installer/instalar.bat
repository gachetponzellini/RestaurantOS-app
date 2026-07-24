@echo off
setlocal
set "DEST=%LOCALAPPDATA%\RestaurantOS-PrintAgent"
set "TAREA=RestaurantOS PrintAgent"

echo ==============================================
echo   Instalador del print-agent - RestaurantOS
echo ==============================================
echo.

if not exist "%~dp0print-agent.exe" (
  echo ERROR: no encuentro print-agent.exe junto a este instalador.
  echo Descomprimi el ZIP completo y corre instalar.bat desde ahi.
  pause
  exit /b 1
)

if not exist "%~dp0config.json" (
  echo ATENCION: no encuentro config.json en esta carpeta.
  echo.
  echo   1^) Descarga el instalador desde el panel ^(boton "Descargar instalador"^).
  echo   2^) Deja el config.json descargado junto a este instalar.bat.
  echo   3^) Volve a ejecutar instalar.bat.
  echo.
  pause
  exit /b 1
)

echo Copiando archivos a:
echo   %DEST%
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "%~dp0print-agent.exe"     "%DEST%\" >nul
copy /Y "%~dp0iniciar-agente.bat"  "%DEST%\" >nul
copy /Y "%~dp0config.json"         "%DEST%\" >nul

echo Registrando arranque automatico al iniciar sesion...
schtasks /create /tn "%TAREA%" /tr "\"%DEST%\iniciar-agente.bat\"" /sc onlogon /f >nul
if errorlevel 1 (
  echo ERROR: no se pudo registrar la tarea programada.
  pause
  exit /b 1
)

echo Arrancando el agente...
schtasks /run /tn "%TAREA%" >nul

echo.
echo LISTO. El agente quedo corriendo y arranca solo al iniciar sesion.
echo.
echo   Ver estado:  schtasks /query /tn "%TAREA%"
echo   Frenar:      schtasks /end   /tn "%TAREA%"
echo   Reinstalar:  volve a correr este instalar.bat
echo.
pause
