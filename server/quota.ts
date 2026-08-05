import { Database } from "bun:sqlite";
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { ApiError } from "./validation";

export type QuotaOperation = "chat" | "speech" | "realtime" | "avatar";
export type IdentitySource = "forwarded" | "shared";
export const REALTIME_SESSION_MINUTES = 10;
/**
 * Avatar minutes are reserved up front, because Anam bills wall-clock from
 * session start to session end regardless of who is speaking.
 *
 * Deliberately shorter than REALTIME_SESSION_MINUTES: the avatar demotes to
 * voice-only at this ceiling while the conversation continues to the realtime
 * limit. On a 30 minute/month plan a 10-minute avatar would buy three sessions
 * a month; five buys six. The client enforces the same number — it is
 * advertised on /api/health rather than duplicated as a client constant, so
 * the reserved and enforced budgets cannot drift apart.
 */
export const AVATAR_SESSION_MINUTES = 5;
export const QUOTA_OPERATIONS: readonly QuotaOperation[] = [
  "chat",
  "speech",
  "realtime",
  "avatar",
];

interface LimitDefinition {
  perIpAmount: number;
  perIpWindowSeconds: number;
  globalAmount: number;
  globalWindowSeconds: number;
}

export const QUOTA_LIMITS: Record<QuotaOperation, LimitDefinition> = {
  chat: {
    perIpAmount: 20,
    perIpWindowSeconds: 60 * 60,
    globalAmount: 500,
    globalWindowSeconds: 24 * 60 * 60,
  },
  speech: {
    perIpAmount: 30,
    perIpWindowSeconds: 60 * 60,
    globalAmount: 1_000,
    globalWindowSeconds: 24 * 60 * 60,
  },
  realtime: {
    perIpAmount: 60,
    perIpWindowSeconds: 24 * 60 * 60,
    globalAmount: 600,
    globalWindowSeconds: 24 * 60 * 60,
  },
  // Sized against the vendor plan's MONTHLY allowance, not a daily blast radius.
  // The Anam Free plan grants 30 minutes/month and exposes no spend cap, so this
  // ceiling is the only cost control that exists — a daily window would permit
  // several months of allowance to be spent in a single day. The 10-minute
  // shortfall against the plan is deliberate headroom for operator smoke tests,
  // which talk to the vendor directly and never pass through this engine.
  //
  // The 30-day window tumbles from the Unix epoch and does not align with the
  // vendor billing month, so a boundary straddle can exceed the plan allowance.
  // Confirmed with the operator 2026-08-05: Free hard-stops at 30 minutes and
  // cannot bill overage, so a straddle costs nothing — the vendor refuses the
  // session and FallbackAudioSink demotes to voice-only. This stays at 20.
  avatar: {
    perIpAmount: AVATAR_SESSION_MINUTES,
    perIpWindowSeconds: 24 * 60 * 60,
    globalAmount: 20,
    globalWindowSeconds: 30 * 24 * 60 * 60,
  },
};

const GLOBAL_BUCKET = "__global__";
const SHARED_IDENTITY = "shared-anonymous";

function createCountersTable(name: string): string {
  const operations = QUOTA_OPERATIONS.map((operation) => `'${operation}'`).join(", ");
  return `
    CREATE TABLE IF NOT EXISTS ${name} (
      bucket_hash TEXT NOT NULL CHECK (
        bucket_hash = '${GLOBAL_BUCKET}' OR
        (length(bucket_hash) = 64 AND bucket_hash NOT GLOB '*[^0-9a-f]*')
      ),
      operation TEXT NOT NULL CHECK (operation IN (${operations})),
      window_start INTEGER NOT NULL,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      expires_at INTEGER NOT NULL CHECK (expires_at > window_start),
      PRIMARY KEY (bucket_hash, operation, window_start)
    )
  `;
}

interface CounterRow {
  amount: number;
}

interface ReservationPart {
  bucketHash: string;
  operation: QuotaOperation;
  windowStart: number;
  amount: number;
}

export interface QuotaReservation {
  identitySource: IdentitySource;
  rollback: () => void;
}

function windowStart(nowSeconds: number, windowSeconds: number): number {
  return Math.floor(nowSeconds / windowSeconds) * windowSeconds;
}

function normalizeAddress(raw: string): string | null {
  let value = raw.trim().replace(/^for=/iu, "").replace(/^"|"$/gu, "");
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 0) value = value.slice(1, end);
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/u.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }
  return isIP(value) ? value.toLowerCase() : null;
}

export function extractClientAddress(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const entries = forwardedFor.split(",");
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const address = normalizeAddress(entries[index]);
    if (address) return address;
  }
  return null;
}

