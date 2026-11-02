<#
.SYNOPSIS
  Create a new post from posts/_template.

.EXAMPLE
  .\new-post "Quadratic reciprocity, visually" -Category "Number Theory, Visual"

.EXAMPLE
  .\new-post "Notes on compactness" -Category Analysis -Publish
#>
param(
  [Parameter(Mandatory = $true, Position = 0)][string]$Title,
  [string[]]$Category = @("Notes"),
  [switch]$Publish   # skip draft mode so it appears on the site immediately
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# "Quadratic reciprocity, visually" -> "quadratic-reciprocity-visually"
$slug = ($Title.ToLowerInvariant() -replace "[^a-z0-9]+", "-").Trim("-")
if (-not $slug) { throw "Couldn't make a folder name from '$Title'." }

$dir = Join-Path $root "posts\$slug"
if (Test-Path $dir) { throw "posts\$slug already exists." }

$date = Get-Date -Format "yyyy-MM-dd"
# Accept either -Category "A, B" or -Category A, B
$Category = $Category | ForEach-Object { $_ -split "," } | ForEach-Object { $_.Trim() } | Where-Object { $_ }
$cats = ($Category | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join ", "
$safeTitle = $Title -replace '"', '\"'

$text = Get-Content (Join-Path $root "posts\_template\index.qmd") -Raw -Encoding UTF8
$text = $text.Replace('title: "TITLE"', "title: `"$safeTitle`"")
$text = $text.Replace("date: DATE", "date: $date")
$text = $text.Replace("categories: [CATEGORY]", "categories: [$cats]")
if ($Publish) { $text = $text -replace "(?m)^draft: true.*\r?\n", "" }

New-Item -ItemType Directory -Path $dir | Out-Null
[System.IO.File]::WriteAllText((Join-Path $dir "index.qmd"), $text, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "  Created posts\$slug\index.qmd" -ForegroundColor Green
if (-not $Publish) { Write-Host "  It's a draft: visible in 'quarto preview', hidden on the live site until you delete 'draft: true'." }
Write-Host "  Put images for this post in posts\$slug\ next to index.qmd."
Write-Host ""
