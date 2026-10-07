@echo off
echo =========================================
echo Setting up Mystery Mansion...
echo =========================================

echo Installing dependencies...
call npm install

echo Building the game...
call npm run build

echo Starting the game server on port 3000...
:: Start the server in a separate window so we can start the tunnel in this one
start "Mystery Mansion Server" npm start

echo Waiting for server to start...
timeout /t 5 /nobreak > NUL

echo =========================================
echo Setting up public internet link...
echo =========================================

where ngrok >nul 2>nul
if %errorlevel%==0 (
    echo Ngrok found! Starting ngrok on port 3000...
    ngrok http 3000
) else (
    echo Ngrok not found. Using localtunnel instead...
    call npx localtunnel --port 3000
)
