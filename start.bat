@echo off
title CelerVote Dev

echo Starting Redis via WSL (Ubuntu)...
start "Redis" cmd /k "wsl -u root service redis-server start"

timeout /t 3 /nobreak > nul

echo Starting Django Backend...
start "Backend" cmd /k "cd /d C:\Users\rtwen\Desktop\evote\backend && .\venv\Scripts\activate && python manage.py runserver"

echo Starting Celery...
start "Celery" cmd /k "cd /d C:\Users\rtwen\Desktop\evote\backend && .\venv\Scripts\activate && celery -A evoting worker --loglevel=info -P solo"

echo Starting Frontend...
start "Frontend" cmd /k "cd /d C:\Users\rtwen\Desktop\evote\frontend && npm run dev"

echo.
echo All services started!
echo Backend:  http://127.0.0.1:8000
echo Frontend: http://localhost:5173
echo Redis:    127.0.0.1:6379
echo.
pause