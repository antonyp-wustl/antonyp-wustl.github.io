@echo off
rem Lets you run "new-post ..." from any terminal without changing the PowerShell execution policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0new-post.ps1" %*
