@echo off
rem Spusti server Hiyorio a pri padu ho po 10 s spusti znovu.
rem Vystup jde do logs\server.log. Okno skryje start-hidden.vbs.
setlocal
cd /d "%~dp0..\.."

rem Uz bezi? (port 7000, pripadne PORT z prostredi)
if "%PORT%"=="" set PORT=7000
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul && exit /b 0

if not exist logs mkdir logs
for %%F in (logs\server.log) do if %%~zF GTR 5000000 del "logs\server.log"

:loop
echo [%date% %time%] start>> logs\server.log
node --use-system-ca --env-file-if-exists=.env src\server.js >> logs\server.log 2>&1
echo [%date% %time%] server skoncil (kod %errorlevel%), restart za 10 s>> logs\server.log
timeout /t 10 /nobreak >nul
goto loop
