@echo off
cd /d "%~dp0"
echo Instalando (so na primeira vez, precisa de internet)...
if not exist node_modules call npm install
echo Abrindo o jogo no navegador... NAO feche esta janela enquanto estiver jogando.
call npm run dev -- --open
pause
