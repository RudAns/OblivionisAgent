@echo off
rem ============================================================
rem  OblivionisAgent - rebuild bridge + desktop app, then
rem  redeploy to the portable folder and relaunch it.
rem
rem  Double-click when you want to ship the latest code to the
rem  portable build. It BUILDS FIRST (the running app stays open
rem  during the build, so your chat is not interrupted), then
rem  closes the app, copies the new exes, and reopens it.
rem
rem  Finds the portable folder by the OblivionisAgent-* prefix
rem  one level up, so no path is hardcoded.
rem ============================================================
setlocal
cd /d "%~dp0"

where pnpm >nul 2>&1
if errorlevel 1 ( echo [ERROR] pnpm not found in PATH. & pause & exit /b 1 )

for %%P in ("%~dp0..") do set "DESKTOP=%%~fP"
set "PORTABLE="
for /d %%D in ("%DESKTOP%\OblivionisAgent-*") do set "PORTABLE=%%~fD"
if not defined PORTABLE ( echo [ERROR] portable folder OblivionisAgent-* not found in %DESKTOP% & pause & exit /b 1 )
echo Project : %~dp0
echo Portable: %PORTABLE%
echo.

echo [1/5] Building bridge sidecar...
pushd "%~dp0packages\bridge"
call pnpm package
if errorlevel 1 ( popd & echo [ERROR] bridge build failed & pause & exit /b 1 )
popd

echo [2/5] Building desktop app...
pushd "%~dp0apps\desktop"
call pnpm tauri build --no-bundle
if errorlevel 1 ( popd & echo [ERROR] app build failed & pause & exit /b 1 )
popd

set "APP_SRC=%~dp0apps\desktop\src-tauri\target\release\oblivionis-desktop.exe"
set "BRIDGE_SRC=%~dp0apps\desktop\src-tauri\binaries\oblivionis-bridge-x86_64-pc-windows-msvc.exe"
if not exist "%APP_SRC%" ( echo [ERROR] missing %APP_SRC% & pause & exit /b 1 )
if not exist "%BRIDGE_SRC%" ( echo [ERROR] missing %BRIDGE_SRC% & pause & exit /b 1 )

echo [3/5] Stopping running app / sidecar...
taskkill /IM OblivionisAgent.exe /F >nul 2>&1
taskkill /IM oblivionis-desktop.exe /F >nul 2>&1
taskkill /IM oblivionis-bridge.exe /F >nul 2>&1
timeout /t 1 /nobreak >nul

echo [4/5] Deploying to portable...
copy /Y "%APP_SRC%" "%PORTABLE%\OblivionisAgent.exe" >nul
if errorlevel 1 ( echo [ERROR] copy app exe failed & pause & exit /b 1 )
copy /Y "%BRIDGE_SRC%" "%PORTABLE%\oblivionis-bridge.exe" >nul
if errorlevel 1 ( echo [ERROR] copy bridge exe failed & pause & exit /b 1 )

echo [5/5] Relaunching portable app...
start "" "%PORTABLE%\OblivionisAgent.exe"

echo.
echo Done. Bridge + app rebuilt, deployed, and relaunched.
timeout /t 4 /nobreak >nul
