import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertScannerConfigSchema, insertAppSettingsSchema } from "@shared/schema";
import { PDFDocument } from "pdf-lib";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const OUTPUT_DIR = path.join(process.cwd(), "scan-output");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

  // ── Next Sequence Number ───────────────────────────────
  app.get("/api/settings/next-seq", async (_req, res) => {
    const settings = await storage.getAppSettings();
    res.json({ nextSeq: settings.lastSeqNumber });
  });

  return httpServer;
}
