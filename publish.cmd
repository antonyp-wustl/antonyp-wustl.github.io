@echo off
rem Lets you run "publish ..." from any terminal without changing the PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish.ps1" %*
