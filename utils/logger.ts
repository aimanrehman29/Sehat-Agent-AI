/**
 * ─────────────────────────────────────────────────────────────────────────────
 * logger.ts — Simple console/file logging for demo purposes.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Provides structured, leveled logging across all agent modules.
 * In production, swap with Winston or Pino for file rotation and
 * structured JSON output.
 *
 * Usage:
 *   import { logger } from "../utils/logger";
 *   logger.info("Processing image", { requestId: "abc-123" });
 *   logger.error("OCR failed", { error: "timeout" });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? "debug";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("debug")) {
      console.debug(`[${formatTimestamp()}] [DEBUG] ${message}`, meta ?? "");
    }
  },

  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("info")) {
      console.info(`[${formatTimestamp()}] [INFO]  ${message}`, meta ?? "");
    }
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("warn")) {
      console.warn(`[${formatTimestamp()}] [WARN]  ${message}`, meta ?? "");
    }
  },

  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("error")) {
      console.error(`[${formatTimestamp()}] [ERROR] ${message}`, meta ?? "");
    }
  },
};
