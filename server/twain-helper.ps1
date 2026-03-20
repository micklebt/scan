param(
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$WatchDir,
  [string]$ExePath = "",
  [string]$WindowTitle = "PaperScan",
  [string]$ScanKeys = "{F9}",
  [string]$FilePattern = "*.pdf",
  [int]$TimeoutMs = 120000
)

if (-not (Test-Path $WatchDir)) {
  throw "Watch directory does not exist: $WatchDir"
}

$before = Get-ChildItem -Path $WatchDir -File -Filter $FilePattern -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$beforeTime = if ($before) { $before.LastWriteTimeUtc } else { [DateTime]::MinValue }

if ($ExePath -and (Test-Path $ExePath)) {
  Start-Process -FilePath $ExePath | Out-Null
  Start-Sleep -Milliseconds 1200
}

$shell = New-Object -ComObject WScript.Shell
$activated = $shell.AppActivate($WindowTitle)
if (-not $activated) {
  throw "Could not activate scanner window: $WindowTitle"
}

Start-Sleep -Milliseconds 400
$shell.SendKeys($ScanKeys)

$deadline = (Get-Date).AddMilliseconds($TimeoutMs)
$found = $null
while ((Get-Date) -lt $deadline) {
  $candidate = Get-ChildItem -Path $WatchDir -File -Filter $FilePattern -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($candidate -and $candidate.LastWriteTimeUtc -gt $beforeTime) {
    $found = $candidate
    break
  }

  Start-Sleep -Milliseconds 800
}

if (-not $found) {
  throw "No new scan file detected in $WatchDir within timeout"
}

Copy-Item -Path $found.FullName -Destination $OutputPath -Force
Write-Output $OutputPath
