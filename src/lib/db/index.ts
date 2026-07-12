import { promises as fs } from "fs";
import path from "path";
import type { ClassifiedTransaction, TaxReport } from "../tax/types";

/**
 * Storage interface TaxForge codes against. The demo ships a local JSON
 * file driver so `npm run dev` needs zero external services. Set
 * DB_DRIVER=supabase and implement the Supabase branch below (client
 * construction is intentionally left as the one integration point a team
 * would touch to go to production) to persist to Postgres instead — nothing
 * else in the app imports fs/paths directly.
 */
export interface TaxForgeStore {
  getTransactions(walletAddress: string): Promise<ClassifiedTransaction[]>;
  saveTransactions(walletAddress: string, txs: ClassifiedTransaction[]): Promise<void>;
  getReports(walletAddress: string): Promise<TaxReport[]>;
  saveReport(report: TaxReport): Promise<void>;
}

const DATA_DIR = path.join(process.cwd(), "data");

class JsonFileStore implements TaxForgeStore {
  private async readJson<T>(file: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(file: string, data: unknown): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf8");
  }

  async getTransactions(walletAddress: string): Promise<ClassifiedTransaction[]> {
    const all = await this.readJson<Record<string, ClassifiedTransaction[]>>("transactions.json", {});
    return all[walletAddress.toLowerCase()] ?? [];
  }

  async saveTransactions(walletAddress: string, txs: ClassifiedTransaction[]): Promise<void> {
    const all = await this.readJson<Record<string, ClassifiedTransaction[]>>("transactions.json", {});
    all[walletAddress.toLowerCase()] = txs;
    await this.writeJson("transactions.json", all);
  }

  async getReports(walletAddress: string): Promise<TaxReport[]> {
    const all = await this.readJson<Record<string, TaxReport[]>>("reports.json", {});
    return all[walletAddress.toLowerCase()] ?? [];
  }

  async saveReport(report: TaxReport): Promise<void> {
    const all = await this.readJson<Record<string, TaxReport[]>>("reports.json", {});
    const key = report.walletAddress.toLowerCase();
    all[key] = [...(all[key] ?? []).filter((r) => r.id !== report.id), report];
    await this.writeJson("reports.json", all);
  }
}

// class SupabaseStore implements TaxForgeStore { ... }  // <- swap-in point for prod

let store: TaxForgeStore | null = null;
export function getStore(): TaxForgeStore {
  if (!store) store = new JsonFileStore();
  return store;
}
