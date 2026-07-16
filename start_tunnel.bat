@echo off
setlocal
ssh -i "C:\Users\Hippo\Downloads\aagam.pem" -N -L 5432:localhost:5432 ubuntu@3.7.75.176
pause
