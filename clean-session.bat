@echo off
set "DATA_DIR=%AppData%\flux-node-manager"

if not exist "%DATA_DIR%" (
    echo Data directory not found: "%DATA_DIR%"
    goto :END
)

echo Found data directory: "%DATA_DIR%"
set "CHOICE=N"
set /p "CHOICE=Are you sure you want to delete it? (y/N): "

if /i "%CHOICE%"=="y" (
    rmdir /s /q "%DATA_DIR%"
    echo [OK] Data cleared.
) else (
    echo Operation cancelled.
)

:END
pause