import { FindingSeverities, type FindingSeverity } from "../security/classify.js";

/** Environment variables that enable or disable ANSI colour. */
export const ColorEnv = {
  NoColor: "NO_COLOR",
  ForceColor: "FORCE_COLOR",
} as const;

/** ANSI SGR codes used by the colour console report. */
export const Ansi = {
  Reset: "\x1b[0m",
  Bold: "\x1b[1m",
  Dim: "\x1b[2m",
  Red: "\x1b[31m",
  Green: "\x1b[32m",
  Yellow: "\x1b[33m",
  Blue: "\x1b[34m",
  Magenta: "\x1b[35m",
  Cyan: "\x1b[36m",
} as const;

/**
 * Returns whether ANSI colour should be emitted for console reports.
 * `NO_COLOR` wins; `FORCE_COLOR` enables colour when stdout is not a TTY.
 */
export function ansiColorEnabled(stdoutTty = process.stdout.isTTY): boolean {
  if (process.env[ColorEnv.NoColor]) {
    return false;
  }
  if (process.env[ColorEnv.ForceColor]) {
    return true;
  }
  return Boolean(stdoutTty);
}

/**
 * Wraps `text` in ANSI codes when colour is enabled.
 */
export function paint(
  codes: string | readonly string[],
  text: string,
  enabled: boolean
): string {
  if (!enabled || text.length === 0) {
    return text;
  }
  const prefix = typeof codes === "string" ? codes : codes.join("");
  return `${prefix}${text}${Ansi.Reset}`;
}

/**
 * Returns ANSI codes for a vulnerability severity (critical/high stand out).
 */
export function ansiForSeverity(severity: FindingSeverity): readonly string[] {
  switch (severity) {
    case FindingSeverities.Critical:
      return [Ansi.Bold, Ansi.Magenta];
    case FindingSeverities.High:
      return [Ansi.Bold, Ansi.Red];
    case FindingSeverities.Moderate:
      return [Ansi.Yellow];
    case FindingSeverities.Low:
      return [Ansi.Blue];
    case FindingSeverities.Info:
      return [Ansi.Dim];
  }
}
