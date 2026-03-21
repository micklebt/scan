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

function resolveServerScript(scriptName: string) {
  const direct = path.join(process.cwd(), scriptName);
  if (fs.existsSync(direct)) return direct;
  return path.join(process.cwd(), "server", scriptName);
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const sliced = text.slice(start, end + 1);
        const parsed = JSON.parse(sliced);
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

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
type ExtractedMetadata = {
  docDate: string | null;
  customerName: string | null;
  accountNumber: string | null;
  totalAmount: string | null;
  notes: string | null;
  approved?: boolean;
};

function summarizeNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  const cleaned = notes.replace(/[^\w\s/$.-]/g, " ");
  const lower = cleaned.toLowerCase();
  const interestingPatterns: Array<{ label: string; regex: RegExp }> = [
    { label: "invoice", regex: /\binvoice\b/i },
    { label: "statement", regex: /\bstatement\b/i },
    { label: "bill", regex: /\bbill\b/i },
    { label: "payment due", regex: /\bpayment\s+due\b/i },
    { label: "amount due", regex: /\bamount\s+due\b/i },
    { label: "balance due", regex: /\bbalance\s+due\b/i },
    { label: "loan", regex: /\bloan\b/i },
    { label: "account", regex: /\baccount\b/i },
  ];

  const selected: string[] = [];
  for (const item of interestingPatterns) {
    if (item.regex.test(lower)) selected.push(item.label);
    if (selected.length >= 3) break;
  }

  const dateMatch = lower.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);
  if (dateMatch) selected.push(dateMatch[0]);

  const amountMatches = Array.from(lower.matchAll(/\$?\s*([0-9][0-9,]*\.[0-9]{2})/g)).map((m) => m[1]);
  if (amountMatches.length > 0) {
    const normalized = amountMatches.map((v) => ({ raw: v, num: Number(v.replace(/,/g, "")) }));
    normalized.sort((a, b) => b.num - a.num);
    selected.push(`$${normalized[0].raw}`);
  }

  if (selected.length === 0) {
    const words = cleaned
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2);
    return words.slice(0, 6).join(" ");
  }

  return selected.slice(0, 6).join(" ");
}

