/**
 * Structured JSON logger with correlation IDs.
 *
 * Usage:
 *   const log = createLogger("webhook");
 *   log.info("Payment confirmed", { registrationId, amount });
 *   log.error("Webhook failed", { error: err.message, stripeEventId });
 *
 * In request handlers, use createRequestLogger(request) to auto-extract
 * a correlation ID from the x-request-id header or generate one.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

interface LogEntry {
  level: LogLevel;
  service: string;
  message: string;
  correlationId?: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function emit(entry: LogEntry): void {
  const { level, ...rest } = entry;
  const json = JSON.stringify(rest);

  switch (level) {
    case "debug":
      console.debug(json);
      break;
    case "info":
      console.log(json);
      break;
    case "warn":
      console.warn(json);
      break;
    case "error":
      console.error(json);
      break;
  }
}

export interface Logger {
  debug(message: string, ctx?: LogContext): void;
  info(message: string, ctx?: LogContext): void;
  warn(message: string, ctx?: LogContext): void;
  error(message: string, ctx?: LogContext): void;
  child(extra: LogContext): Logger;
}

export function createLogger(service: string, correlationId?: string, baseCtx?: LogContext): Logger {
  function log(level: LogLevel, message: string, ctx?: LogContext): void {
    if (!shouldLog(level)) return;
    emit({
      level,
      service,
      message,
      ...(correlationId ? { correlationId } : {}),
      ...baseCtx,
      ...ctx,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    child: (extra) => createLogger(service, correlationId, { ...baseCtx, ...extra }),
  };
}

/**
 * Create a logger scoped to an incoming request.
 * Extracts or generates a correlation ID for request tracing.
 */
export function createRequestLogger(request: Request, service: string): Logger {
  const correlationId =
    request.headers.get("x-request-id") ||
    request.headers.get("x-correlation-id") ||
    crypto.randomUUID();

  return createLogger(service, correlationId);
}
