@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title Charly Tactico - Escaner OMR

:: ════════════════════════════════════════════════════════
::  PASO 1 — Verificar si ya tenemos permisos de admin
:: ════════════════════════════════════════════════════════
net session >nul 2>&1
if %errorLevel% == 0 goto :SOMOS_ADMIN

:: ── Solicitar elevación UAC ──────────────────────────────
echo.
echo  Necesitamos permisos de administrador para abrir el
echo  puerto en el Firewall de Windows.
echo.
echo  Se abrira una ventana de confirmacion...
echo.
powershell -NoProfile -Command ^
  "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs -Wait"
exit /b

:SOMOS_ADMIN
cd /d "%~dp0"

:: ════════════════════════════════════════════════════════
::  PASO 2 — Verificar Python
:: ════════════════════════════════════════════════════════
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  Python no esta instalado en este equipo.
    echo  Se abrira la pagina de descarga oficial.
    echo.
    echo  IMPORTANTE: al instalar Python, marca la casilla
    echo  "Add Python to PATH" antes de hacer clic en Install.
    echo.
    pause
    start "" "https://www.python.org/downloads/"
    echo  Despues de instalar Python, vuelve a ejecutar este archivo.
    pause
    exit /b 1
)

:: ════════════════════════════════════════════════════════
::  PASO 3 — Lanzar la interfaz grafica
:: ════════════════════════════════════════════════════════
python lanzador_escaner.py

if %errorLevel% neq 0 (
    echo.
    echo  Ocurrio un error al iniciar el lanzador.
    echo  Verifica que el archivo lanzador_escaner.py este
    echo  en la misma carpeta que este archivo .bat
    echo.
    pause
)
