import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScannerConfigSchema, insertAppSettingsSchema } from "@shared/schema";
import { PDFDocument } from "pdf-lib";
import multer from "multer";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "scan-output");
const HELP_DIR = path.join(process.cwd(), "help");
const HELP_CHM_PATH = path.join(HELP_DIR, "DocuCapture-Help.chm");
const HELP_INDEX_PATH = path.join(HELP_DIR, "chm", "index.htm");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });
const execAsync = promisify(exec);
const CODE39_B_PATTERN = /\bB\d{4}\b/i;

function isHelperConfigured() {
  return Boolean(process.env.TWAIN_HELPER_WATCH_DIR);
}

function hasScannerHost() {
  return Boolean(process.env.SCANNER_HOST_URL);
}

async function getScannerHostStatus() {
  if (!hasScannerHost()) {
    return { ok: false as const, message: "SCANNER_HOST_URL is not configured", scannerName: null as string | null };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${process.env.SCANNER_HOST_URL}/status`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false as const, message: `Scanner host unavailable (${response.status})`, scannerName: null as string | null };
    }
    const body = (await response.json()) as { ready?: boolean; message?: string; scannerName?: string };
    return {
      ok: Boolean(body.ready),
      message: body.message || (body.ready ? "Scanner host ready" : "Scanner host not ready"),
      scannerName: body.scannerName || null,
    };
  } catch {
    return { ok: false as const, message: "Scanner host is unreachable", scannerName: null as string | null };
  } finally {
    clearTimeout(timeout);
  }
}

function resolveNoCodeFileName(seqNum: number) {
  return `no-code-${seqNum.toString().padStart(2, "0")}.pdf`;
}

function ensureSaveToTargetDirectory(sourcePath: string, fileName: string, savePath: string) {
  const targetDir = savePath || "f:\\scan-images\\";
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const targetPath = path.join(targetDir, fileName);
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

type BarcodeMarker = { page: number; code: string };

async function detectCode39FromPdf(pdfPath: string) {
  const configuredTemplate = process.env.BARCODE_READ_COMMAND;
  const defaultScript = path.join(process.cwd(), "server", "read-code39.py");
  const fallbackTemplate = `python "${defaultScript}" "{input}"`;
  const commandTemplate = configuredTemplate || fallbackTemplate;

  try {
    const command = commandTemplate.replaceAll("{input}", pdfPath);
    const { stdout, stderr } = await execAsync(command, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    });
    const output = `${stdout || ""}\n${stderr || ""}`;
    const match = output.match(CODE39_B_PATTERN);
    return match ? match[0].toUpperCase() : null;
  } catch {
    return null;
  }
}

async function detectAllCode39FromPdf(pdfPath: string): Promise<BarcodeMarker[]> {
  const defaultScript = path.join(process.cwd(), "server", "read-code39.py");
  const command = `python "${defaultScript}" "${pdfPath}" --all`;
  try {
    const { stdout } = await execAsync(command, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    });
    const parsed = JSON.parse((stdout || "[]").trim()) as Array<{ page?: number; code?: string }>;
    return parsed
      .filter((item) => typeof item.page === "number" && typeof item.code === "string")
      .map((item) => ({ page: Number(item.page), code: String(item.code).toUpperCase() }))
      .filter((item) => CODE39_B_PATTERN.test(item.code))
      .sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/help", async (_req, res) => {
    if (fs.existsSync(HELP_CHM_PATH)) {
      return res.download(HELP_CHM_PATH, "DocuCapture-Help.chm");
    }
    if (fs.existsSync(HELP_INDEX_PATH)) {
      return res.sendFile(HELP_INDEX_PATH);
    }
    return res.status(404).json({ message: "Help file not found" });
  });

  app.get("/api/scanner/status", async (_req, res) => {
    const hostStatus = await getScannerHostStatus();
    const hasCommand = Boolean(process.env.TWAIN_SCAN_COMMAND);
    const helperConfigured = isHelperConfigured();
    const hasBarcodeReader = true;
    const scannerName = hostStatus.scannerName || process.env.TWAIN_SCANNER_NAME || null;
    const ready = hostStatus.ok || hasCommand || helperConfigured;

    let message = hostStatus.message;
    if (!hostStatus.ok) {
      if (hasCommand) {
        message = "TWAIN command configured";
      } else if (helperConfigured) {
        message = "TWAIN helper configured";
      } else if (!hasScannerHost()) {
        message = "SCANNER_HOST_URL is not configured";
      }
    }

    res.json({
      mode: hostStatus.ok ? "scanner-host" : "twain",
      ready,
      scannerName,
      barcodeMode: hasBarcodeReader ? "command" : "none",
      message,
    });
  });

  // ── Scanner Configs ────────────────────────────────────
  app.get("/api/scanners", async (_req, res) => {
    const scanners = await storage.getScannerConfigs();
    res.json(scanners);
  });

  app.post("/api/scanners", async (req, res) => {
    const parsed = insertScannerConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.message });
    }
    const scanner = await storage.createScannerConfig(parsed.data);
    res.status(201).json(scanner);
  });

  app.patch("/api/scanners/:id", async (req, res) => {
    const updated = await storage.updateScannerConfig(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Scanner not found" });
    res.json(updated);
  });

  app.delete("/api/scanners/:id", async (req, res) => {
    const deleted = await storage.deleteScannerConfig(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Scanner not found" });
    res.status(204).send();
  });

  // ── App Settings ───────────────────────────────────────
  app.get("/api/settings", async (_req, res) => {
    const settings = await storage.getAppSettings();
    res.json(settings);
  });

  app.patch("/api/settings", async (req, res) => {
    const updated = await storage.updateAppSettings(req.body);
    res.json(updated);
  });

  // ── Scan Jobs ──────────────────────────────────────────
  app.get("/api/jobs", async (req, res) => {
    const search = req.query.search as string | undefined;
    const jobs = await storage.getScanJobs(search);
    res.json(jobs);
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getScanJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    const job = await storage.getScanJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    // Delete the file from disk
    const filePath = path.join(OUTPUT_DIR, job.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await storage.deleteScanJob(req.params.id);
    res.status(204).send();
  });

  // ── Simulate Scan (accepts uploaded images) ────────────
  app.post("/api/scan", upload.array("pages"), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const { barcodeValue, scannerName, dpi, colorMode, duplex } = req.body;

      const settings = await storage.getAppSettings();

      let fileName: string;
      if (barcodeValue) {
        fileName = `${barcodeValue}.pdf`;
      } else {
        const seqNum = settings.lastSeqNumber;
        fileName = `SCAN_${seqNum.toString().padStart(4, "0")}.pdf`;
        await storage.incrementSeqNumber();
      }

      // Create PDF from uploaded images
      const pdfDoc = await PDFDocument.create();

      if (files && files.length > 0) {
        for (const file of files) {
          const imageBytes = fs.readFileSync(file.path);
          let image;
          if (file.mimetype === "image/png") {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            image = await pdfDoc.embedJpg(imageBytes);
          }
          const page = pdfDoc.addPage([612, 792]); // letter size in points
          const { width, height } = page.getSize();
          const scale = Math.min(width / image.width, height / image.height);
          page.drawImage(image, {
            x: (width - image.width * scale) / 2,
            y: (height - image.height * scale) / 2,
            width: image.width * scale,
            height: image.height * scale,
          });
          // Clean up temp file
          fs.unlinkSync(file.path);
        }
      } else {
        // No files uploaded - create a blank page as placeholder
        pdfDoc.addPage([612, 792]);
      }

      const pdfBytes = await pdfDoc.save();
      const outputPath = path.join(OUTPUT_DIR, fileName);
      fs.writeFileSync(outputPath, pdfBytes);
      ensureSaveToTargetDirectory(outputPath, fileName, settings.savePath);

      const job = await storage.createScanJob({
        fileName,
        filePath: `${settings.savePath}${fileName}`,
        pageCount: pdfDoc.getPageCount(),
        fileSize: pdfBytes.length,
        barcodeValue: barcodeValue || null,
        scannerName: scannerName || "Sharp MX-M503N",
        dpi: dpi || "300",
        colorMode: colorMode || "color",
        duplex: duplex === "true",
      });

      res.status(201).json(job);
    } catch (error: any) {
      console.error("Scan error:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/scan/real", async (req, res) => {
    try {
      const { barcodeValue, scannerName, dpi, colorMode, duplex, paperSize, source } = req.body || {};
      const commandTemplate = process.env.TWAIN_SCAN_COMMAND;
      const helperConfigured = isHelperConfigured();
      const scannerHostUrl = process.env.SCANNER_HOST_URL;

      if (!scannerHostUrl && !commandTemplate && !helperConfigured) {
        return res
          .status(503)
          .json({ message: "SCANNER_HOST_URL, TWAIN_SCAN_COMMAND, or TWAIN_HELPER_WATCH_DIR is not configured" });
      }

      const settings = await storage.getAppSettings();
      const resolvedScannerName =
        scannerName || process.env.TWAIN_SCANNER_NAME || "Sharp MX-M503N";
      const scanTempPath = path.join(OUTPUT_DIR, `scan-temp-${Date.now()}.pdf`);

      if (scannerHostUrl) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180000);
        try {
          const hostResponse = await fetch(`${scannerHostUrl}/scan`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              outputPath: scanTempPath,
              scannerName: resolvedScannerName,
              dpi: String(dpi || settings.defaultDpi || "300"),
              colorMode: String(colorMode || settings.defaultColorMode || "color"),
              duplex: duplex === true || duplex === "true",
              paperSize: String(paperSize || settings.defaultPaperSize || "letter"),
              source: String(source || settings.defaultSource || "feeder"),
            }),
          });

          if (!hostResponse.ok) {
            const text = await hostResponse.text();
            return res.status(500).json({ message: text || `Scanner host failed (${hostResponse.status})` });
          }
        } finally {
          clearTimeout(timeout);
        }
      } else if (commandTemplate) {
        const command = commandTemplate
          .replaceAll("{output}", scanTempPath)
          .replaceAll("{scanner}", resolvedScannerName)
          .replaceAll("{dpi}", String(dpi || settings.defaultDpi || "300"))
          .replaceAll("{colorMode}", String(colorMode || settings.defaultColorMode || "color"))
          .replaceAll("{duplex}", String(duplex === true || duplex === "true"))
          .replaceAll("{paperSize}", String(paperSize || settings.defaultPaperSize || "letter"))
          .replaceAll("{source}", String(source || settings.defaultSource || "feeder"));

        await execAsync(command, { windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
      } else {
        const helperScript = path.join(process.cwd(), "server", "twain-helper.ps1");
        const watchDir = process.env.TWAIN_HELPER_WATCH_DIR as string;
        const exePath = process.env.TWAIN_HELPER_EXE || "";
        const windowTitle = process.env.TWAIN_HELPER_WINDOW_TITLE || "PaperScan";
        const scanKeys = process.env.TWAIN_HELPER_SCAN_KEYS || "{F9}";
        const filePattern = process.env.TWAIN_HELPER_FILE_PATTERN || "*.pdf";
        const timeoutMs = Number(process.env.TWAIN_HELPER_TIMEOUT_MS || "120000");

        const helperCommand = `powershell -ExecutionPolicy Bypass -File "${helperScript}" -OutputPath "${scanTempPath}" -WatchDir "${watchDir}" -ExePath "${exePath}" -WindowTitle "${windowTitle}" -ScanKeys "${scanKeys}" -FilePattern "${filePattern}" -TimeoutMs ${timeoutMs}`;
        await execAsync(helperCommand, { windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
      }

      if (!fs.existsSync(scanTempPath)) {
        return res.status(500).json({ message: "Scanner command completed but output file was not created" });
      }

      const pdfBytes = fs.readFileSync(scanTempPath);
      const sourcePdf = await PDFDocument.load(pdfBytes);
      const totalPages = sourcePdf.getPageCount();
      const markersFromScan = await detectAllCode39FromPdf(scanTempPath);

      let markers = markersFromScan;
      if (typeof barcodeValue === "string" && CODE39_B_PATTERN.test(barcodeValue)) {
        const valueMatch = barcodeValue.match(CODE39_B_PATTERN);
        const code = valueMatch ? valueMatch[0].toUpperCase() : null;
        if (code) markers = [{ page: 0, code }];
      } else if (markers.length === 0) {
        const single = await detectCode39FromPdf(scanTempPath);
        if (single) markers = [{ page: 0, code: single }];
      }

      const jobs = [];
      const sortedMarkers = markers
        .filter((m) => m.page >= 0 && m.page < totalPages)
        .sort((a, b) => a.page - b.page);

      const segmentStarts: Array<{ start: number; code: string | null }> = [];
      if (sortedMarkers.length === 0 || sortedMarkers[0].page > 0) {
        segmentStarts.push({ start: 0, code: null });
      }
      for (const marker of sortedMarkers) {
        segmentStarts.push({ start: marker.page, code: marker.code });
      }

      let currentSeq = settings.lastSeqNumber;
      let usedNoCode = 0;

      for (let i = 0; i < segmentStarts.length; i++) {
        const segment = segmentStarts[i];
        const start = segment.start;
        const end = i + 1 < segmentStarts.length ? segmentStarts[i + 1].start : totalPages;
        if (end <= start) continue;

        const segmentPdf = await PDFDocument.create();
        const pages = await segmentPdf.copyPages(
          sourcePdf,
          Array.from({ length: end - start }, (_, idx) => start + idx),
        );
        for (const page of pages) segmentPdf.addPage(page);

        const fileName = segment.code ? `${segment.code}.pdf` : resolveNoCodeFileName(currentSeq);
        if (!segment.code) {
          currentSeq += 1;
          usedNoCode += 1;
        }

        const outputPath = path.join(OUTPUT_DIR, fileName);
        const segmentBytes = await segmentPdf.save();
        fs.writeFileSync(outputPath, segmentBytes);
        ensureSaveToTargetDirectory(outputPath, fileName, settings.savePath);

        const stats = fs.statSync(outputPath);
        const job = await storage.createScanJob({
          fileName,
          filePath: `${settings.savePath}${fileName}`,
          pageCount: segmentPdf.getPageCount(),
          fileSize: Number(stats.size),
          barcodeValue: segment.code,
          scannerName: resolvedScannerName,
          dpi: String(dpi || settings.defaultDpi || "300"),
          colorMode: String(colorMode || settings.defaultColorMode || "color"),
          duplex: duplex === true || duplex === "true",
        });
        jobs.push(job);
      }

      for (let i = 0; i < usedNoCode; i++) {
        await storage.incrementSeqNumber();
      }

      fs.unlinkSync(scanTempPath);
      res.status(201).json({ jobs });
    } catch (error: any) {
      res.status(500).json({ message: error?.message || "Scanner capture failed" });
    }
  });

  // ── Download PDF ───────────────────────────────────────
  app.get("/api/jobs/:id/download", async (req, res) => {
    const job = await storage.getScanJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const filePath = path.join(OUTPUT_DIR, job.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found on disk" });
    }

    res.download(filePath, job.fileName);
  });

  app.get("/api/jobs/:id/page/:pageNum", async (req, res) => {
    const job = await storage.getScanJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const filePath = path.join(OUTPUT_DIR, job.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found on disk" });
    }

    const pageNum = Number(req.params.pageNum);
    if (!Number.isFinite(pageNum) || pageNum < 1) {
      return res.status(400).json({ message: "Invalid page number" });
    }

    const width = req.query.thumb === "1" ? 240 : 1200;
    const previewPath = path.join(UPLOAD_DIR, `preview-${job.id}-${pageNum}-${Date.now()}.png`);
    const renderScript = path.join(process.cwd(), "server", "render-pdf-page.py");
    const renderCommand = `python "${renderScript}" "${filePath}" ${pageNum} "${previewPath}" ${width}`;

    try {
      await execAsync(renderCommand, { windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
      if (!fs.existsSync(previewPath)) {
        return res.status(404).json({ message: "Page not found in document" });
      }
      res.sendFile(previewPath, () => {
        if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
      });
    } catch {
      if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
      return res.status(400).json({ message: "Failed to render page preview" });
    }
  });

  // ── Next Sequence Number ───────────────────────────────
  app.get("/api/settings/next-seq", async (_req, res) => {
    const settings = await storage.getAppSettings();
    res.json({ nextSeq: settings.lastSeqNumber });
  });

  return httpServer;
}
