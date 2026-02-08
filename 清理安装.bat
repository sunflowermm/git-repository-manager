@echo off
chcp 65001 >nul
echo 正在清理 node_modules 和 pnpm-lock.yaml...
if exist node_modules rmdir /s /q node_modules
if exist pnpm-lock.yaml del /f /q pnpm-lock.yaml
echo 清理完成！
echo.
echo 正在使用国内镜像安装依赖...
call pnpm install
pause
