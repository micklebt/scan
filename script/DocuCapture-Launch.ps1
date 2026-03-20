$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$ConfigPath = Join-Path $PSScriptRoot "launcher.config.ps1"
$ExamplePath = Join-Path $PSScriptRoot "launcher.config.ps1.example"

if (-not (Test-Path $ExamplePath)) {
  [System.Windows.Forms.MessageBox]::Show(
    "Missing launcher.config.ps1.example in script folder.",
    "DocuCapture",
    "OK",
    "Error"
  ) | Out-Null
  exit 1
}

. $ExamplePath

if (Test-Path $ConfigPath) {
  . $ConfigPath
}

function Read-EnvValue([string]$file, [string]$key) {
  if (-not (Test-Path $file)) { return $null }
  foreach ($line in Get-Content -LiteralPath $file) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith("#")) { continue }
    if ($t -match "^\s*$key\s*=\s*(.*)$") {
      $v = $matches[1].Trim()
      if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) {
        $v = $v.Substring(1, $v.Length - 2) -replace '\\"', '"'
      }
      return $v
    }
  }
  return $null
}

if ([string]::IsNullOrWhiteSpace($LauncherDatabaseUrl)) {
  $LauncherDatabaseUrl = Read-EnvValue (Join-Path $ProjectRoot "docucapture.env") "DATABASE_URL"
}
if ([string]::IsNullOrWhiteSpace($LauncherDatabaseUrl)) {
  $LauncherDatabaseUrl = Read-EnvValue (Join-Path $ProjectRoot ".env") "DATABASE_URL"
}
if ([string]::IsNullOrWhiteSpace($LauncherDatabaseUrl)) {
  $LauncherDatabaseUrl = "postgresql://postgres@localhost:5432/docucapture"
}

if (-not $LauncherScannerHostPort) {
  $LauncherScannerHostPort = 9803
}

if ([string]::IsNullOrWhiteSpace($LauncherScannerHostUrl)) {
  $LauncherScannerHostUrl = "http://localhost:$LauncherScannerHostPort"
}

if (-not $LauncherAppPort) {
  $LauncherAppPort = 5003
}

if ([string]::IsNullOrWhiteSpace($LauncherTwainDevice)) {
  $LauncherTwainDevice = "SHARP MFP TWAIN K"
}

if ([string]::IsNullOrWhiteSpace($LauncherScannerScanCommand)) {
  $LauncherScannerScanCommand = '"C:\Program Files\NAPS2\NAPS2.Console.exe" -o "{output}" --noprofile --driver twain --device "{scanner}" --source {source} --dpi {dpi} --pagesize {paperSize} --bitdepth {colorMode} -f -v'
}

function Test-PortListening([int]$Port) {
  $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$c
}

$pwsh = "C:\Program Files\PowerShell\7\pwsh.exe"
if (-not (Test-Path $pwsh)) {
  $pwsh = "pwsh.exe"
}

$env:DATABASE_URL = $LauncherDatabaseUrl
$env:SCANNER_HOST_URL = $LauncherScannerHostUrl
$env:PORT = "$LauncherAppPort"
$env:SCANNER_TWAIN_DEVICE = $LauncherTwainDevice
$env:SCANNER_HOST_SCAN_COMMAND = $LauncherScannerScanCommand

$scannerScript = Join-Path $ProjectRoot "server\scanner-host-example.ps1"

if (-not (Test-Path $scannerScript)) {
  [System.Windows.Forms.MessageBox]::Show("Scanner host script not found: $scannerScript", "DocuCapture", "OK", "Error") | Out-Null
  exit 1
}

if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
  [System.Windows.Forms.MessageBox]::Show("package.json not found under: $ProjectRoot", "DocuCapture", "OK", "Error") | Out-Null
  exit 1
}

if (-not (Test-PortListening $LauncherScannerHostPort)) {
  Start-Process -FilePath $pwsh -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $scannerScript,
    "-Port", "$LauncherScannerHostPort"
  ) -WorkingDirectory $ProjectRoot -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-PortListening $LauncherScannerHostPort) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
  }
  if (-not (Test-PortListening $LauncherScannerHostPort)) {
    [System.Windows.Forms.MessageBox]::Show("Scanner host did not start on port $LauncherScannerHostPort.", "DocuCapture", "OK", "Error") | Out-Null
    exit 1
  }
}

if (-not (Test-PortListening $LauncherAppPort)) {
  $npmCmd = "Set-Location `"$ProjectRoot`"; `$env:DATABASE_URL=`"$LauncherDatabaseUrl`"; `$env:SCANNER_HOST_URL=`"$LauncherScannerHostUrl`"; `$env:PORT=`"$LauncherAppPort`"; npm run dev"
  Start-Process -FilePath $pwsh -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $npmCmd) -WorkingDirectory $ProjectRoot -WindowStyle Minimized
  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-PortListening $LauncherAppPort) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
  }
  if (-not (Test-PortListening $LauncherAppPort)) {
    [System.Windows.Forms.MessageBox]::Show("App server did not start on port $LauncherAppPort.", "DocuCapture", "OK", "Error") | Out-Null
    exit 1
  }
}

Start-Sleep -Milliseconds 600
Start-Process "http://localhost:$LauncherAppPort/"
