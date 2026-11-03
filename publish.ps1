<#
.SYNOPSIS
  Put everything you've changed on the live site: commit, push, and wait for the rebuild.

.DESCRIPTION
  Saves every change in the folder to GitHub in one go (picking up anything published
  from the Write page in the meantime), then follows the rebuild and prints the
  address of each page you changed once it's live.

.EXAMPLE
  .\publish

.EXAMPLE
  .\publish "Fix a typo in the Basel post"

.EXAMPLE
  .\publish -Live      # also publish any changed drafts (removes their 'draft: true')
#>
param(
  [Parameter(Position = 0)][string]$Message,
  [switch]$Live,       # take changed drafts out of draft mode
  [switch]$NoWait      # don't wait for the rebuild
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding $false

function Invoke-Git { & git.exe @args; if ($LASTEXITCODE) { throw "git $($args -join ' ') failed." } }

$site = ((Select-String -Path "_quarto.yml" -Pattern '^\s*site-url:\s*(\S+)').Matches[0].Groups[1].Value).TrimEnd('/')
$remote = (& git remote get-url origin)
if ($remote -notmatch 'github\.com[:/]([^/]+)/(.+?)(\.git)?$') { throw "Couldn't work out the GitHub repository from '$remote'." }
$repo = "$($Matches[1])/$($Matches[2])"

# Which pages changed? ("git status" lists new folders as one entry, so expand them.)
$changed = & git status --porcelain --untracked-files=all | ForEach-Object { $_.Substring(3).Trim('"') }
if (-not $changed) { Write-Host "`n  Nothing has changed since the last publish.`n"; exit 0 }
$pages = $changed | Where-Object { $_ -match '^(posts/[^_/][^/]*/index|notes/[^_/][^/]*|problems/[^_/][^/]*)\.qmd$' -and (Test-Path $_) }

function Get-Front($path) {
  $text = [System.IO.File]::ReadAllText((Resolve-Path $path), $utf8)
  $title = if ($text -match '(?m)^title:\s*"?(.*?)"?\s*$') { $Matches[1] } else { Split-Path $path -Leaf }
  [pscustomobject]@{ Path = $path; Title = $title; Draft = $text -match '(?m)^draft:\s*true'; Scheduled = $text -match '(?m)^scheduled:\s*true'; Text = $text }
}
$info = @($pages | ForEach-Object { Get-Front $_ })

if ($Live) {
  foreach ($p in $info | Where-Object { $_.Draft -and -not $_.Scheduled }) {
    $text = $p.Text -replace '(?m)^draft:\s*true.*\r?\n', ''
    [System.IO.File]::WriteAllText((Resolve-Path $p.Path), $text, $utf8)
    $p.Draft = $false
  }
}

if (-not $Message) {
  $titles = @($info | ForEach-Object { $_.Title })
  $Message = if ($titles.Count -eq 1) { "Publish: $($titles[0])" } elseif ($titles.Count) { "Publish: " + ($titles -join ', ') } else { "Update the site" }
}

Write-Host ""
Write-Host "  Publishing: $Message" -ForegroundColor Cyan
foreach ($p in $info) {
  $state = if ($p.Scheduled) { "scheduled" } elseif ($p.Draft) { "draft, stays hidden (add -Live to publish it)" } else { "goes live" }
  Write-Host "    $($p.Path)  ($state)"
}

Invoke-Git add -A
Invoke-Git commit -q -m $Message
# The Write page commits straight to GitHub, so fetch those first.
Invoke-Git pull -q --rebase
Invoke-Git push -q
$sha = (& git rev-parse HEAD).Trim()
Write-Host "  Sent to GitHub." -ForegroundColor Green

$urls = @($info | Where-Object { -not $_.Draft } | ForEach-Object {
  $path = $_.Path -replace '/index\.qmd$', '/' -replace '\.qmd$', ''
  "$site/$path"
})

if ($NoWait) { Write-Host "  The site updates in about a minute.`n"; exit 0 }

# Follow the rebuild (the repo is public, so no login is needed to watch it).
$started = Get-Date
$last = ""
while (((Get-Date) - $started).TotalMinutes -lt 10) {
  Start-Sleep -Seconds 5
  try {
    $run = (Invoke-RestMethod "https://api.github.com/repos/$repo/actions/runs?head_sha=$sha" -Headers @{ "User-Agent" = "antony-mathematics-publish" }).workflow_runs | Select-Object -First 1
  } catch { continue }
  if (-not $run) { continue }
  if ($run.status -ne "completed") {
    $secs = [int]((Get-Date) - $started).TotalSeconds
    $line = "  Rebuilding the site... $secs s"
    Write-Host "`r$line" -NoNewline
    $last = $line
    continue
  }
  if ($last) { Write-Host "" }
  if ($run.conclusion -eq "success") {
    Write-Host "  Live." -ForegroundColor Green
    foreach ($u in $urls) { Write-Host "    $u" }
  } else {
    Write-Host "  The rebuild failed: $($run.html_url)" -ForegroundColor Red
    exit 1
  }
  Write-Host ""
  exit 0
}
Write-Host "`n  Still rebuilding after 10 minutes. Check https://github.com/$repo/actions`n" -ForegroundColor Yellow
