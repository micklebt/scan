# DocuCapture Pro

A full-stack workstation document scanning application for capturing, managing, and saving business documents as PDFs.

## Architecture

- **Frontend**: React + Vite + Tailwind CSS v4 + shadcn/ui components
- **Backend**: Express.js (Node.js/TypeScript)
- **Database**: PostgreSQL with Drizzle ORM
- **PDF Generation**: pdf-lib
- **File Upload**: multer
- **Routing**: wouter (frontend), Express (backend)

## Key Features

- Scanner configuration management (network scanners via IP)
- Document capture simulation with page preview
- 3of9 barcode detection for automatic file naming
- Sequential numbering fallback when no barcode detected
- PDF generation from scanned images
- Output file management (search, download, delete)
- Configurable save path (default: f:\scan-images\)

## Project Structure

```
client/src/
  pages/
    CaptureStation.tsx  - Main scanning interface
    Configuration.tsx   - Scanner & settings management
    OutputManager.tsx    - File browser for saved PDFs
  lib/
    api.ts              - API request helper
    queryClient.ts      - TanStack Query client
  App.tsx               - Router with sidebar navigation

server/
  index.ts              - Express server entry
  routes.ts             - API routes (/api/*)
  storage.ts            - Database storage interface
  db.ts                 - Drizzle/PostgreSQL connection

shared/
  schema.ts             - Database schema (scannerConfigs, appSettings, scanJobs)
```

## API Endpoints

- `GET/POST /api/scanners` - Scanner CRUD
- `PATCH/DELETE /api/scanners/:id` - Scanner update/delete
- `GET/PATCH /api/settings` - App settings
- `GET /api/settings/next-seq` - Next sequence number
- `POST /api/scan` - Create scan job (multipart upload)
- `GET /api/jobs` - List scan jobs (with ?search= filter)
- `DELETE /api/jobs/:id` - Delete scan job + file
- `GET /api/jobs/:id/download` - Download PDF

## Hardware Config

- Scanner: Sharp MX-M503N at 192.168.1.234
- Paper: 8.5x11" Letter from sheet feeder
- Duplex: Optional
- Save path: f:\scan-images\
