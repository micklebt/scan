$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$LaunchScript = Join-Path $PSScriptRoot "DocuCapture-Launch.ps1"
$pwsh = "C:\Program Files\PowerShell\7\pwsh.exe"
if (-not (Test-Path $pwsh)) {
  $pwsh = (Get-Command pwsh -ErrorAction Stop).Source
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "DocuCapture.lnk"
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($shortcutPath)
$sc.TargetPath = $pwsh
$sc.Arguments = "-ExecutionPolicy Bypass -File `"$LaunchScript`""
$sc.WorkingDirectory = $ProjectRoot
$sc.WindowStyle = 7
$sc.Description = "DocuCapture Pro"
$sc.Save()
Write-Output "Created: $shortcutPath"
