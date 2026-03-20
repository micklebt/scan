# DocuCapture MSI

## Output
- `release/DocuCapture-Setup.msi`

## Build machine
- Node.js and npm
- WiX Toolset v6 CLI (`wix.exe`, often under `C:\Program Files\WiX Toolset v6.0\bin\`)
- PowerShell 7 (`pwsh`) for `script/build-msi.ps1`
- Optional: HTML Help Workshop for CHM (`npm run build:help`); MSI build skips CHM if missing

## Build
```
npm install
npm run build:msi
```

## Installed PC (runtime)
- Node.js LTS on PATH (for `node` used by `Installed-Launch.ps1`)
- PowerShell 7 (`pwsh`) and Windows PowerShell path fallbacks in `Installed-Launch.cmd`
- PostgreSQL reachable; edit `docucapture.env` under the install folder after first install if needed (`NeverOverwrite` preserves your file on upgrade)
- Python with `pymupdf` and `zxing-cpp` for barcode and page preview scripts
- NAPS2 (or adjust `SCANNER_HOST_SCAN_COMMAND` in `docucapture.env`)

## Use after install
- Start Menu: **DocuCapture** (runs `Installed-Launch.cmd`: scanner host + app + browser)
