@echo off
rem MIRAGE desktop companion for Windows (beta): one double-click install.
rem Downloads the installer from MIRAGE's GitHub release, checks its SHA-256 fingerprint (a
rem different or damaged file is never run), then starts it. No administrator rights needed.
setlocal EnableExtensions
title MIRAGE - desktop companion installer

set "URL=https://github.com/Darshanj-dev/Mirage/releases/download/windows-desktop-v1.0.0-beta/MIRAGE-Desktop-Windows-Setup-1.0.0-beta.exe"
set "SHA256=0eaca71af91566b5317f4d15acafd6893a2b1c9436c7c6e360f5639c4158ee10"
set "OUT=%TEMP%\MIRAGE-Desktop-Windows-Setup.exe"

echo.
echo   MIRAGE - A Privacy Firewall for AI
echo   Desktop companion for the ChatGPT and Claude apps on Windows (beta)
echo.
echo   [1/3] Downloading the installer from GitHub (about 50 MB)...
if exist "%OUT%" del /q "%OUT%" >nul 2>&1
curl.exe -L --fail --silent --show-error -o "%OUT%" "%URL%" 2>nul
if not exist "%OUT%" (
  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -OutFile '%OUT%'"
)
if not exist "%OUT%" (
  echo.
  echo   Download failed. Check your internet connection and run this file again,
  echo   or download MIRAGE-Desktop-Windows-Setup-1.0.0-beta.exe yourself from
  echo   https://github.com/Darshanj-dev/Mirage/releases/tag/windows-desktop-v1.0.0-beta
  goto :fail
)

echo   [2/3] Checking the file's fingerprint...
set "GOT="
for /f "delims=" %%h in ('certutil -hashfile "%OUT%" SHA256 ^| findstr /v ":"') do if not defined GOT set "GOT=%%h"
if defined GOT set "GOT=%GOT: =%"
if /i not "%GOT%"=="%SHA256%" (
  echo.
  echo   The downloaded file is not the expected MIRAGE installer, so it was NOT run.
  echo   A newer installer may have been published: get the latest Install-MIRAGE-Desktop.bat
  echo   from https://github.com/Darshanj-dev/Mirage#download
  del /q "%OUT%" >nul 2>&1
  goto :fail
)

echo   [3/3] Starting the installer...
echo.
echo   If Windows says "Windows protected your PC", choose More info, then Run anyway
echo   (the installer is not code-signed yet).
echo.
start "" /wait "%OUT%"
del /q "%OUT%" >nul 2>&1

echo   Done. MIRAGE runs in the notification area (the shield near the clock).
echo   Open ChatGPT or Claude: when a prompt has personal details or secrets, MIRAGE
echo   shows a review before anything is sent.
echo.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
