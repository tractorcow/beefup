/**
 * Application error that carries a process exit code for the CLI.
 */
export class BeefupError extends Error {
  readonly exitCode: number;

  /**
   * Creates a BeefupError with a user-facing message and optional exit code.
   */
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "BeefupError";
    this.exitCode = exitCode;
  }
}
