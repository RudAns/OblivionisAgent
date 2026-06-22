@echo off
REM OblivionisAgent local release: signed NSIS installer + latest.json + GitHub Release
REM Bump the 5 version spots + CHANGELOG first, then double-click this.
cd /d "%~dp0"
node scripts\release.mjs %*
echo.
pause
