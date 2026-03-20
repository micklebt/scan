$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$InstallRoot = $PSScriptRoot
$envFile = Join-Path $InstallRoot "docucapture.env"

function Import-DocuCaptureEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $name = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim()
    if ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) {
      $val = $val.Substring(1, $val.Length - 2) -replace '\\"', '"'
    }
    [System.Environment]::SetEnvironmentVariable($name, $val, "Process")
  }
}

Import-DocuCaptureEnv -Path $envFile

if (-not $env:DATABASE_URL) {
  [System.Windows.Forms.MessageBox]::Show(
    "DATABASE_URL is not set. Edit docucapture.env in:`n$InstallRoot",
    "DocuCapture",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}

$defaultScan = '"C:\Program Files\NAPS2\NAPS2.Console.exe" -o "{output}" --noprofile --driver twain --device "{scanner}" --source {source} --dpi {dpi} --pagesize {paperSize} --bitdepth {colorMode} -f -v'
if (-not $env:SCANNER_HOST_SCAN_COMMAND) {
  $env:SCANNER_HOST_SCAN_COMMAND = $defaultScan
}

$scannerPort = 9803
if ($env:SCANNER_HOST_URL -match ':(\d+)') {
  $scannerPort = [int]$Matches[1]
}

$appPort = 5000
if ($env:PORT) {
  $appPort = [int]$env:PORT
}

function Test-PortListening([int]$Port) {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

$pwsh = "C:\Program Files\PowerShell\7\pwsh.exe"
if (-not (Test-Path $pwsh)) {
  $pwsh = "pwsh.exe"
}

$node = "C:\Program Files\nodejs\node.exe"
if (-not (Test-Path $node)) {
  $n = Get-Command node -ErrorAction SilentlyContinue
  if ($n) { $node = $n.Source } else {
    [System.Windows.Forms.MessageBox]::Show(
      "Node.js not found. Install Node.js LTS and ensure it is on PATH.",
      "DocuCapture",
      "OK",
      "Error"
    ) | Out-Null
    exit 1
  }
}

$scannerScript = Join-Path $InstallRoot "server\scanner-host-example.ps1"
$indexCjs = Join-Path $InstallRoot "index.cjs"

if (-not (Test-Path $scannerScript) -or -not (Test-Path $indexCjs)) {
  [System.Windows.Forms.MessageBox]::Show("Install folder is incomplete (missing index.cjs or server scripts).", "DocuCapture", "OK", "Error") | Out-Null
  exit 1
}

$env:NODE_ENV = "production"
$env:SCANNER_HOST_URL = $env:SCANNER_HOST_URL
$env:PORT = "$appPort"

if (-not (Test-PortListening $scannerPort)) {
  Start-Process -FilePath $pwsh -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $scannerScript,
    "-Port", "$scannerPort"
  ) -WorkingDirectory $InstallRoot -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-PortListening $scannerPort) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
  }
  if (-not (Test-PortListening $scannerPort)) {
    [System.Windows.Forms.MessageBox]::Show("Scanner host did not start on port $scannerPort.", "DocuCapture", "OK", "Error") | Out-Null
    exit 1
  }
}

if (-not (Test-PortListening $appPort)) {
  [System.Environment]::SetEnvironmentVariable("NODE_ENV", "production", "Process")
  Start-Process -FilePath $node -ArgumentList "`"$indexCjs`"" -WorkingDirectory $InstallRoot -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-PortListening $appPort) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-PortListening $appPort)) {
    [System.Windows.Forms.MessageBox]::Show("App did not start on port $appPort.", "DocuCapture", "OK", "Error") | Out-Null
    exit 1
  }
}

Start-Sleep -Milliseconds 600
Start-Process "http://localhost:$appPort/"
