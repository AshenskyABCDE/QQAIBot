@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║        NapCat Web Manager 启动脚本                        ║
echo ╚══════════════════════════════════════════════════════════╝
echo.

:: 检查是否安装了依赖
if not exist "node_modules" (
    echo [INFO] 首次运行，正在安装依赖...
    npm install
    if errorlevel 1 (
        echo [ERROR] 安装依赖失败，请检查Node.js是否安装
        pause
        exit /b 1
    )
)

echo [INFO] 启动 NapCat Web Manager...
echo [INFO] 稍后将自动打开浏览器访问 http://localhost:3456
echo.

:: 启动服务器并打开浏览器
start http://localhost:3456
node server.js

pause
