import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const scannerConfigs = pgTable("scanner_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
});

export const insertScannerConfigSchema = createInsertSchema(scannerConfigs).omit({ id: true });
export type InsertScannerConfig = z.infer<typeof insertScannerConfigSchema>;
export type ScannerConfig = typeof scannerConfigs.$inferSelect;

export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  savePath: text("save_path").notNull().default("f:\\scan-images\\"),
  barcodePrefix: text("barcode_prefix").notNull().default("B"),
  lastSeqNumber: integer("last_seq_number").notNull().default(1),
  defaultDpi: text("default_dpi").notNull().default("300"),
  defaultColorMode: text("default_color_mode").notNull().default("color"),
  defaultPaperSize: text("default_paper_size").notNull().default("letter"),
  defaultSource: text("default_source").notNull().default("feeder"),
  defaultDuplex: boolean("default_duplex").notNull().default(false),
});

export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({ id: true });
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type AppSettings = typeof appSettings.$inferSelect;

export const scanJobs = pgTable("scan_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  fileSize: integer("file_size").notNull().default(0),
  barcodeValue: text("barcode_value"),
  scannerName: text("scanner_name").notNull(),
  dpi: text("dpi").notNull(),
  colorMode: text("color_mode").notNull(),
  duplex: boolean("duplex").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScanJobSchema = createInsertSchema(scanJobs).omit({ id: true, createdAt: true });
export type InsertScanJob = z.infer<typeof insertScanJobSchema>;
export type ScanJob = typeof scanJobs.$inferSelect;
