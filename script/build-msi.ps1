$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"
$wxsPath = Join-Path $projectRoot "installer\wix\Product.wxs"
$msiOutDir = Join-Path $projectRoot "release"
$msiPath = Join-Path $msiOutDir "DocuCapture-Setup.msi"

if (-not (Test-Path $msiOutDir)) {
  New-Item -ItemType Directory -Path $msiOutDir | Out-Null
}

Push-Location $projectRoot
try {
  npm run build
  npm run build:help 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Output "Skipping CHM (HTML Help Workshop optional for MSI)."
  }
  $gen = Join-Path $projectRoot "installer\tools\Generate-Wix.ps1"
  & $gen -ProjectRoot $projectRoot
} finally {
  Pop-Location
}

if (-not (Test-Path $distDir)) {
  throw "Missing dist output. Build failed."
}

if (-not (Test-Path $wxsPath)) {
  throw "Missing WiX source file: $wxsPath"
}

$wix = Get-Command wix -ErrorAction SilentlyContinue
if (-not $wix) {
  $wixFallback = "C:\Program Files\WiX Toolset v6.0\bin\wix.exe"
  if (Test-Path $wixFallback) {
    $wix = @{ Source = $wixFallback }
  } else {
    throw "WiX CLI not found. Install WiX Toolset and ensure 'wix' is on PATH."
  }
}

$genWxs = Join-Path $projectRoot "installer\wix\Generated.wxs"
Push-Location $projectRoot
try {
  & $wix.Source build $wxsPath $genWxs -o $msiPath
} finally {
  Pop-Location
}

Write-Output "Built MSI: $msiPath"
