param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot
)

$ErrorActionPreference = "Stop"
$publicRoot = Join-Path $ProjectRoot "dist\public"
$outFile = Join-Path $ProjectRoot "installer\wix\Generated.wxs"

if (-not (Test-Path $publicRoot)) {
  throw "dist\public not found. Run npm run build first."
}

function New-StableGuid([string]$seed) {
  $md5 = [System.Security.Cryptography.MD5]::Create()
  $bytes = $md5.ComputeHash([Text.Encoding]::UTF8.GetBytes("DocuCapture|$seed"))
  $bytes[6] = ($bytes[6] -band 0x0f) -bor 0x40
  $bytes[8] = ($bytes[8] -band 0x3f) -bor 0x80
  $b16 = New-Object byte[] 16
  [Array]::Copy($bytes, $b16, 16)
  return [guid]::new($b16).ToString("B").ToUpper()
}

function New-DirId([string]$rel) {
  $h = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($rel))
  return "D_" + ([BitConverter]::ToString($h[0..5]) -replace "-", "")
}

function New-FileId([string]$rel) {
  $h = [System.Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($rel))
  return "F_" + ([BitConverter]::ToString($h[0..7]) -replace "-", "")
}

$componentIds = New-Object System.Collections.Generic.List[string]
$xml = New-Object System.Collections.Generic.List[string]
[void]$xml.Add('<?xml version="1.0" encoding="utf-8"?>')
[void]$xml.Add('<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs">')
[void]$xml.Add('  <Fragment>')
[void]$xml.Add('    <DirectoryRef Id="INSTALLFOLDER">')

function Emit-PublicTree([string]$DirPath, [int]$Depth) {
  $relFromPublic = $DirPath.Substring($publicRoot.Length).TrimStart('\')
  if ($DirPath -eq $publicRoot) {
    $dirId = "D_public"
    $dirName = "public"
  } else {
    $dirId = New-DirId $relFromPublic
    $dirName = Split-Path $DirPath -Leaf
  }

  $pad = "      " + ("  " * $Depth)
  [void]$xml.Add("$pad<Directory Id=`"$dirId`" Name=`"$dirName`">")

  Get-ChildItem -LiteralPath $DirPath -File | Sort-Object Name | ForEach-Object {
    $relFile = $_.FullName.Substring($ProjectRoot.Length + 1).Replace('/', '\')
    $fid = New-FileId $relFile
    $guid = New-StableGuid $relFile
    [void]$componentIds.Add("cmp_$fid")
    [void]$xml.Add("$pad  <Component Id=`"cmp_$fid`" Guid=`"$guid`">")
    [void]$xml.Add("$pad    <File Id=`"fil_$fid`" Source=`"$relFile`" KeyPath=`"yes`" />")
    [void]$xml.Add("$pad  </Component>")
  }

  Get-ChildItem -LiteralPath $DirPath -Directory | Sort-Object Name | ForEach-Object {
    Emit-PublicTree $_.FullName ($Depth + 1)
  }

  [void]$xml.Add("$pad</Directory>")
}

Emit-PublicTree $publicRoot 0

[void]$xml.Add('      <Directory Id="D_server" Name="server">')
$serverFiles = @(
  "server\scanner-host-example.ps1",
  "server\read-code39.py",
  "server\render-pdf-page.py"
)
foreach ($rel in $serverFiles) {
  $full = Join-Path $ProjectRoot $rel
  if (-not (Test-Path $full)) { throw "Missing $rel" }
  $fid = New-FileId $rel
  $guid = New-StableGuid $rel
  [void]$componentIds.Add("cmp_$fid")
  [void]$xml.Add("        <Component Id=`"cmp_$fid`" Guid=`"$guid`">")
  [void]$xml.Add("          <File Id=`"fil_$fid`" Source=`"$rel`" KeyPath=`"yes`" />")
  [void]$xml.Add("        </Component>")
}
[void]$xml.Add('      </Directory>')

$pkgFiles = @(
  @{ Rel = "dist\index.cjs"; Id = "maincjs"; Never = $false },
  @{ Rel = "installer\package\docucapture.env"; Id = "envfile"; Never = $true },
  @{ Rel = "installer\package\Installed-Launch.ps1"; Id = "launchps1"; Never = $false },
  @{ Rel = "installer\package\Installed-Launch.cmd"; Id = "launchcmd"; Never = $false }
)
foreach ($item in $pkgFiles) {
  $rel = $item.Rel
  $full = Join-Path $ProjectRoot $rel
  if (-not (Test-Path $full)) { throw "Missing $rel" }
  $guid = New-StableGuid $rel
  $never = if ($item.Never) { ' NeverOverwrite="yes"' } else { "" }
  [void]$componentIds.Add("cmp_$($item.Id)")
  [void]$xml.Add("      <Component Id=`"cmp_$($item.Id)`" Guid=`"$guid`"$never>")
  [void]$xml.Add("        <File Id=`"fil_$($item.Id)`" Source=`"$rel`" KeyPath=`"yes`" />")
  [void]$xml.Add("      </Component>")
}

[void]$xml.Add('    </DirectoryRef>')
[void]$xml.Add('  </Fragment>')
[void]$xml.Add('  <Fragment>')
[void]$xml.Add('    <ComponentGroup Id="GeneratedGroup">')
foreach ($cid in $componentIds) {
  [void]$xml.Add("      <ComponentRef Id=`"$cid`" />")
}
[void]$xml.Add('    </ComponentGroup>')
[void]$xml.Add('  </Fragment>')
[void]$xml.Add('</Wix>')

$dir = Split-Path $outFile -Parent
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Set-Content -LiteralPath $outFile -Value ($xml -join "`r`n") -Encoding UTF8
Write-Output "Wrote $outFile"
