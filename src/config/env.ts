import { z } from "zod";

/**
 * Environment variable schema — validated at application startup.
 * Ensures all required config is present before any agent module initializes.
 */
const envSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().url(),

  // OCR Provider
  OCR_PROVIDER: z.enum(["tesseract", "google_vision"]).default("tesseract"),
  GOOGLE_VISION_API_KEY: z.string().optional(),

  // AI / LLM
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),

  // Gemini (Track A follow-up chat + voice transcription)
  // Preferred over OPENAI_API_KEY when set.
  GEMINI_2_KEY: z.string().optional(),

  // Scheduling
  CRON_TIMEZONE: z.string().default("Asia/Karachi"),

  // Storage
  MEDIA_STORAGE_URL: z.string().url().default("http://localhost:3000/uploads"),

  // Track B / Orchestrator
  ORCHESTRATOR_URL: z.string().url().optional(),
  ORCHESTRATOR_API_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Logging
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("debug"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validated environment object.
 * Import this instead of using `process.env` directly.
 *
 * @example
 * import { env } from "@/config/env";
 * console.log(env.DATABASE_URL);
 */
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.format();
    const missingFields = Object.keys(formatted)
      .filter((k) => k !== "_errors")
      .join(", ");

    console.error(
      `[FATAL] Invalid environment configuration.\n` +
        `Missing or invalid fields: ${missingFields}\n` +
        `Run 'cp .env.example .env' and fill in your values.`
    );
    throw new Error(
      `Environment validation failed: ${missingFields}`
    );
  }

  return parsed.data;
}

export const env = loadEnv();
