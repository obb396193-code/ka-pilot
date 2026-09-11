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

/** 2xx 但 content-type 不是 JSON（网关拦截页等）：确定性失败，不重试。F-OS-005。 */
export class QihangUnexpectedContentTypeError extends QihangError {
  readonly code = "UNEXPECTED_CONTENT_TYPE";

  constructor(
    readonly contentType: string,
    readonly bodyPreview: string,
  ) {
    super(`Qihang returned non-JSON content-type ${contentType}: ${bodyPreview}`);
  }
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
