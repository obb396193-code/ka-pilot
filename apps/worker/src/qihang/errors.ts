export class QihangError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class BlockedAuthError extends QihangError {
  readonly code = "BLOCKED_AUTH";
}

export class QihangHttpError extends QihangError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class QihangBusinessError extends QihangError {
  constructor(
    readonly businessCode: string | null,
    message: string,
  ) {
    super(message);
  }
}

export class QihangResourceLimitError extends QihangError {
  readonly code = "RESOURCE_LIMIT";
}

export class RetryExhaustedError extends QihangError {
  constructor(
    readonly attempts: number,
    options?: ErrorOptions,
  ) {
    super(`Qihang request failed after ${attempts} attempts`, options);
  }
}