async function detectCode39FromPdf(pdfPath: string) {
  const configuredTemplate = process.env.BARCODE_READ_COMMAND;
  const defaultScript = resolveServerScript("read-code39.py");
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
  const defaultScript = resolveServerScript("read-code39.py");
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

async function detectMetadataFromPdf(pdfPath: string): Promise<ExtractedMetadata> {
  const defaultScript = resolveServerScript("read-key-fields.py");
  const fallbackTemplate = `python "${defaultScript}" "{input}"`;
  const commandTemplate = process.env.OCR_READ_COMMAND || fallbackTemplate;
  const empty: ExtractedMetadata = {
    docDate: null,
    customerName: null,
    accountNumber: null,
    totalAmount: null,
    notes: null,
  };

  try {
    const command = commandTemplate.replaceAll("{input}", pdfPath);
    const { stdout, stderr } = await execAsync(command, {
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10,
    });
    const parsed = parseJsonObject(stdout || "") || parseJsonObject(stderr || "");
    if (!parsed) {
      console.warn("[ocr] metadata parser returned non-JSON output");
      return empty;
    }
    return {
      docDate: typeof parsed.docDate === "string" ? parsed.docDate : null,
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : null,
      accountNumber: typeof parsed.accountNumber === "string" ? parsed.accountNumber : null,
      totalAmount: typeof parsed.totalAmount === "string" ? parsed.totalAmount : null,
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };
  } catch (error) {
    console.warn("[ocr] metadata extraction failed", error);
    return empty;
  }
}

async function writeWindowsShellProperties(pdfPath: string, metadata: ExtractedMetadata) {
  try {
    const bytes = fs.readFileSync(pdfPath);
    const doc = await PDFDocument.load(bytes);
    if (metadata.accountNumber) doc.setTitle(metadata.accountNumber);
    if (metadata.customerName) doc.setAuthor(metadata.customerName);
    if (metadata.docDate) doc.setSubject(metadata.docDate);
    const tags: string[] = [];
    if (metadata.totalAmount) tags.push(`amount:${metadata.totalAmount}`);
    if (metadata.notes) tags.push(metadata.notes.slice(0, 100));
    if (tags.length > 0) doc.setKeywords(tags);
    const out = await doc.save();
    fs.writeFileSync(pdfPath, out);
  } catch {
    return;
  }
}

async function upsertDocumentIndexForJob(job: {
  id: string;
  fileName: string;
  filePath: string;
  barcodeValue: string | null;
  docDate: string | null;
  customerName: string | null;
  accountNumber: string | null;
  totalAmount: string | null;
  notes: string | null;
  metadataJson: unknown;
}) {
  if (!job.barcodeValue) return;
  await storage.upsertDocumentIndex({
    barcodeValue: job.barcodeValue.toUpperCase(),
    fileName: job.fileName,
    filePath: job.filePath,
    scanJobId: job.id,
    docDate: job.docDate,
    customerName: job.customerName,
    accountNumber: job.accountNumber,
    totalAmount: job.totalAmount,
    notes: job.notes,
    metadataJson: (job.metadataJson ?? null) as any,
  });
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

  app.get("/api/index", async (req, res) => {
    const barcode = String(req.query.barcode || "").trim().toUpperCase();
    const vendor = String(req.query.vendor || "").trim().toLowerCase();
    const keywords = String(req.query.keywords || "").trim().toLowerCase();
    const fromDate = String(req.query.fromDate || "").trim();
    const toDate = String(req.query.toDate || "").trim();

    let rows = await storage.getDocumentIndex();
    if (barcode) {
      rows = rows.filter((row) => (row.barcodeValue || "").toUpperCase().includes(barcode));
    }
    if (vendor) {
      rows = rows.filter((row) => (row.customerName || "").toLowerCase().includes(vendor));
    }
    if (fromDate) {
      rows = rows.filter((row) => !row.docDate || row.docDate >= fromDate);
    }
    if (toDate) {
      rows = rows.filter((row) => !row.docDate || row.docDate <= toDate);
    }
    if (keywords) {
      rows = rows.filter((row) => {
        const haystack = `${row.notes || ""} ${(row.accountNumber || "")} ${(row.fileName || "")}`.toLowerCase();
        return haystack.includes(keywords);
      });
    }

    const shaped = rows.map((row) => ({
      ...row,
      summary: summarizeNotes(row.notes),
    }));
    return res.json(shaped);
  });

  app.get("/api/index/:barcode", async (req, res) => {
    const row = await storage.getDocumentByBarcode(req.params.barcode);
    if (!row) return res.status(404).json({ message: "Barcode not found" });
    res.json(row);
  });

  app.post("/api/index/rebuild", async (_req, res) => {
    const jobs = await storage.getScanJobs();
    const bestByBarcode = new Map<string, typeof jobs[number]>();
    for (const job of jobs) {
      if (!job.barcodeValue) continue;
      const barcode = job.barcodeValue.toUpperCase();
      const current = bestByBarcode.get(barcode);
      const score = [job.docDate, job.customerName, job.accountNumber, job.totalAmount, job.notes].filter(Boolean).length;
      if (!current) {
        bestByBarcode.set(barcode, job);
        continue;
      }
      const currentScore = [current.docDate, current.customerName, current.accountNumber, current.totalAmount, current.notes].filter(Boolean).length;
      if (score > currentScore) {
        bestByBarcode.set(barcode, job);
      }
    }

    let count = 0;
    for (const job of Array.from(bestByBarcode.values())) {
      await upsertDocumentIndexForJob(job);
      count += 1;
    }
    res.json({ indexed: count });
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getScanJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  });

  app.patch("/api/jobs/:id/metadata", async (req, res) => {
    const job = await storage.getScanJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const payload = req.body || {};
    const metadata: ExtractedMetadata = {
      docDate: payload.docDate ? String(payload.docDate) : null,
      customerName: payload.customerName ? String(payload.customerName) : null,
      accountNumber: payload.accountNumber ? String(payload.accountNumber) : null,
      totalAmount: payload.totalAmount ? String(payload.totalAmount) : null,
      notes: payload.notes ? String(payload.notes) : null,
      approved: Boolean(payload.approved),
    };
    if (!metadata.notes || !metadata.notes.trim()) {
      return res.status(400).json({ message: "Description is required before saving metadata" });
    }

    const updated = await storage.updateScanJob(req.params.id, {
      docDate: metadata.docDate,
      customerName: metadata.customerName,
      accountNumber: metadata.accountNumber,
      totalAmount: metadata.totalAmount,
      notes: metadata.notes,
      metadataJson: metadata,
    });
    if (!updated) return res.status(404).json({ message: "Job not found" });
    await upsertDocumentIndexForJob(updated);

    const outputPath = path.join(OUTPUT_DIR, updated.fileName);
    if (fs.existsSync(outputPath)) {
      await writeWindowsShellProperties(outputPath, metadata);
    }
    if (updated.filePath && fs.existsSync(updated.filePath)) {
      await writeWindowsShellProperties(updated.filePath, metadata);
    }

    res.json(updated);
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

  app.delete("/api/jobs/by-barcode/:barcode", async (req, res) => {
    const barcode = String(req.params.barcode || "").trim().toUpperCase();
    if (!barcode) return res.status(400).json({ message: "Barcode is required" });

    const indexed = await storage.getDocumentByBarcode(barcode);
    let job = indexed ? await storage.getScanJob(indexed.scanJobId) : undefined;
    if (!job) {
      const jobs = await storage.getScanJobs();
      job = jobs.find((item) => String(item.barcodeValue || "").toUpperCase() === barcode);
    }
    if (!job) return res.status(404).json({ message: "Job not found" });

    const outputPath = path.join(OUTPUT_DIR, job.fileName);
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    await storage.deleteScanJob(job.id);
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
      const extractedMetadata = await detectMetadataFromPdf(outputPath);
      await writeWindowsShellProperties(outputPath, extractedMetadata);
      ensureSaveToTargetDirectory(outputPath, fileName, settings.savePath);

      const job = await storage.createScanJob({
        fileName,
        filePath: `${settings.savePath}${fileName}`,
        pageCount: pdfDoc.getPageCount(),
        fileSize: pdfBytes.length,
        barcodeValue: barcodeValue || null,
        docDate: extractedMetadata.docDate,
        customerName: extractedMetadata.customerName,
        accountNumber: extractedMetadata.accountNumber,
        totalAmount: extractedMetadata.totalAmount,
        notes: extractedMetadata.notes,
        metadataJson: extractedMetadata,
        scannerName: scannerName || "Sharp MX-M503N",
        dpi: dpi || "300",
        colorMode: colorMode || "color",
        duplex: duplex === "true",
      });
      await upsertDocumentIndexForJob(job);

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
        const extractedMetadata = await detectMetadataFromPdf(outputPath);
        await writeWindowsShellProperties(outputPath, extractedMetadata);
        ensureSaveToTargetDirectory(outputPath, fileName, settings.savePath);

        const stats = fs.statSync(outputPath);
        const job = await storage.createScanJob({
          fileName,
          filePath: `${settings.savePath}${fileName}`,
          pageCount: segmentPdf.getPageCount(),
          fileSize: Number(stats.size),
          barcodeValue: segment.code,
          docDate: extractedMetadata.docDate,
          customerName: extractedMetadata.customerName,
          accountNumber: extractedMetadata.accountNumber,
          totalAmount: extractedMetadata.totalAmount,
          notes: extractedMetadata.notes,
          metadataJson: extractedMetadata,
          scannerName: resolvedScannerName,
          dpi: String(dpi || settings.defaultDpi || "300"),
          colorMode: String(colorMode || settings.defaultColorMode || "color"),
          duplex: duplex === true || duplex === "true",
        });
        await upsertDocumentIndexForJob(job);
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

  app.get("/api/jobs/:id/open", async (req, res) => {
    const job = await storage.getScanJob(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const outputPath = path.join(OUTPUT_DIR, job.fileName);
    const targetPath = job.filePath || "";
    const filePath = fs.existsSync(outputPath)
      ? outputPath
      : (targetPath && fs.existsSync(targetPath) ? targetPath : "");
    if (!filePath) {
      return res.status(404).json({ message: "File not found on disk" });
    }

    res.setHeader("Content-Disposition", `inline; filename="${job.fileName}"`);
    res.type("application/pdf");
    res.sendFile(filePath);
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
