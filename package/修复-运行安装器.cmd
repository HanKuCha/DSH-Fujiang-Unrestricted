@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo 正在启动 DSH Fujiang 安装器...
"%~dp0DSH-Fujiang-Installer.exe"
set "RC=%errorlevel%"
echo.
echo 安装器已退出，返回码：%RC%
if not "%RC%"=="0" pause
endlocal
