@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo 正在打开 DSH Fujiang 卸载器...
"%~dp0DSH-Fujiang-Installer.exe" --uninstall
set "RC=%errorlevel%"
echo.
echo 卸载器已退出，返回码：%RC%
if not "%RC%"=="0" pause
endlocal
