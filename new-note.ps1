<#
.SYNOPSIS
  Create a short note in notes/. Notes go live as soon as you push.

.EXAMPLE
  .\new-note

.EXAMPLE
  .\new-note "Odd numbers make squares" -Category "Visual"

.EXAMPLE
  .\new-note -Draft
#>
param(
  [Parameter(Position = 0)][string]$Title = "",
  [string[]]$Category = @(),
  [switch]$Draft   # keep it out of the live site until you delete 'draft: true'
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$date = Get-Date -Format "yyyy-MM-dd"

# "Odd numbers make squares" -> 2026-11-02-odd-numbers-make-squares.qmd; no title -> 2026-11-02-1530.qmd
$slug = ($Title.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
if (-not $slug) { $slug = Get-Date -Format "HHmm" }
$file = Join-Path $root "notes\$date-$slug.qmd"
if (Test-Path $file) { throw "notes\$date-$slug.qmd already exists." }

$Category = $Category | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$lines = @("---")
if ($Title) { $lines += "title: `"$($Title -replace '"', '\"')`"" }
$lines += "date: $date"
if ($Category) { $lines += "categories: [" + (($Category | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ", ") + "]" }
if ($Draft) { $lines += "draft: true" }
$lines += "---", "", "Write here. Maths works as usual: `$e^{i\pi} + 1 = 0`$.", ""

[System.IO.File]::WriteAllText($file, ($lines -join "`n"), (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "  Created notes\$date-$slug.qmd" -ForegroundColor Green
if ($Draft) { Write-Host "  It's a draft: delete 'draft: true' to publish it." }
else { Write-Host "  It goes live the next time you push." }
Write-Host ""
