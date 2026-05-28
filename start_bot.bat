@echo off
title GlitchCore Discord Bot Launcher
cd /d "%~dp0"

echo ===================================================
echo   🎮 GLITCHCORE DISCORD BOT AUTOMATED LAUNCHER  
echo ===================================================
echo   The bot is starting up...
echo   Close this window at any time to stop the bot.
echo ===================================================
echo.

:loop
echo [%date% %time%] 🚀 Starting GlitchCore...
npm start
echo.
echo ⚠️ [%date% %time%] Bot process stopped or crashed!
echo 🔄 Restarting automatically in 5 seconds (Press Ctrl+C to cancel)...
timeout /t 5 >nul
echo.
goto loop
