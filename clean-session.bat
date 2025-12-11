@echo off
set "DATA_DIR=%AppData%\flux-session-monitor"

if not exist "%DATA_DIR%" (
    echo Data directory not found: "%DATA_DIR%"
    goto :END
)

echo Found data directory: "%DATA_DIR%"
set /p "CHOICE=Are you sure you want to delete it? (Y/N): "

if /i "%CHOICE%"=="Y" (
    rmdir /s /q "%DATA_DIR%"
    echo [OK] Data cleared.
) else (
    echo Operation cancelled.
)

:END
pause