import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import type { ClassifiedTransaction, TaxReport } from "../tax/types";
import { logEvent } from "../logging";

/**
 * Storage interface TaxForge codes against.
 *
 * Two real implementations ship here:
 *   - JsonFileStore    — zero-dependency local file store. Works for
 *     `npm run dev`. Do NOT rely on this in production on Vercel: the
 *     serverless filesystem is ephemeral outside /tmp, so writes vanish
 *     between invocations/cold starts.
 *   - UpstashRedisStore — real persistent storage via Upstash's REST API
 *     (works from any serverless runtime, no persistent connection needed).
 *     Selected automatically when UPSTASH_REDIS_REST_URL and
 *     UPSTASH_REDIS_REST_TOKEN are set. Free tier is sufficient to go live.
 *
 * getStore() picks the right one at call time — nothing else in the app
 * needs to know which is active.
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

class UpstashRedisStore implements TaxForgeStore {
  private redis: Redis;

  constructor() {
    this.redis = Redis.fromEnv();
  }

  private txKey(wallet: string) {
    return `taxforge:transactions:${wallet.toLowerCase()}`;
  }
  private reportsKey(wallet: string) {
    return `taxforge:reports:${wallet.toLowerCase()}`;
  }

  async getTransactions(walletAddress: string): Promise<ClassifiedTransaction[]> {
    const data = await this.redis.get<ClassifiedTransaction[]>(this.txKey(walletAddress));
    return data ?? [];
  }

  async saveTransactions(walletAddress: string, txs: ClassifiedTransaction[]): Promise<void> {
    await this.redis.set(this.txKey(walletAddress), txs);
  }

  async getReports(walletAddress: string): Promise<TaxReport[]> {
    const data = await this.redis.get<TaxReport[]>(this.reportsKey(walletAddress));
    return data ?? [];
  }

  async saveReport(report: TaxReport): Promise<void> {
    const key = this.reportsKey(report.walletAddress);
    const existing = (await this.redis.get<TaxReport[]>(key)) ?? [];
    const next = [...existing.filter((r) => r.id !== report.id), report];
    await this.redis.set(key, next);
  }
}

let store: TaxForgeStore | null = null;
let loggedBackend = false;

export function getStore(): TaxForgeStore {
  if (!store) {
    const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
    store = hasUpstash ? new UpstashRedisStore() : new JsonFileStore();
    if (!loggedBackend) {
      loggedBackend = true;
      logEvent({
        level: hasUpstash ? "info" : "warn",
        event: "storage_backend_selected",
        backend: hasUpstash ? "upstash-redis" : "json-file",
        message: hasUpstash
          ? undefined
          : "Using local JSON file storage — this does NOT persist reliably on Vercel serverless. Set UPSTASH_REDIS_REST_URL/TOKEN before going live.",
      });
    }
  }
  return store;
}