function loadOrCreateSalt(dataDirectory: string): Buffer {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  const saltPath = join(dataDirectory, "quota-salt");
  if (existsSync(saltPath)) {
    const value = readFileSync(saltPath, "utf8").trim();
    if (/^[0-9a-f]{64}$/u.test(value)) return Buffer.from(value, "hex");
    throw new Error("Quota salt is invalid.");
  }
  const salt = randomBytes(32);
  writeFileSync(saltPath, salt.toString("hex"), { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(saltPath, 0o600);
  return salt;
}

export class QuotaEngine {
  private readonly database: Database;
  private readonly salt: Buffer;

  constructor(
    dataDirectory: string,
    private readonly limits: Record<QuotaOperation, LimitDefinition> = QUOTA_LIMITS
  ) {
    this.salt = loadOrCreateSalt(dataDirectory);
    this.database = new Database(join(dataDirectory, "quota.sqlite"), { create: true });
    this.database.run("PRAGMA journal_mode = WAL");
    this.database.run("PRAGMA busy_timeout = 5000");
    this.database.run(createCountersTable("quota_counters"));
    this.migrateOperationCheck();
    this.cleanupExpired();
  }

  /**
   * The operation CHECK constraint is baked into the table definition, so
   * `CREATE TABLE IF NOT EXISTS` leaves a pre-existing database rejecting any
   * newly added operation. Rebuild the table when its recorded SQL predates the
   * current operation set.
   */
  private migrateOperationCheck(): void {
    const row = this.database
      .query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'quota_counters'")
      .get() as { sql?: string } | null;
    const sql = row?.sql ?? "";
    if (QUOTA_OPERATIONS.every((operation) => sql.includes(`'${operation}'`))) return;

    this.database.run("BEGIN IMMEDIATE");
    try {
      this.database.run(createCountersTable("quota_counters_migrated"));
      this.database.run(`
        INSERT OR IGNORE INTO quota_counters_migrated
          (bucket_hash, operation, window_start, amount, expires_at)
        SELECT bucket_hash, operation, window_start, amount, expires_at
        FROM quota_counters
        WHERE operation IN (${QUOTA_OPERATIONS.map((operation) => `'${operation}'`).join(", ")})
      `);
      this.database.run("DROP TABLE quota_counters");
      this.database.run("ALTER TABLE quota_counters_migrated RENAME TO quota_counters");
      this.database.run("COMMIT");
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }
  }

  identify(request: Request): { bucketHash: string; source: IdentitySource } {
    const address = extractClientAddress(request.headers.get("x-forwarded-for"));
    const source: IdentitySource = address ? "forwarded" : "shared";
    const material = address ?? SHARED_IDENTITY;
    return {
      bucketHash: createHmac("sha256", this.salt).update(material).digest("hex"),
      source,
    };
  }

  reserve(
    request: Request,
    operation: QuotaOperation,
    amount = 1,
    nowSeconds = Math.floor(Date.now() / 1_000)
  ): QuotaReservation {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("Quota amount must be positive.");
    const identity = this.identify(request);
    const limit = this.limits[operation];
    const perIpStart = windowStart(nowSeconds, limit.perIpWindowSeconds);
    const globalStart = windowStart(nowSeconds, limit.globalWindowSeconds);
    const parts: ReservationPart[] = [
      { bucketHash: identity.bucketHash, operation, windowStart: perIpStart, amount },
      { bucketHash: GLOBAL_BUCKET, operation, windowStart: globalStart, amount },
    ];

    this.database.run("BEGIN IMMEDIATE");
    try {
      this.database.query("DELETE FROM quota_counters WHERE expires_at <= ?").run(nowSeconds);
      const perIpAmount = this.currentAmount(identity.bucketHash, operation, perIpStart);
      const globalAmount = this.currentAmount(GLOBAL_BUCKET, operation, globalStart);
      if (perIpAmount + amount > limit.perIpAmount) {
        throw new ApiError(429, "Per-user quota exhausted.", perIpStart + limit.perIpWindowSeconds - nowSeconds);
      }
      if (globalAmount + amount > limit.globalAmount) {
        throw new ApiError(429, "Daily service quota exhausted.", globalStart + limit.globalWindowSeconds - nowSeconds);
      }
      this.increment(parts[0], perIpStart + limit.perIpWindowSeconds);
      this.increment(parts[1], globalStart + limit.globalWindowSeconds);
      this.database.run("COMMIT");
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }

    let rolledBack = false;
    return {
      identitySource: identity.source,
      rollback: () => {
        if (rolledBack) return;
        rolledBack = true;
        this.database.run("BEGIN IMMEDIATE");
        try {
          for (const part of parts) {
            this.database
              .query(`
                UPDATE quota_counters
                SET amount = MAX(0, amount - ?)
                WHERE bucket_hash = ? AND operation = ? AND window_start = ?
              `)
              .run(part.amount, part.bucketHash, part.operation, part.windowStart);
          }
          this.database.run("DELETE FROM quota_counters WHERE amount = 0");
          this.database.run("COMMIT");
        } catch (error) {
          this.database.run("ROLLBACK");
          throw error;
        }
      },
    };
  }

  cleanupExpired(nowSeconds = Math.floor(Date.now() / 1_000)): void {
    this.database.query("DELETE FROM quota_counters WHERE expires_at <= ?").run(nowSeconds);
  }

  close(): void {
    this.database.close();
  }

  private currentAmount(bucketHash: string, operation: QuotaOperation, start: number): number {
    const row = this.database
      .query("SELECT amount FROM quota_counters WHERE bucket_hash = ? AND operation = ? AND window_start = ?")
      .get(bucketHash, operation, start) as CounterRow | null;
    return row?.amount ?? 0;
  }

  private increment(part: ReservationPart, expiresAt: number): void {
    this.database
      .query(`
        INSERT INTO quota_counters (bucket_hash, operation, window_start, amount, expires_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(bucket_hash, operation, window_start)
        DO UPDATE SET amount = amount + excluded.amount, expires_at = excluded.expires_at
      `)
      .run(part.bucketHash, part.operation, part.windowStart, part.amount, expiresAt);
  }
}
