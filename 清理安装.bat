@echo off
chcp 65001 >nul
echo 正在清理 node_modules 和 package-lock.json...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /f /q package-lock.json
echo 清理完成！
echo.
echo 正在使用国内镜像安装依赖...
call npm install
pause
