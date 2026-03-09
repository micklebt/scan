import {
  type ScannerConfig, type InsertScannerConfig,
  type AppSettings, type InsertAppSettings,
  type ScanJob, type InsertScanJob,
  scannerConfigs, appSettings, scanJobs,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, ilike } from "drizzle-orm";

export interface IStorage {
  getScannerConfigs(): Promise<ScannerConfig[]>;
  getScannerConfig(id: string): Promise<ScannerConfig | undefined>;
  createScannerConfig(config: InsertScannerConfig): Promise<ScannerConfig>;
  updateScannerConfig(id: string, config: Partial<InsertScannerConfig>): Promise<ScannerConfig | undefined>;
  deleteScannerConfig(id: string): Promise<boolean>;

  getAppSettings(): Promise<AppSettings>;
  updateAppSettings(settings: Partial<InsertAppSettings>): Promise<AppSettings>;
  incrementSeqNumber(): Promise<number>;

  getScanJobs(search?: string): Promise<ScanJob[]>;
  getScanJob(id: string): Promise<ScanJob | undefined>;
  createScanJob(job: InsertScanJob): Promise<ScanJob>;
  deleteScanJob(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getScannerConfigs(): Promise<ScannerConfig[]> {
    return db.select().from(scannerConfigs);
  }

  async getScannerConfig(id: string): Promise<ScannerConfig | undefined> {
    const [config] = await db.select().from(scannerConfigs).where(eq(scannerConfigs.id, id));
    return config;
  }

  async createScannerConfig(config: InsertScannerConfig): Promise<ScannerConfig> {
    if (config.isDefault) {
      await db.update(scannerConfigs).set({ isDefault: false });
    }
    const [created] = await db.insert(scannerConfigs).values(config).returning();
    return created;
  }

  async updateScannerConfig(id: string, config: Partial<InsertScannerConfig>): Promise<ScannerConfig | undefined> {
    if (config.isDefault) {
      await db.update(scannerConfigs).set({ isDefault: false });
    }
    const [updated] = await db.update(scannerConfigs).set(config).where(eq(scannerConfigs.id, id)).returning();
    return updated;
  }

  async deleteScannerConfig(id: string): Promise<boolean> {
    const result = await db.delete(scannerConfigs).where(eq(scannerConfigs.id, id)).returning();
    return result.length > 0;
  }

  async getAppSettings(): Promise<AppSettings> {
    const [settings] = await db.select().from(appSettings);
    if (!settings) {
      const [created] = await db.insert(appSettings).values({}).returning();
      return created;
    }
    return settings;
  }

  async updateAppSettings(settings: Partial<InsertAppSettings>): Promise<AppSettings> {
    const current = await this.getAppSettings();
    const [updated] = await db.update(appSettings).set(settings).where(eq(appSettings.id, current.id)).returning();
    return updated;
  }

  async incrementSeqNumber(): Promise<number> {
    const current = await this.getAppSettings();
    const next = current.lastSeqNumber + 1;
    await db.update(appSettings).set({ lastSeqNumber: next }).where(eq(appSettings.id, current.id));
    return next;
  }

  async getScanJobs(search?: string): Promise<ScanJob[]> {
    if (search) {
      return db.select().from(scanJobs).where(ilike(scanJobs.fileName, `%${search}%`)).orderBy(desc(scanJobs.createdAt));
    }
    return db.select().from(scanJobs).orderBy(desc(scanJobs.createdAt));
  }

  async getScanJob(id: string): Promise<ScanJob | undefined> {
    const [job] = await db.select().from(scanJobs).where(eq(scanJobs.id, id));
    return job;
  }

  async createScanJob(job: InsertScanJob): Promise<ScanJob> {
    const [created] = await db.insert(scanJobs).values(job).returning();
    return created;
  }

  async deleteScanJob(id: string): Promise<boolean> {
    const result = await db.delete(scanJobs).where(eq(scanJobs.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
