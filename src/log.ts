import {
  DefaultLogLevel,
  LogLevels,
  type LogLevel,
} from "./config/types.js";

/** Prefixes for stderr log lines, matching existing `error:` / `warning:` CLI style. */
export const LogPrefixes = {
  Error: "error:",
  Warn: "warning:",
  Info: "info:",
  Debug: "debug:",
} as const;

/** Numeric rank so a configured level includes all noisier levels below it. */
const LogLevelRank = {
  [LogLevels.Quiet]: 0,
  [LogLevels.Warn]: 1,
  [LogLevels.Info]: 2,
  [LogLevels.Debug]: 3,
} as const;

/** Writes one already-terminated log line (includes the trailing newline). */
export type LogWriter = (line: string) => void;

export interface CreateLoggerOptions {
  level: LogLevel;
  write?: LogWriter;
}

/**
 * Stderr logger used by the CLI. `timed` records step start and duration at info.
 */
export interface Logger {
  readonly level: LogLevel;
  /** Writes an error line. Always emitted, including at quiet. */
  error(message: string): void;
  /** Writes a warning line when the level is warn or higher. */
  warn(message: string): void;
  /** Writes an info line when the level is info or debug. */
  info(message: string): void;
  /** Writes a debug line when the level is debug. */
  debug(message: string): void;
  /**
   * Logs `label` before `fn` runs and again with elapsed time after it finishes.
   */
  timed<T>(label: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * Builds a logger that writes lines at or above `level`. Errors always write.
 * Default destination is stderr so reports on stdout stay clean.
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const write = options.write ?? defaultLogWriter;
  const rank = LogLevelRank[options.level];

  return {
    level: options.level,
    error(message) {
      write(`${LogPrefixes.Error} ${message}\n`);
    },
    warn(message) {
      if (rank >= LogLevelRank[LogLevels.Warn]) {
        write(`${LogPrefixes.Warn} ${message}\n`);
      }
    },
    info(message) {
      if (rank >= LogLevelRank[LogLevels.Info]) {
        write(`${LogPrefixes.Info} ${message}\n`);
      }
    },
    debug(message) {
      if (rank >= LogLevelRank[LogLevels.Debug]) {
        write(`${LogPrefixes.Debug} ${message}\n`);
      }
    },
    async timed(label, fn) {
      const started = performance.now();
      this.info(label);
      try {
        const result = await fn();
        this.info(`${label} (${formatDuration(performance.now() - started)})`);
        return result;
      } catch (error) {
        this.info(
          `${label} failed (${formatDuration(performance.now() - started)})`
        );
        throw error;
      }
    },
  };
}

/**
 * Writes a log line to stderr.
 */
function defaultLogWriter(line: string): void {
  process.stderr.write(line);
}

/**
 * Formats a millisecond duration for log lines (`12ms`, `1.5s`).
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Formats a byte count for log lines (`512 B`, `12.3 KiB`, `1.1 MiB`).
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

let activeLogger = createLogger({ level: DefaultLogLevel });

/**
 * Replaces the process-wide logger (used by git, the process runner, and commands).
 */
export function setLogger(logger: Logger): void {
  activeLogger = logger;
}

/**
 * Returns the process-wide logger configured by the CLI (warn by default).
 */
export function getLogger(): Logger {
  return activeLogger;
}
