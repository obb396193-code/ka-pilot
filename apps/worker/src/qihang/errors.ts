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

export class QihangProtocolError extends QihangError {
  constructor(readonly diagnostic: string) { super(`Qihang transient protocol error: ${diagnostic}`); }
}

export class QihangSuspectedTruncationError extends QihangError {
  readonly code = "SUSPECTED_TRUNCATION";

  constructor(
    readonly rowCount: number,
    readonly threshold: number,
  ) {
    super(`Qihang ad response exactly hit suspected truncation boundary ${threshold}`);
  }
}

export class RetryExhaustedError extends QihangError {
  constructor(
    readonly attempts: number,
    options?: ErrorOptions,
  ) {
    const diagnostic = options?.cause instanceof QihangProtocolError ? `: ${options.cause.diagnostic}` : "";
    super(`Qihang request failed after ${attempts} attempts${diagnostic}`, options);
  }
}
