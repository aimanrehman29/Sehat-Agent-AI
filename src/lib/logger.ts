/**
 * Structured logger for Sehat-Agent AI.
 * Provides consistent, leveled logging across all agent modules.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

const currentLevel: LogLevel =
  LOG_LEVEL_MAP[process.env.LOG_LEVEL ?? "debug"] ?? LogLevel.DEBUG;

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(
  level: string,
  module: string,
  message: string,
  meta?: Record<string, unknown>
): string {
  const ts = formatTimestamp();
  const base = `[${ts}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

/**
 * Create a scoped logger instance for a specific module.
 *
 * @example
 * const log = createLogger("pharma-check");
 * log.info("Processing image", { requestId: "abc-123" });
 */
export function createLogger(module: string) {
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      if (currentLevel <= LogLevel.DEBUG) {
        console.debug(formatMessage("debug", module, message, meta));
      }
    },

    info(message: string, meta?: Record<string, unknown>) {
      if (currentLevel <= LogLevel.INFO) {
        console.info(formatMessage("info", module, message, meta));
      }
    },

    warn(message: string, meta?: Record<string, unknown>) {
      if (currentLevel <= LogLevel.WARN) {
        console.warn(formatMessage("warn", module, message, meta));
      }
    },

    error(message: string, meta?: Record<string, unknown>) {
      if (currentLevel <= LogLevel.ERROR) {
        console.error(formatMessage("error", module, message, meta));
      }
    },
  };
}

/** Default logger for general use */
export const logger = createLogger("sehat-agent");
