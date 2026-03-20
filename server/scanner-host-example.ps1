param(
  [int]$Port = 9787
)

$scanCommandTemplate = $env:SCANNER_HOST_SCAN_COMMAND
$twainDeviceName = if ($env:SCANNER_TWAIN_DEVICE) { $env:SCANNER_TWAIN_DEVICE } else { "SHARP MFP TWAIN K" }
$statusMessage = if ($scanCommandTemplate) { "Scanner host running (command mode)" } else { "Scanner host running (sample mode)" }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Scanner host listening at http://localhost:$Port/"
$scanInProgress = $false

function Stop-ScannerPopupProcesses {
  $names = @("NAPS2.Worker", "NetworkScannerTool")
  foreach ($name in $names) {
    try {
      Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.MainWindowTitle -match "Select Device" -or $name -eq "NetworkScannerTool") {
          Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
        }
      }
    } catch {}
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    if ($request.Url.AbsolutePath -eq "/status" -and $request.HttpMethod -eq "GET") {
      $payload = @{ ready = $true; message = $statusMessage; scannerName = $twainDeviceName } | ConvertTo-Json
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
      $response.ContentType = "application/json"
      $response.StatusCode = 200
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      $response.Close()
      continue
    }

    if ($request.Url.AbsolutePath -eq "/scan" -and $request.HttpMethod -eq "POST") {
      if ($scanInProgress) {
        $response.StatusCode = 409
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("Scan already in progress. Wait for current scan to finish.")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
        continue
      }

      $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
      $json = $reader.ReadToEnd()
      $reader.Close()
      $body = $json | ConvertFrom-Json

      if (-not $body.outputPath) {
        $response.StatusCode = 400
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("outputPath is required")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.Close()
        continue
      }

      $scanInProgress = $true
      try {
        # Clear stale scanner clients that frequently hold TWAIN handles.
        taskkill /IM NAPS2.exe /F *> $null
        taskkill /IM NAPS2.Console.exe /F *> $null
        taskkill /IM NAPS2.Worker.exe /F *> $null
        taskkill /IM NetworkScannerTool.exe /F *> $null
        Start-Sleep -Milliseconds 1200

        if ($scanCommandTemplate) {
          $scanCommand = $scanCommandTemplate
          $scanCommand = $scanCommand.Replace("{output}", $body.outputPath)
          $scanCommand = $scanCommand.Replace("{scanner}", $twainDeviceName)
          if ($body.dpi) { $scanCommand = $scanCommand.Replace("{dpi}", [string]$body.dpi) }
          if ($body.colorMode) {
            $bitDepth = [string]$body.colorMode
            if ($bitDepth -eq "grayscale") { $bitDepth = "gray" }
            $scanCommand = $scanCommand.Replace("{colorMode}", $bitDepth)
          }
          if ($null -ne $body.duplex) { $scanCommand = $scanCommand.Replace("{duplex}", [string]$body.duplex) }
          if ($body.paperSize) { $scanCommand = $scanCommand.Replace("{paperSize}", [string]$body.paperSize) }
          if ($body.source) {
            $source = [string]$body.source
            if ($source -eq "flatbed") { $source = "glass" }
            $scanCommand = $scanCommand.Replace("{source}", $source)
          }
          if ($scanCommand -match "\{[a-zA-Z][^}]*\}") {
            $response.StatusCode = 500
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("Unresolved scan command placeholders. Check SCANNER_HOST_SCAN_COMMAND.")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
          }
          if ($scanCommand -notmatch "(^|\s)--driver(\s|=)") { $scanCommand += " --driver twain" }
          if ($scanCommand -notmatch "(^|\s)--device(\s|=)") { $scanCommand += " --device `"$twainDeviceName`"" }
          if ($scanCommand -notmatch "(^|\s)--noprofile(\s|$)") { $scanCommand += " --noprofile" }
          if ($scanCommand -notmatch "(^|\s)-f(\s|$)") { $scanCommand += " -f" }
          $popupKiller = Start-Job -ScriptBlock {
            while ($true) {
              try {
                Get-Process -Name "NAPS2.Worker" -ErrorAction SilentlyContinue | ForEach-Object {
                  if ($_.MainWindowTitle -match "Select Device") {
                    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
                  }
                }
                Get-Process -Name "NetworkScannerTool" -ErrorAction SilentlyContinue | ForEach-Object {
                  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
                }
              } catch {}
              Start-Sleep -Milliseconds 400
            }
          }
          try {
            $scanResult = Invoke-Expression "& $scanCommand" 2>&1
          } finally {
            Stop-Job -Id $popupKiller.Id -Force -ErrorAction SilentlyContinue
            Remove-Job -Id $popupKiller.Id -Force -ErrorAction SilentlyContinue
            Stop-ScannerPopupProcesses
          }
          if (-not (Test-Path $body.outputPath)) {
            $response.StatusCode = 500
            $detail = ($scanResult | Out-String).Trim()
            if (-not $detail) { $detail = "Scan command completed without creating output file" }
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($detail)
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
          }
        } else {
          $samplePath = Join-Path (Split-Path -Parent $PSCommandPath) "sample-scan.pdf"
          if (-not (Test-Path $samplePath)) {
            $fallbackPath = Join-Path (Split-Path -Parent $PSCommandPath) "..\\scan-output\\B7492.pdf"
            if (Test-Path $fallbackPath) {
              $samplePath = $fallbackPath
            }
          }
          if (-not (Test-Path $samplePath)) {
            $response.StatusCode = 500
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("No sample PDF found for example host")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.Close()
            continue
          }

          Copy-Item -Path $samplePath -Destination $body.outputPath -Force
        }
      } finally {
        $scanInProgress = $false
      }
      $response.StatusCode = 200
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("ok")
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      $response.Close()
      continue
    }

    $response.StatusCode = 404
    $response.Close()
  }
}
finally {
  $listener.Stop()
}
