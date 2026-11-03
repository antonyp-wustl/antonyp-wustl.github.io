@echo off
rem Lets you run "new-note ..." from any terminal without changing the PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0new-note.ps1" %*
