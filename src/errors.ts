export class BeefupError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "BeefupError";
    this.exitCode = exitCode;
  }
}
