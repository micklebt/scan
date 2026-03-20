$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$helpSourceDir = Join-Path $projectRoot "help\chm"
$hhpPath = Join-Path $helpSourceDir "DocuCapture-Help.hhp"
$outputDir = Join-Path $projectRoot "help"
$outputChm = Join-Path $outputDir "DocuCapture-Help.chm"
$hhc = "${env:ProgramFiles(x86)}\HTML Help Workshop\hhc.exe"

if (-not (Test-Path $hhpPath)) {
  throw "Missing CHM project file: $hhpPath"
}

if (-not (Test-Path $hhc)) {
  throw "HTML Help Workshop not found. Install it, then rerun build:help."
}

if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Push-Location $helpSourceDir
try {
  & $hhc $hhpPath | Out-Null
} finally {
  Pop-Location
}

$generatedChm = Join-Path $helpSourceDir "DocuCapture-Help.chm"
if (-not (Test-Path $generatedChm)) {
  throw "CHM build completed without output file."
}

Copy-Item -Path $generatedChm -Destination $outputChm -Force
Write-Output "Built help file: $outputChm"
