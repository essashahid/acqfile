import { z } from "zod";

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // PostgreSQL; use a direct Neon connection for session locks.
  DATABASE_URL: z.string().default("postgres://localhost:5432/acqfile"),
  TEST_DATABASE_URL: z.string().default("postgres://localhost:5432/acqfile_test"),
  ACQFILE_DB: z.enum(["default", "test"]).default("default"),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("sources"),

  // OpenAI
  LLM_PROVIDER: z.enum(["openai", "mock"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EXTRACT_MODEL: z.string().default("gpt-5.6-luna"),
  OPENAI_VERIFY_MODEL: z.string().default("gpt-5.6-terra"),

  // Inngest
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  JOB_DRIVER: z.enum(["inngest", "inline"]).default("inline"),

  // Pipeline / prompt versions
  PIPELINE_VERSION: z.string().default("acqfile-0"),

  // Thresholds
  AUTO_ACCEPT_THRESHOLD: z.coerce.number().default(0.86),
  REVIEW_THRESHOLD: z.coerce.number().default(0.65),

  // Limits and retries
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  MAX_DOCUMENT_PAGES: z.coerce.number().int().default(50),
  LLM_MAX_RETRIES: z.coerce.number().int().default(3),
  RETRY_DELAYS_MS: z.string().default("2000,8000,30000"),

  REAL_DATA_MODE: z.enum(["false"]).default("false"),

  // Demo mode
  PUBLIC_DEMO_MODE: boolish,
  DEMO_MUTATIONS_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === "" || v === "1" || v === "true"),
  DEMO_ADMIN_EMAIL: z.string().default("admin@example.com"),
  DEMO_ADMIN_PASSWORD: z.string().default("acqfile-admin"),
  DEMO_REVIEWER_EMAIL: z.string().default("reviewer@example.com"),
  DEMO_REVIEWER_PASSWORD: z.string().default("acqfile-reviewer"),
  DEMO_VIEWER_EMAIL: z.string().default("viewer@example.com"),
  DEMO_VIEWER_PASSWORD: z.string().default("acqfile-viewer"),

  // Failure injection: "<step>" or "<step>:<attempts>" (applies to every new run; tests use run config instead)
  FAILURE_INJECTION_STEP: z.string().optional(),

  // Database-backed sessions and private Blob storage are supported in production.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "supabase", "blob"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default(".data/storage"),
  AUTH_DRIVER: z.enum(["local", "database", "supabase"]).default("local"),
  AUTH_SECRET: z.string().default("acqfile-dev-secret-change-me"),

  ACQFILE_DEBUG: boolish,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Parse and cache the environment. Throws with a readable message on invalid values. */
export function env(): Env {
  if (cached) return cached;
  // A35: a public demo may only show originals because every file is synthetic.
  if (["1", "true"].includes(process.env.REAL_DATA_MODE ?? "") && ["1", "true"].includes(process.env.PUBLIC_DEMO_MODE ?? ""))
    throw new Error("REAL_DATA_MODE=true cannot be combined with PUBLIC_DEMO_MODE=true: public visitors may only preview synthetic originals (A35).");
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`);
  const e = parsed.data;
  if (typeof window === "undefined" && e.LLM_PROVIDER === "openai" && !e.OPENAI_API_KEY && e.NODE_ENV !== "test") {
    // Startup validation: the real provider needs a key. Surfaced once, loudly.
    console.warn("[acqfile] LLM_PROVIDER=openai but OPENAI_API_KEY is empty; model calls will fail until it is set.");
  }
  if (e.AUTH_DRIVER === "supabase" && (!e.NEXT_PUBLIC_SUPABASE_URL || !e.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    throw new Error("AUTH_DRIVER=supabase requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (e.STORAGE_DRIVER === "supabase" && (!e.NEXT_PUBLIC_SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY)) throw new Error("Supabase storage credentials are missing");
  if (new URL(e.DATABASE_URL).port === "6543" || new URL(e.DATABASE_URL).hostname.includes("-pooler.")) throw new Error("Use a direct database connection; transaction pooling is incompatible with pipeline advisory locks.");
  if (process.env.VERCEL && process.env.NEXT_PHASE !== "phase-production-build") {
    if (e.AUTH_DRIVER === "local" || e.STORAGE_DRIVER === "local" || e.JOB_DRIVER !== "inngest") throw new Error("Vercel requires production authentication, persistent storage and Inngest jobs.");
    if (e.AUTH_DRIVER === "database" && e.AUTH_SECRET.length < 48) throw new Error("Database authentication requires a random AUTH_SECRET of at least 48 characters.");
    if (e.LLM_PROVIDER === "openai" && !e.OPENAI_API_KEY) throw new Error("OpenAI production key is missing.");
  }
  if (e.STORAGE_DRIVER === "blob" && !e.BLOB_READ_WRITE_TOKEN) throw new Error("Private Blob storage requires BLOB_READ_WRITE_TOKEN.");
  cached = e;
  return e;
}

export function databaseUrl(): string {
  const e = env();
  if (e.ACQFILE_DB === "test" || e.NODE_ENV === "test") return e.TEST_DATABASE_URL;
  return e.DATABASE_URL;
}

export function retryDelaysMs(): number[] {
  return env()
    .RETRY_DELAYS_MS.split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

/** FAILURE_INJECTION_STEP parsed into the run-config shape. */
export function failureInjectionFromEnv(): { step: string; attempts: number } | undefined {
  const raw = env().FAILURE_INJECTION_STEP?.trim();
  if (!raw) return undefined;
  const [step, attempts] = raw.split(":");
  return { step: step!, attempts: Number(attempts ?? 1) || 1 };
}

export function resetEnvCache() {
  cached = null;
}

/** Reads remain available while the background service is being connected. */
export function jobsConfigured(): boolean {
  const e = env();
  return e.JOB_DRIVER === "inline" || Boolean(e.INNGEST_EVENT_KEY && e.INNGEST_SIGNING_KEY);
}
