# Publishes the Hal's News alert service to GitHub. Run from this folder:
#   powershell -ExecutionPolicy Bypass -File .\publish-alerts.ps1
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$user = Read-Host "Your GitHub username"
$user = $user.Trim()
if (-not $user) { Write-Host "No username entered. Stopping."; exit 1 }

# 1. Put the schedule file where GitHub expects it.
New-Item -ItemType Directory -Force -Path ".github\workflows" | Out-Null
if (Test-Path "breaking-news.workflow.yml") {
    Move-Item -Force "breaking-news.workflow.yml" ".github\workflows\breaking-news.yml"
}
if (-not (Test-Path ".github\workflows\breaking-news.yml")) {
    Write-Host "ERROR: breaking-news.yml is missing. Stopping."; exit 1
}

# 2. Make sure git knows who you are.
if (-not (git config --global user.name))  { git config --global user.name "Hal" }
if (-not (git config --global user.email)) { git config --global user.email "hal0428@gmail.com" }

# 3. Save the files in a new git repository.
if (-not (Test-Path ".git")) { git init }
git add .
git commit -m "Breaking news alerts"
git branch -M main

# 4. Connect to GitHub and upload.
$url = "https://github.com/$user/hals-news-alerts.git"
if (git remote) { git remote remove origin }
git remote add origin $url
Write-Host ""
Write-Host "Uploading to $url (a browser window may ask you to sign in to GitHub)..."
git push -u origin main

Write-Host ""
Write-Host "Done. Open https://github.com/$user/hals-news-alerts to check that the files are there."
