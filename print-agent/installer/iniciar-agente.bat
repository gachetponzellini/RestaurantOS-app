@echo off
rem Mantiene el print-agent corriendo: si el .exe se cierra, lo vuelve a levantar.
rem Se para en su propia carpeta para que encuentre el config.json de al lado.
cd /d "%~dp0"
:loop
print-agent.exe
timeout /t 5 >nul
goto loop
